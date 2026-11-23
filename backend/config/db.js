'use strict';
/**
 * MySQL connection pool (mysql2/promise)
 * ทุก Query ในระบบใช้ pool.execute() = Server-side Prepared Statements
 * ค่าจากผู้ใช้จะถูกส่งแยกจากคำสั่ง SQL เสมอ จึงป้องกัน SQL Injection ได้
 */
const mysql = require('mysql2/promise');
const config = require('./index');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  waitForConnections: true,
  charset: 'utf8mb4',
  timezone: '+07:00',
  dateStrings: true,
  multipleStatements: false, // ปิดการรันหลายคำสั่งในครั้งเดียว ลดความเสี่ยง SQLi แบบ stacked queries
});

/** รันคำสั่งภายใน Transaction อย่างปลอดภัย */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** สร้าง placeholder (?, ?, ?) สำหรับ IN (...) แบบปลอดภัย */
function placeholders(arr) {
  return arr.map(() => '?').join(', ');
}

module.exports = { pool, withTransaction, placeholders };
