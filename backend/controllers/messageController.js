'use strict';
/**
 * กล่องข้อความนัดรับคืน - เปิดเฉพาะคู่กรณี (ผู้ขอรับคืนที่ผ่านการยืนยัน + ผู้เก็บได้)
 * Admin อ่านได้อย่างเดียวเพื่อตรวจสอบกรณีพิพาท
 */
const { pool } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const S = require('../utils/sanitize');
const { notify } = require('../utils/audit');

async function loadChatClaim(req, claimId) {
  const [[c]] = await pool.execute(
    `SELECT c.id, c.status, c.claimant_id, c.found_item_id, f.finder_id, f.title
       FROM verification_claims c JOIN found_items f ON f.id = c.found_item_id WHERE c.id = ?`,
    [claimId]
  );
  if (!c) throw new HttpError(404, 'ไม่พบห้องสนทนานี้');
  const isParty = req.user.id === c.claimant_id || req.user.id === c.finder_id;
  if (!isParty && req.user.role !== 'admin') throw new HttpError(403, 'คุณไม่มีสิทธิ์เข้าถึงห้องสนทนานี้');
  if (!['approved', 'completed'].includes(c.status)) throw new HttpError(403, 'ห้องสนทนาจะเปิดเมื่อยืนยันความเป็นเจ้าของสำเร็จแล้ว');
  return { claim: c, isParty };
}

/** GET /api/claims/:id/messages?after=<id> */
async function list(req, res) {
  const claimId = S.requireInt(req.params.id, 'รหัสคำขอ');
  await loadChatClaim(req, claimId);
  const after = S.optionalInt(req.query.after, { min: 0 }) || 0;
  const [rows] = await pool.execute(
    `SELECT m.id, m.sender_id, m.body, m.created_at, u.first_name
       FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.claim_id = ? AND m.id > ? ORDER BY m.id ASC LIMIT 200`,
    [claimId, after]
  );
  res.json({
    messages: rows.map((r) => ({
      id: r.id,
      mine: r.sender_id === req.user.id,
      senderName: r.first_name,
      body: r.body,
      createdAt: r.created_at,
    })),
  });
}

/** POST /api/claims/:id/messages { body } */
async function send(req, res) {
  const claimId = S.requireInt(req.params.id, 'รหัสคำขอ');
  const { claim, isParty } = await loadChatClaim(req, claimId);
  if (!isParty) throw new HttpError(403, 'ผู้ดูแลระบบอ่านได้อย่างเดียว');
  if (claim.status === 'completed') throw new HttpError(409, 'รายการนี้รับคืนเรียบร้อยแล้ว ห้องสนทนาปิดการส่งข้อความ');
  const body = S.requireText(req.body && req.body.body, 'ข้อความ', { max: 1000, multiline: true });
  const [r] = await pool.execute('INSERT INTO messages (claim_id, sender_id, body) VALUES (?, ?, ?)', [
    claimId,
    req.user.id,
    body,
  ]);
  const other = req.user.id === claim.claimant_id ? claim.finder_id : claim.claimant_id;
  // แจ้งเตือนอีกฝ่าย (ไม่ซ้ำถ้ายังมีแจ้งเตือนข้อความที่ยังไม่อ่านของรายการนี้อยู่)
  const link = `/match-verify.html?id=${claim.found_item_id}`;
  const [[{ n }]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'message' AND link = ? AND is_read = 0",
    [other, link]
  );
  if (!Number(n)) await notify(other, 'message', `มีข้อความใหม่เกี่ยวกับ "${claim.title}"`, link);
  res.status(201).json({ id: r.insertId });
}

module.exports = { list, send };
