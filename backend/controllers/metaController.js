'use strict';
const { pool } = require('../config/db');
const { CATEGORIES, FOUND_STATUS } = require('../config/constants');

/** GET /api/meta  หมวดหมู่ สถานที่ สถานะ (ใช้เติม dropdown) */
async function meta(_req, res) {
  const [locations] = await pool.execute('SELECT id, code, name_th AS name, zone, icon FROM locations ORDER BY sort_order');
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    categories: Object.entries(CATEGORIES).map(([value, v]) => ({ value, ...v })),
    locations,
    statuses: Object.entries(FOUND_STATUS).map(([value, label]) => ({ value, label })),
  });
}

/** GET /api/meta/stats  สถิติภาพรวมสาธารณะ (หน้าแรก) */
async function publicStats(_req, res) {
  const [[r]] = await pool.execute(
    `SELECT (SELECT COUNT(*) FROM lost_items) AS lost,
            (SELECT COUNT(*) FROM found_items) AS found,
            (SELECT COUNT(*) FROM found_items WHERE status = 'available') AS waiting,
            (SELECT COUNT(*) FROM found_items WHERE status = 'returned') AS returned`
  );
  res.json(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)])));
}

module.exports = { meta, publicStats };
