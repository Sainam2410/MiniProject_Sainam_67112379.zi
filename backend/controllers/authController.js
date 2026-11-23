'use strict';
const bcrypt = require('bcrypt');
const config = require('../config');
const { pool } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { encrypt, decrypt } = require('../utils/crypto');
const { requireText, cleanText, isValidThaiPhone, isStrongPassword } = require('../utils/sanitize');
const { audit } = require('../utils/audit');
const { issueToken, clearToken } = require('../middleware/auth');

// hash หลอก ใช้เปรียบเทียบเมื่อไม่พบอีเมล เพื่อให้เวลาตอบสนองเท่ากัน (กัน user enumeration ผ่าน timing)
let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = bcrypt.hash('unifind-dummy-password!', config.bcryptRounds);
  return dummyHashPromise;
}

function isAllowedEmail(email) {
  const m = email.match(/^[a-z0-9._%+-]{1,64}@([a-z0-9.-]+\.[a-z]{2,})$/);
  if (!m) return false;
  const domain = m[1];
  return config.allowedEmailDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

function publicProfile(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    phone: decrypt(row.phone_enc, 'users.phone'),
    lineId: decrypt(row.line_id_enc, 'users.line_id'),
    createdAt: row.created_at,
  };
}

/** POST /api/auth/register */
async function register(req, res) {
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const studentId = String(b.studentId || '').trim().toUpperCase();
  const password = String(b.password || '');
  const firstName = requireText(b.firstName, 'ชื่อ', { max: 60 });
  const lastName = requireText(b.lastName, 'นามสกุล', { max: 60 });
  const phone = String(b.phone || '').replace(/[\s-]/g, '');
  const lineId = cleanText(b.lineId, { max: 40 });

  if (!isAllowedEmail(email)) {
    throw new HttpError(400, `กรุณาใช้อีเมลของมหาวิทยาลัย (@${config.allowedEmailDomains.join(', @')})`);
  }
  if (!/^[A-Z0-9]{5,12}$/.test(studentId)) throw new HttpError(400, 'รหัสนักศึกษา/รหัสบุคลากรไม่ถูกต้อง');
  if (!isStrongPassword(password)) {
    throw new HttpError(400, 'รหัสผ่านต้องมี 8-72 ตัวอักษร ประกอบด้วยตัวพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ');
  }
  if (b.confirmPassword !== undefined && b.confirmPassword !== password) {
    throw new HttpError(400, 'ยืนยันรหัสผ่านไม่ตรงกัน');
  }
  if (!isValidThaiPhone(phone)) throw new HttpError(400, 'เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0891234567)');
  if (lineId && !/^[A-Za-z0-9._-]{2,40}$/.test(lineId)) throw new HttpError(400, 'Line ID ไม่ถูกต้อง');

  const [dup] = await pool.execute('SELECT id FROM users WHERE email = ? OR student_id = ? LIMIT 1', [email, studentId]);
  if (dup.length) throw new HttpError(409, 'อีเมลหรือรหัสนักศึกษานี้ถูกใช้ลงทะเบียนแล้ว');

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const [result] = await pool.execute(
    `INSERT INTO users (student_id, email, password_hash, first_name, last_name, phone_enc, line_id_enc, role)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'user')`,
    [studentId, email, hash, firstName, lastName, encrypt(phone, 'users.phone'), encrypt(lineId || null, 'users.line_id')]
  );
  await audit(req, 'USER_REGISTERED', { entityType: 'user', entityId: result.insertId, userId: result.insertId });

  issueToken(res, { id: result.insertId, role: 'user', token_version: 0 });
  res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ ยินดีต้อนรับสู่ UniFind DPU 💜' });
}

/** POST /api/auth/login */
async function login(req, res) {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase().slice(0, 120);
  const password = String((req.body && req.body.password) || '').slice(0, 200);
  if (!email || !password) throw new HttpError(400, 'กรุณากรอกอีเมลและรหัสผ่าน');

  const [rows] = await pool.execute(
    `SELECT id, role, password_hash, is_active, token_version, failed_login_count, locked_until,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
       FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  const user = rows[0];
  const invalid = new HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');

  if (!user || !user.password_hash) {
    await bcrypt.compare(password, await dummyHash());
    if (user && !user.password_hash) {
      // eslint-disable-next-line no-console
      console.warn(`[auth] บัญชี ${email} ยังไม่มีรหัสผ่าน - รัน "npm run seed" เพื่อตั้งค่าบัญชีทดสอบ`);
    }
    await audit(req, 'LOGIN_FAILED', { details: { reason: 'unknown_user' }, userId: null });
    throw invalid;
  }
  if (Number(user.is_locked)) {
    throw new HttpError(423, `บัญชีถูกล็อกชั่วคราวเนื่องจากเข้าสู่ระบบผิดหลายครั้ง กรุณารอ ${config.loginLockMinutes} นาที`);
  }
  if (!user.is_active) throw new HttpError(403, 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    const failures = Number(user.failed_login_count) + 1;
    if (failures >= config.loginMaxFailures) {
      await pool.execute(
        'UPDATE users SET failed_login_count = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
        [String(config.loginLockMinutes), user.id]
      );
      await audit(req, 'ACCOUNT_LOCKED', { entityType: 'user', entityId: user.id, userId: user.id });
    } else {
      await pool.execute('UPDATE users SET failed_login_count = ? WHERE id = ?', [failures, user.id]);
    }
    await audit(req, 'LOGIN_FAILED', { entityType: 'user', entityId: user.id, userId: user.id });
    throw invalid;
  }

  await pool.execute('UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?', [
    user.id,
  ]);
  issueToken(res, user);
  await audit(req, 'LOGIN_SUCCESS', { entityType: 'user', entityId: user.id, userId: user.id });
  res.json({ message: 'เข้าสู่ระบบสำเร็จ', role: user.role });
}

/** POST /api/auth/logout - เพิกถอน token ทุกอุปกรณ์ด้วย token_version */
async function logout(req, res) {
  if (req.user) {
    await pool.execute('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
    await audit(req, 'LOGOUT', { entityType: 'user', entityId: req.user.id });
  }
  clearToken(res);
  res.json({ message: 'ออกจากระบบเรียบร้อย' });
}

/** GET /api/auth/me */
async function me(req, res) {
  const [rows] = await pool.execute(
    `SELECT id, student_id, email, first_name, last_name, role, phone_enc, line_id_enc, created_at
       FROM users WHERE id = ?`,
    [req.user.id]
  );
  res.json({ user: publicProfile(rows[0]) });
}

module.exports = { register, login, logout, me };
