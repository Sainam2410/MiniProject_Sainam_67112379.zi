'use strict';
/**
 * Rate Limiting (express-rate-limit)
 * ชั้นที่ 1: จำกัดความถี่ระดับ IP/ผู้ใช้ (กันยิง API รัว ๆ)
 * ชั้นที่ 2: จำกัด 3 ครั้งต่อรายการ เก็บในฐานข้อมูล (ดู claimController) ซึ่งรีสตาร์ทเซิร์ฟเวอร์ก็ไม่หาย
 */
const rateLimit = require('express-rate-limit');

const message = (text) => ({ error: text });

/** API ทั่วไป */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('มีการเรียกใช้งานถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'),
});

/** หน้า Login: 10 ครั้ง / 15 นาที / IP (นับเฉพาะครั้งที่ล้มเหลว) */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่'),
});

/** สมัครสมาชิก: 5 บัญชี / ชั่วโมง / IP */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: message('สมัครสมาชิกหลายครั้งเกินไป กรุณาลองใหม่ภายหลัง'),
});

/** ส่งคำตอบยืนยันความเป็นเจ้าของ: 5 ครั้ง / 15 นาที / ผู้ใช้ (ใช้หลัง authenticate) */
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: message('ส่งคำตอบถี่เกินไป กรุณารอ 15 นาทีแล้วลองใหม่'),
});

/** อัปโหลด/สร้างรายการ: 20 ครั้ง / ชั่วโมง / ผู้ใช้ */
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: message('สร้างรายการถี่เกินไป กรุณาลองใหม่ภายหลัง'),
});

/** ส่งข้อความแชต: 30 ข้อความ / 5 นาที / ผู้ใช้ */
const messageLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user.id}`,
  message: message('ส่งข้อความถี่เกินไป กรุณารอสักครู่'),
});

module.exports = { apiLimiter, loginLimiter, registerLimiter, verifyLimiter, createLimiter, messageLimiter };
