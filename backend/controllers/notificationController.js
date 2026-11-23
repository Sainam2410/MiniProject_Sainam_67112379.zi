'use strict';
const { pool } = require('../config/db');
const S = require('../utils/sanitize');

/** GET /api/notifications */
async function list(req, res) {
  const [rows] = await pool.execute(
    'SELECT id, type, message, link, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30',
    [req.user.id]
  );
  const [[{ unread }]] = await pool.execute(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  );
  res.json({
    unread: Number(unread),
    notifications: rows.map((r) => ({
      id: r.id,
      type: r.type,
      message: r.message,
      // อนุญาตเฉพาะลิงก์ภายในระบบ (กัน open redirect / javascript: URL)
      link: r.link && /^\/[a-z0-9-]+\.html(\?[a-z]+=\d+)?(#[a-z]+)?$/i.test(r.link) ? r.link : null,
      isRead: Boolean(r.is_read),
      createdAt: r.created_at,
    })),
  });
}

/** POST /api/notifications/read  { id? } ไม่ระบุ id = อ่านทั้งหมด */
async function markRead(req, res) {
  const id = S.optionalInt(req.body && req.body.id);
  if (id) await pool.execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]);
  else await pool.execute('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true });
}

module.exports = { list, markRead };
