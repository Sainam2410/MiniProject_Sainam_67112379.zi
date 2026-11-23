'use strict';
/**
 * Authentication & RBAC
 * - JWT (HS256) เก็บใน Cookie: HttpOnly + Secure + SameSite=Strict  -> JavaScript อ่าน token ไม่ได้ (กัน XSS ขโมย)
 * - ทุก request ตรวจสถานะผู้ใช้จากฐานข้อมูลอีกครั้ง (บัญชีถูกระงับ/เปลี่ยนสิทธิ์ มีผลทันที)
 * - token_version ใช้ "เพิกถอน" token เก่าทั้งหมดเมื่อออกจากระบบ/ถูกระงับ
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../config/db');
const { HttpError } = require('../utils/httpError');

const JWT_OPTS = { issuer: 'unifind-dpu', audience: 'unifind-dpu-web' };

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'strict',
    path: '/',
    maxAge: config.jwt.cookieMaxAgeMs,
  };
}

function issueToken(res, user) {
  const token = jwt.sign({ sub: String(user.id), role: user.role, tv: user.token_version }, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn,
    ...JWT_OPTS,
  });
  res.cookie(config.jwt.cookieName, token, cookieOptions());
}

function clearToken(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(config.jwt.cookieName, opts);
}

async function resolveUser(req) {
  const token = req.cookies && req.cookies[config.jwt.cookieName];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'], ...JWT_OPTS });
  } catch (_e) {
    return null;
  }
  const [rows] = await pool.execute(
    `SELECT id, student_id, email, first_name, last_name, role, is_active, token_version
       FROM users WHERE id = ? LIMIT 1`,
    [Number(payload.sub)]
  );
  const u = rows[0];
  if (!u || !u.is_active || Number(u.token_version) !== Number(payload.tv)) return null;
  return {
    id: u.id,
    studentId: u.student_id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    role: u.role, // ใช้ role จากฐานข้อมูล ไม่ใช่จาก token
    tokenVersion: u.token_version,
  };
}

/** ต้องเข้าสู่ระบบ */
async function authenticate(req, res, next) {
  try {
    const user = await resolveUser(req);
    if (!user) {
      clearToken(res);
      return next(new HttpError(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน'));
    }
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** เข้าสู่ระบบหรือไม่ก็ได้ (หน้าสาธารณะ) */
async function optionalAuth(req, _res, next) {
  try {
    req.user = await resolveUser(req);
    return next();
  } catch (err) {
    return next(err);
  }
}

/** RBAC: จำกัดสิทธิ์ตามบทบาท */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'กรุณาเข้าสู่ระบบก่อนใช้งาน'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้'));
    return next();
  };
}

const requireUser = requireRole('user', 'admin');
const requireAdmin = requireRole('admin');

module.exports = { authenticate, optionalAuth, requireRole, requireUser, requireAdmin, issueToken, clearToken };
