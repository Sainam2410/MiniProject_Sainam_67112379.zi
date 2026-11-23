'use strict';
/**
 * Audit Log + Notification helpers
 * ห้ามส่งรหัสผ่าน / คำตอบ / ข้อมูลลับ / เบอร์โทร เข้ามาใน details เด็ดขาด
 */
const { pool } = require('../config/db');

async function audit(req, action, { entityType = null, entityId = null, details = null, userId } = {}, conn = pool) {
  try {
    const uid = userId !== undefined ? userId : req && req.user ? req.user.id : null;
    const ip = req ? String(req.ip || '').slice(0, 45) : null;
    const ua = req ? String(req.get('user-agent') || '').slice(0, 255) : null;
    await conn.execute(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, user_agent, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid, action, entityType, entityId, ip, ua, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    // ไม่ให้การเขียน log ที่ล้มเหลวทำให้ request หลักล้มตาม
    // eslint-disable-next-line no-console
    console.error('[audit] write failed:', err.message);
  }
}

async function notify(userId, type, message, link = null, conn = pool) {
  await conn.execute('INSERT INTO notifications (user_id, type, message, link) VALUES (?, ?, ?, ?)', [
    userId,
    type,
    String(message).slice(0, 255),
    link,
  ]);
}

async function notifyAdmins(type, message, link = null, conn = pool) {
  const [admins] = await conn.execute("SELECT id FROM users WHERE role = 'admin' AND is_active = 1");
  for (const a of admins) await notify(a.id, type, message, link, conn);
}

module.exports = { audit, notify, notifyAdmins };
