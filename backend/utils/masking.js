'use strict';
/**
 * Data Masking สำหรับ API Response
 * ใช้กับข้อมูลที่ยังไม่ได้รับสิทธิ์ดูฉบับเต็ม (ก่อนยืนยันความเป็นเจ้าของ)
 */

/** 0891234545 -> 089-xxx-xx45 */
function maskPhone(phone) {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length < 6) return 'xxx-xxx-xxxx';
  return `${d.slice(0, 3)}-xxx-xx${d.slice(-2)}`;
}

/** ("สมชาย", "ใจดี") -> "คุณสมชาย ใจ***" ; ("Somchai","Jaidee") -> "คุณSomchai Ja***" */
function maskName(firstName, lastName) {
  const first = Array.from(String(firstName || '').trim());
  const last = Array.from(String(lastName || '').trim());
  if (!first.length) return 'ผู้ใช้ DPU';
  // แสดงชื่อจริง แต่ปิดนามสกุล คงไว้เฉพาะ 2 ตัวอักษรแรก (นามสกุลสั้นคงไว้ 1 ตัว)
  const keep = last.length > 3 ? 2 : 1;
  const lastMasked = last.length ? `${last.slice(0, keep).join('')}***` : '***';
  return `คุณ${first.join('')} ${lastMasked}`;
}

/** line_id_demo -> li******mo */
function maskLineId(lineId) {
  if (!lineId) return null;
  const s = Array.from(String(lineId));
  if (s.length <= 4) return `${s[0] || ''}***`;
  return `${s.slice(0, 2).join('')}${'*'.repeat(Math.min(6, s.length - 4))}${s.slice(-2).join('')}`;
}

/** somchai.jaidee@dpu.ac.th -> so***@dpu.ac.th */
function maskEmail(email) {
  if (!email || !String(email).includes('@')) return null;
  const [user, domain] = String(email).split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

/** 65130001 -> 6513xx01 */
function maskStudentId(id) {
  if (!id) return null;
  const s = String(id);
  if (s.length <= 4) return 'xxxx';
  return `${s.slice(0, 4)}${'x'.repeat(s.length - 6)}${s.slice(-2)}`;
}

module.exports = { maskPhone, maskName, maskLineId, maskEmail, maskStudentId };
