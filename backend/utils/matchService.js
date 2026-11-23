'use strict';
/**
 * Matching Service - เชื่อม Matching Engine กับฐานข้อมูล
 */
const { pool } = require('../config/db');
const config = require('../config');
const { scoreMatch, buildGeo } = require('./matching');
const { notify } = require('./audit');

let geoCache = null;
let geoCachedAt = 0;

async function getGeo() {
  if (geoCache && Date.now() - geoCachedAt < 10 * 60 * 1000) return geoCache;
  const [locs] = await pool.execute('SELECT id, zone FROM locations');
  const [nbs] = await pool.execute('SELECT location_id, neighbor_id FROM location_neighbors');
  geoCache = buildGeo(locs, nbs);
  geoCachedAt = Date.now();
  return geoCache;
}

async function upsertMatch(lostId, foundId, score, breakdown) {
  await pool.execute(
    `INSERT INTO matches (lost_item_id, found_item_id, score, breakdown) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE score = VALUES(score), breakdown = VALUES(breakdown)`,
    [lostId, foundId, score, JSON.stringify(breakdown)]
  );
}

/**
 * จับคู่ "ของหาย 1 รายการ" กับ "ของที่พบ" ทั้งหมดที่ยังรอรับคืน
 * @returns {Promise<Array<{found_item_id:number, score:number, breakdown:object}>>}
 */
async function matchLostItem(lost, { notifyOwner = false } = {}) {
  const geo = await getGeo();
  const [founds] = await pool.execute(
    `SELECT id, finder_id, title, category, location_id, found_at, public_description
       FROM found_items
      WHERE status <> 'returned' AND finder_id <> ?
        AND found_at >= DATE_SUB(?, INTERVAL 1 DAY)`,
    [lost.user_id, lost.lost_at]
  );
  const results = [];
  for (const f of founds) {
    const { score, breakdown } = scoreMatch(lost, f, geo);
    if (score >= config.matchThreshold) {
      await upsertMatch(lost.id, f.id, score, breakdown);
      results.push({ found_item_id: f.id, score, breakdown, title: f.title });
    }
  }
  results.sort((a, b) => b.score - a.score);
  if (results.length && lost.status === 'searching') {
    await pool.execute("UPDATE lost_items SET status = 'matched' WHERE id = ? AND status = 'searching'", [lost.id]);
  }
  if (notifyOwner && results.length) {
    const best = results[0];
    await notify(
      lost.user_id,
      'match',
      `พบรายการที่อาจตรงกับ "${lost.title}" ของคุณ! (ความแม่นยำ ${best.score}%)`,
      `/match-verify.html?id=${best.found_item_id}`
    );
  }
  return results;
}

/** จับคู่ "ของที่พบใหม่ 1 รายการ" กับของหายที่ยังค้นหาอยู่ทั้งหมด แล้วแจ้งเตือนเจ้าของ */
async function matchFoundItem(found) {
  const geo = await getGeo();
  const [losts] = await pool.execute(
    `SELECT id, user_id, title, category, location_id, lost_at, description, status
       FROM lost_items
      WHERE status IN ('searching','matched') AND user_id <> ?
        AND lost_at <= DATE_ADD(?, INTERVAL 1 DAY)`,
    [found.finder_id, found.found_at]
  );
  let count = 0;
  for (const l of losts) {
    const { score, breakdown } = scoreMatch(l, found, geo);
    if (score >= config.matchThreshold) {
      await upsertMatch(l.id, found.id, score, breakdown);
      if (l.status === 'searching') {
        await pool.execute("UPDATE lost_items SET status = 'matched' WHERE id = ?", [l.id]);
      }
      await notify(
        l.user_id,
        'match',
        `พบรายการที่อาจตรงกับ "${l.title}" ของคุณ! (ความแม่นยำ ${score}%)`,
        `/match-verify.html?id=${found.id}`
      );
      count += 1;
    }
  }
  return count;
}

module.exports = { matchLostItem, matchFoundItem, getGeo };
