'use strict';
/**
 * Multer: รับไฟล์ไว้ในหน่วยความจำ (ไม่เขียนไฟล์ดิบที่ยังไม่ตรวจสอบลงดิสก์)
 * - จำกัดขนาด 5MB, 1 ไฟล์
 * - ตรวจ MIME type เบื้องต้น จากนั้น utils/image.js ตรวจ magic bytes + ลบ EXIF อีกชั้น
 */
const multer = require('multer');
const { HttpError } = require('../utils/httpError');

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 30, fieldSize: 16 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.test(file.originalname || '')) {
      return cb(new HttpError(400, 'รองรับเฉพาะไฟล์ภาพ .jpg, .png และ .webp ขนาดไม่เกิน 5MB'));
    }
    return cb(null, true);
  },
});

module.exports = { uploadImage: upload.single('image') };
