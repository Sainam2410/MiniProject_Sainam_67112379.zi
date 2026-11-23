'use strict';
/**
 * Input Validation & Sanitization
 * - ตัดอักขระควบคุม / zero-width / แท็ก HTML ออกจากข้อความ
 * - จำกัดความยาว
 * - ฝั่ง Frontend ยัง escape ทุกครั้งก่อนแสดงผล (Defense in depth)
 */
const { HttpError } = require('./httpError');
const { CATEGORIES } = require('../config/constants');

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍﻿]/g;
const TAGS = /<\/?[a-zA-Z!][^>]*>/g;

function cleanText(value, { max = 255, multiline = false } = {}) {
  if (value === undefined || value === null) return '';
  let s = String(value).normalize('NFC').replace(CONTROL_CHARS, '').replace(TAGS, '');
  s = s.replace(/[<>]/g, ''); // ไม่อนุญาต < > ที่หลงเหลือ
  if (!multiline) s = s.replace(/\s+/g, ' ');
  else s = s.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  s = s.trim();
  return Array.from(s).slice(0, max).join('');
}

function requireText(value, field, opts = {}) {
  const s = cleanText(value, opts);
  const min = opts.min ?? 1;
  if (Array.from(s).length < min) {
    throw new HttpError(400, `กรุณากรอก${field}ให้ครบถ้วน${min > 1 ? ` (อย่างน้อย ${min} ตัวอักษร)` : ''}`);
  }
  return s;
}

function requireCategory(value) {
  const v = String(value || '');
  if (!Object.prototype.hasOwnProperty.call(CATEGORIES, v)) {
    throw new HttpError(400, 'หมวดหมู่ไม่ถูกต้อง');
  }
  return v;
}

function requireInt(value, field, { min = 1, max = 2147483647 } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field}ไม่ถูกต้อง`);
  return n;
}

function optionalInt(value, opts) {
  if (value === undefined || value === null || value === '') return null;
  return requireInt(value, 'ค่าตัวเลข', opts);
}

/**
 * รับค่า datetime-local (YYYY-MM-DDTHH:mm) หรือ YYYY-MM-DD HH:mm:ss
 * คืนค่าเป็นสตริงรูปแบบ MySQL DATETIME (เวลาไทย)
 */
function requireDateTime(value, field) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new HttpError(400, `รูปแบบ${field}ไม่ถูกต้อง`);
  const [, y, mo, d, h, mi, sec = '00'] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}+07:00`);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `${field}ไม่ถูกต้อง`);
  const now = Date.now();
  if (date.getTime() > now + 10 * 60 * 1000) throw new HttpError(400, `${field}ต้องไม่เป็นเวลาในอนาคต`);
  if (date.getTime() < now - 365 * 24 * 3600 * 1000) throw new HttpError(400, `${field}ต้องอยู่ภายใน 1 ปี`);
  return `${y}-${mo}-${d} ${h}:${mi}:${sec}`;
}

function optionalDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, 'รูปแบบวันที่ไม่ถูกต้อง');
  return s;
}

function isValidThaiPhone(phone) {
  return /^0[689]\d{8}$|^0[2-7]\d{7}$/.test(phone);
}

/** Password policy: >= 8 ตัว มีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ */
function isStrongPassword(pw) {
  return (
    typeof pw === 'string' &&
    pw.length >= 8 &&
    pw.length <= 72 && // bcrypt ใช้ได้สูงสุด 72 ไบต์
    Buffer.byteLength(pw, 'utf8') <= 72 &&
    /[a-z]/.test(pw) &&
    /[A-Z]/.test(pw) &&
    /\d/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}

module.exports = {
  cleanText,
  requireText,
  requireCategory,
  requireInt,
  optionalInt,
  requireDateTime,
  optionalDate,
  isValidThaiPhone,
  isStrongPassword,
};
