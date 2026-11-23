'use strict';
const { pool } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { encrypt, decrypt } = require('../utils/crypto');
const S = require('../utils/sanitize');
const { matchLostItem } = require('../utils/matchService');
const { audit } = require('../utils/audit');
const { maskName } = require('../utils/masking');

async function loadOwnLost(req, id) {
  const [rows] = await pool.execute(
    `SELECT li.*, l.name_th AS location_name, l.icon AS location_icon
       FROM lost_items li JOIN locations l ON l.id = li.location_id WHERE li.id = ?`,
    [id]
  );
  const lost = rows[0];
  if (!lost) throw new HttpError(404, 'ไม่พบรายการแจ้งของหายนี้');
  if (lost.user_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'คุณไม่มีสิทธิ์เข้าถึงรายการนี้');
  return lost;
}

async function matchesFor(lostId) {
  const [rows] = await pool.execute(
    `SELECT m.score, m.breakdown, m.is_seen, f.id, f.title, f.category, f.found_at, f.status, f.image_public,
            f.location_id, l.name_th AS location_name, l.icon AS location_icon, u.first_name, u.last_name
       FROM matches m
       JOIN found_items f ON f.id = m.found_item_id
       JOIN locations l ON l.id = f.location_id
       JOIN users u ON u.id = f.finder_id
      WHERE m.lost_item_id = ?
      ORDER BY m.score DESC, f.found_at DESC
      LIMIT 20`,
    [lostId]
  );
  return rows.map((r) => ({
    foundItemId: r.id,
    score: r.score,
    breakdown: typeof r.breakdown === 'string' ? JSON.parse(r.breakdown) : r.breakdown,
    isNew: !r.is_seen,
    title: r.title,
    category: r.category,
    foundAt: r.found_at,
    status: r.status,
    image: r.image_public ? `/uploads/public/${r.image_public}` : null,
    location: { id: r.location_id, name: r.location_name, icon: r.location_icon },
    finderName: maskName(r.first_name, r.last_name),
  }));
}

/** POST /api/lost */
async function create(req, res) {
  const b = req.body || {};
  const title = S.requireText(b.title, 'ชื่อสิ่งของ', { max: 120, min: 2 });
  const category = S.requireCategory(b.category);
  const locationId = S.requireInt(b.locationId, 'สถานที่', { min: 1, max: 255 });
  const lostAt = S.requireDateTime(b.lostAt, 'วัน-เวลาที่ทำหาย');
  const description = S.cleanText(b.description, { max: 1000, multiline: true });
  const privateNote = S.cleanText(b.privateNote, { max: 500, multiline: true });

  const [locs] = await pool.execute('SELECT id FROM locations WHERE id = ?', [locationId]);
  if (!locs.length) throw new HttpError(400, 'สถานที่ไม่ถูกต้อง');

  const [r] = await pool.execute(
    `INSERT INTO lost_items (user_id, title, category, location_id, lost_at, description, private_note_enc)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, title, category, locationId, lostAt, description, encrypt(privateNote || null, 'lost.private_note')]
  );
  await audit(req, 'LOST_CREATED', { entityType: 'lost_item', entityId: r.insertId, details: { category, locationId } });

  const results = await matchLostItem({
    id: r.insertId,
    user_id: req.user.id,
    title,
    category,
    location_id: locationId,
    lost_at: lostAt,
    description,
    status: 'searching',
  });
  const matches = await matchesFor(r.insertId);
  res.status(201).json({
    message: results.length
      ? `พบรายการที่อาจตรงกับของที่คุณทำหาย! (ความแม่นยำ ${results[0].score}%)`
      : 'บันทึกการแจ้งของหายแล้ว ระบบจะแจ้งเตือนทันทีเมื่อมีผู้แจ้งพบสิ่งของที่ใกล้เคียง',
    id: r.insertId,
    matches,
  });
}

/** GET /api/lost/mine */
async function mine(req, res) {
  const [rows] = await pool.execute(
    `SELECT li.id, li.title, li.category, li.location_id, li.lost_at, li.description, li.status, li.created_at,
            l.name_th AS location_name, l.icon AS location_icon,
            (SELECT MAX(m.score) FROM matches m JOIN found_items f ON f.id = m.found_item_id
              WHERE m.lost_item_id = li.id AND f.status <> 'returned') AS best_score,
            (SELECT COUNT(*) FROM matches m JOIN found_items f ON f.id = m.found_item_id
              WHERE m.lost_item_id = li.id AND f.status <> 'returned') AS match_count,
            (SELECT COUNT(*) FROM matches m WHERE m.lost_item_id = li.id AND m.is_seen = 0) AS new_matches
       FROM lost_items li JOIN locations l ON l.id = li.location_id
      WHERE li.user_id = ? ORDER BY li.created_at DESC`,
    [req.user.id]
  );
  res.json({
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      location: { id: r.location_id, name: r.location_name, icon: r.location_icon },
      lostAt: r.lost_at,
      description: r.description,
      status: r.status,
      bestScore: r.best_score === null ? null : Number(r.best_score),
      matchCount: Number(r.match_count),
      newMatches: Number(r.new_matches),
    })),
  });
}

/** GET /api/lost/:id  (เจ้าของเท่านั้น) */
async function getOne(req, res) {
  const lost = await loadOwnLost(req, S.requireInt(req.params.id, 'รหัสรายการ'));
  res.json({
    item: {
      id: lost.id,
      title: lost.title,
      category: lost.category,
      location: { id: lost.location_id, name: lost.location_name, icon: lost.location_icon },
      lostAt: lost.lost_at,
      description: lost.description,
      privateNote: decrypt(lost.private_note_enc, 'lost.private_note'),
      status: lost.status,
    },
  });
}

/** GET /api/lost/:id/matches */
async function getMatches(req, res) {
  const lost = await loadOwnLost(req, S.requireInt(req.params.id, 'รหัสรายการ'));
  const matches = await matchesFor(lost.id);
  if (lost.user_id === req.user.id) await pool.execute('UPDATE matches SET is_seen = 1 WHERE lost_item_id = ?', [lost.id]);
  res.json({ lost: { id: lost.id, title: lost.title, status: lost.status }, matches });
}

/** POST /api/lost/:id/rematch */
async function rematch(req, res) {
  const lost = await loadOwnLost(req, S.requireInt(req.params.id, 'รหัสรายการ'));
  if (['resolved', 'cancelled'].includes(lost.status)) throw new HttpError(409, 'รายการนี้ปิดไปแล้ว');
  const results = await matchLostItem(lost);
  res.json({ message: `จับคู่ใหม่เรียบร้อย พบ ${results.length} รายการ`, matches: await matchesFor(lost.id) });
}

/** PATCH /api/lost/:id/cancel */
async function cancel(req, res) {
  const lost = await loadOwnLost(req, S.requireInt(req.params.id, 'รหัสรายการ'));
  if (lost.status === 'resolved') throw new HttpError(409, 'รายการนี้ได้รับคืนแล้ว');
  await pool.execute("UPDATE lost_items SET status = 'cancelled' WHERE id = ?", [lost.id]);
  await audit(req, 'LOST_CANCELLED', { entityType: 'lost_item', entityId: lost.id });
  res.json({ message: 'ยกเลิกการแจ้งของหายแล้ว' });
}

module.exports = { create, mine, getOne, getMatches, rematch, cancel };
