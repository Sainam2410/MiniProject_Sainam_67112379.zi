'use strict';
const { pool } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { decrypt } = require('../utils/crypto');
const S = require('../utils/sanitize');
const { maskPhone } = require('../utils/masking');
const { removeImages } = require('../utils/image');
const { audit, notify } = require('../utils/audit');

/** GET /api/admin/stats  สถิติจากฐานข้อมูลจริง */
async function stats(_req, res) {
  const [[totals]] = await pool.execute(
    `SELECT
       (SELECT COUNT(*) FROM lost_items) AS lost_total,
       (SELECT COUNT(*) FROM lost_items WHERE status IN ('searching','matched')) AS lost_open,
       (SELECT COUNT(*) FROM found_items) AS found_total,
       (SELECT COUNT(*) FROM found_items WHERE status = 'available') AS found_available,
       (SELECT COUNT(*) FROM found_items WHERE status = 'returned') AS returned_total,
       (SELECT COUNT(*) FROM matches) AS match_total,
       (SELECT COUNT(*) FROM verification_claims WHERE status IN ('approved','completed')) AS claims_success,
       (SELECT COUNT(*) FROM verification_claims WHERE status = 'pending_review') AS claims_pending,
       (SELECT COUNT(*) FROM verification_claims WHERE status = 'locked') AS claims_locked,
       (SELECT COUNT(*) FROM users WHERE is_active = 1) AS users_active`
  );
  const [byCategory] = await pool.execute(
    `SELECT c.category,
            (SELECT COUNT(*) FROM lost_items WHERE category = c.category) AS lost,
            (SELECT COUNT(*) FROM found_items WHERE category = c.category) AS found
       FROM (SELECT 'wallet' AS category UNION ALL SELECT 'it' UNION ALL SELECT 'card_doc'
             UNION ALL SELECT 'key' UNION ALL SELECT 'personal') c`
  );
  const [byLocation] = await pool.execute(
    `SELECT l.id, l.name_th, l.icon,
            (SELECT COUNT(*) FROM lost_items WHERE location_id = l.id) AS lost,
            (SELECT COUNT(*) FROM found_items WHERE location_id = l.id) AS found
       FROM locations l ORDER BY l.sort_order`
  );
  const [daily] = await pool.execute(
    `SELECT d.day,
            (SELECT COUNT(*) FROM lost_items WHERE DATE(created_at) = d.day) AS lost,
            (SELECT COUNT(*) FROM found_items WHERE DATE(created_at) = d.day) AS found
       FROM (SELECT CURDATE() - INTERVAL n DAY AS day
               FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                     UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) x) d
      ORDER BY d.day`
  );
  const num = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));
  res.json({
    totals: num(totals),
    byCategory: byCategory.map((r) => ({ category: r.category, lost: Number(r.lost), found: Number(r.found) })),
    byLocation: byLocation.map((r) => ({ id: r.id, name: r.name_th, icon: r.icon, lost: Number(r.lost), found: Number(r.found) })),
    daily: daily.map((r) => ({ day: String(r.day).slice(0, 10), lost: Number(r.lost), found: Number(r.found) })),
  });
}

/** GET /api/admin/users?q= */
async function listUsers(req, res) {
  const q = S.cleanText(req.query.q, { max: 60 });
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE email LIKE ? OR student_id LIKE ? OR first_name LIKE ? OR last_name LIKE ?';
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT id, student_id, email, first_name, last_name, role, is_active, phone_enc, last_login_at, created_at,
            (locked_until IS NOT NULL AND locked_until > NOW()) AS login_locked
       FROM users ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      studentId: r.student_id,
      email: r.email,
      name: `${r.first_name} ${r.last_name}`,
      role: r.role,
      isActive: Boolean(r.is_active),
      phone: maskPhone(decrypt(r.phone_enc, 'users.phone')), // Admin เห็นแบบ mask (least privilege)
      loginLocked: Boolean(Number(r.login_locked)),
      lastLoginAt: r.last_login_at,
      createdAt: r.created_at,
    })),
  });
}

/** PATCH /api/admin/users/:id { isActive?, role? } */
async function updateUser(req, res) {
  const id = S.requireInt(req.params.id, 'รหัสผู้ใช้');
  if (id === req.user.id) throw new HttpError(400, 'ไม่สามารถแก้ไขสิทธิ์ของบัญชีตัวเองได้');
  const b = req.body || {};
  const sets = [];
  const params = [];
  if (b.isActive !== undefined) {
    sets.push('is_active = ?', 'token_version = token_version + 1'); // ระงับแล้ว token เดิมใช้ไม่ได้ทันที
    params.push(b.isActive ? 1 : 0);
  }
  if (b.role !== undefined) {
    if (!['user', 'admin'].includes(b.role)) throw new HttpError(400, 'บทบาทไม่ถูกต้อง');
    sets.push('role = ?', 'token_version = token_version + 1');
    params.push(b.role);
  }
  if (b.unlockLogin) sets.push('locked_until = NULL', 'failed_login_count = 0');
  if (!sets.length) throw new HttpError(400, 'ไม่มีข้อมูลที่ต้องการแก้ไข');
  const [r] = await pool.execute(`UPDATE users SET ${[...new Set(sets)].join(', ')} WHERE id = ?`, [...params, id]);
  if (!r.affectedRows) throw new HttpError(404, 'ไม่พบผู้ใช้');
  await audit(req, 'ADMIN_USER_UPDATED', {
    entityType: 'user',
    entityId: id,
    details: { isActive: b.isActive, role: b.role, unlockLogin: Boolean(b.unlockLogin) },
  });
  res.json({ message: 'อัปเดตผู้ใช้เรียบร้อย' });
}

/** GET /api/admin/items?type=found|lost&q=&status= */
async function listItems(req, res) {
  const type = req.query.type === 'lost' ? 'lost' : 'found';
  const q = S.cleanText(req.query.q, { max: 60 });
  const status = S.cleanText(req.query.status, { max: 20 });
  const table = type === 'lost' ? 'lost_items' : 'found_items';
  const userCol = type === 'lost' ? 'user_id' : 'finder_id';
  const timeCol = type === 'lost' ? 'lost_at' : 'found_at';
  const allowedStatus =
    type === 'lost' ? ['searching', 'matched', 'resolved', 'cancelled'] : ['available', 'pending_claim', 'returned'];
  const where = ['1 = 1'];
  const params = [];
  if (q) {
    where.push('i.title LIKE ?');
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (status) {
    if (!allowedStatus.includes(status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
    where.push('i.status = ?');
    params.push(status);
  }
  // ชื่อตาราง/คอลัมน์มาจาก whitelist ด้านบนเท่านั้น ไม่ได้มาจากผู้ใช้โดยตรง
  const [rows] = await pool.execute(
    `SELECT i.id, i.title, i.category, i.status, i.${timeCol} AS event_at, i.created_at,
            l.name_th AS location_name, u.student_id, u.first_name, u.last_name
       FROM ${table} i JOIN locations l ON l.id = i.location_id JOIN users u ON u.id = i.${userCol}
      WHERE ${where.join(' AND ')} ORDER BY i.created_at DESC LIMIT 300`,
    params
  );
  res.json({
    type,
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      status: r.status,
      eventAt: r.event_at,
      createdAt: r.created_at,
      location: r.location_name,
      owner: `${r.first_name} ${r.last_name} (${r.student_id})`,
    })),
  });
}

/** DELETE /api/admin/items/:type/:id */
async function deleteItem(req, res) {
  const type = req.params.type === 'lost' ? 'lost' : req.params.type === 'found' ? 'found' : null;
  if (!type) throw new HttpError(400, 'ประเภทรายการไม่ถูกต้อง');
  const id = S.requireInt(req.params.id, 'รหัสรายการ');
  if (type === 'found') {
    const [[f]] = await pool.execute('SELECT image_public, image_private FROM found_items WHERE id = ?', [id]);
    if (!f) throw new HttpError(404, 'ไม่พบรายการ');
    await pool.execute('DELETE FROM found_items WHERE id = ?', [id]);
    await removeImages(f.image_public, f.image_private);
  } else {
    const [r] = await pool.execute('DELETE FROM lost_items WHERE id = ?', [id]);
    if (!r.affectedRows) throw new HttpError(404, 'ไม่พบรายการ');
  }
  await audit(req, 'ADMIN_ITEM_DELETED', { entityType: `${type}_item`, entityId: id });
  res.json({ message: 'ลบรายการเรียบร้อย' });
}

/** GET /api/admin/claims?status= */
async function listClaims(req, res) {
  const status = String(req.query.status || 'locked');
  if (!['locked', 'pending_review', 'approved', 'completed', 'in_progress'].includes(status)) {
    throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  }
  const [rows] = await pool.execute(
    `SELECT c.id, c.found_item_id, c.status, c.attempts, c.lock_count, c.locked_until, c.auto_score, c.updated_at,
            f.title, u.student_id, u.first_name, u.last_name, fu.first_name AS finder_first, fu.last_name AS finder_last
       FROM verification_claims c
       JOIN found_items f ON f.id = c.found_item_id
       JOIN users u ON u.id = c.claimant_id
       JOIN users fu ON fu.id = f.finder_id
      WHERE c.status = ? ORDER BY c.updated_at DESC LIMIT 200`,
    [status]
  );
  res.json({
    claims: rows.map((r) => ({
      id: r.id,
      foundItemId: r.found_item_id,
      title: r.title,
      status: r.status,
      attempts: r.attempts,
      lockCount: r.lock_count,
      lockedUntil: r.locked_until,
      autoScore: r.auto_score,
      updatedAt: r.updated_at,
      claimant: `${r.first_name} ${r.last_name} (${r.student_id})`,
      finder: `${r.finder_first} ${r.finder_last}`,
    })),
  });
}

/** POST /api/admin/claims/:id/unlock */
async function unlockClaim(req, res) {
  const id = S.requireInt(req.params.id, 'รหัสคำขอ');
  const [[c]] = await pool.execute(
    'SELECT c.id, c.claimant_id, c.found_item_id, c.status, f.title FROM verification_claims c JOIN found_items f ON f.id = c.found_item_id WHERE c.id = ?',
    [id]
  );
  if (!c) throw new HttpError(404, 'ไม่พบคำขอ');
  if (c.status !== 'locked') throw new HttpError(409, 'คำขอนี้ไม่ได้ถูกล็อก');
  await pool.execute(
    "UPDATE verification_claims SET status = 'in_progress', attempts = 0, locked_until = NULL, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
    [req.user.id, id]
  );
  await notify(c.claimant_id, 'claim_unlocked', `ผู้ดูแลระบบปลดล็อกสิทธิ์การยืนยัน "${c.title}" แล้ว คุณตอบคำถามได้อีก 3 ครั้ง`, `/match-verify.html?id=${c.found_item_id}`);
  await audit(req, 'ADMIN_CLAIM_UNLOCKED', { entityType: 'claim', entityId: id });
  res.json({ message: 'ปลดล็อกคำขอเรียบร้อย' });
}

/** GET /api/admin/audit-logs?action= */
async function auditLogs(req, res) {
  const action = S.cleanText(req.query.action, { max: 60 }).toUpperCase();
  const params = [];
  let where = '';
  if (action) {
    if (!/^[A-Z_]+$/.test(action)) throw new HttpError(400, 'action ไม่ถูกต้อง');
    where = 'WHERE a.action = ?';
    params.push(action);
  }
  const [rows] = await pool.execute(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.ip_address, a.details, a.created_at, u.email
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id ${where}
      ORDER BY a.id DESC LIMIT 150`,
    params
  );
  res.json({
    logs: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity_type ? `${r.entity_type}#${r.entity_id}` : '-',
      user: r.email || '-',
      ip: r.ip_address,
      details: r.details,
      createdAt: r.created_at,
    })),
  });
}

module.exports = { stats, listUsers, updateUser, listItems, deleteItem, listClaims, unlockClaim, auditLogs };
