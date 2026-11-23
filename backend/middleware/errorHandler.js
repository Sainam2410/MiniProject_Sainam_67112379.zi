'use strict';
const multer = require('multer');
const config = require('../config');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === 'LIMIT_FILE_SIZE' ? 'ไฟล์ภาพต้องมีขนาดไม่เกิน 5MB' : 'ข้อมูลไฟล์ที่อัปโหลดไม่ถูกต้อง';
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' });
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'ข้อมูลนี้มีอยู่ในระบบแล้ว' });

  if (err.expose && err.status) {
    return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  }
  // ไม่ส่งรายละเอียด error ภายใน (stack, SQL) ออกไปให้ผู้ใช้
  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.originalUrl}:`, config.isProd ? err.message : err);
  return res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง' });
}

function notFound(req, res) {
  res.status(404).json({ error: 'ไม่พบ API ที่ร้องขอ' });
}

module.exports = { errorHandler, notFound };
