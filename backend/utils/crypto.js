'use strict';
/**
 * Encryption at Rest ด้วย AES-256-GCM (Authenticated Encryption)
 *
 * รูปแบบข้อมูลที่บันทึกลงฐานข้อมูล:
 *   v1:<iv base64>:<authTag base64>:<ciphertext base64>
 *
 * - IV สุ่มใหม่ 12 ไบต์ทุกครั้ง (ห้ามใช้ซ้ำกับคีย์เดิม)
 * - Auth Tag 16 ไบต์ ตรวจจับการแก้ไขข้อมูลในฐานข้อมูล (Tamper detection)
 * - AAD (Additional Authenticated Data) ผูก ciphertext กับ "ชื่อฟิลด์"
 *   เช่น 'users.phone' ทำให้ผู้โจมตีย้ายค่าที่เข้ารหัสข้ามคอลัมน์ไม่ได้
 * - prefix "v1" รองรับการหมุนเวียนคีย์ (Key rotation) ในอนาคต
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const VERSION = 'v1';

let cachedKey = null;
function getKey() {
  if (!cachedKey) {
    const hex = require('../config').encryptionKeyHex;
    cachedKey = Buffer.from(hex, 'hex');
    if (cachedKey.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes');
  }
  return cachedKey;
}

/**
 * เข้ารหัสข้อความ
 * @param {string|null|undefined} plaintext
 * @param {string} context ชื่อฟิลด์ใช้เป็น AAD เช่น 'users.phone'
 * @returns {string|null}
 */
function encrypt(plaintext, context) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  if (!context) throw new Error('encryption context (AAD) is required');
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * ถอดรหัส - หากข้อมูลถูกแก้ไขหรือใช้ context ผิด จะคืนค่า null และไม่โยน error ออกไปถึงผู้ใช้
 * @param {string|null} payload
 * @param {string} context
 * @returns {string|null}
 */
function decrypt(payload, context) {
  if (!payload) return null;
  try {
    const [ver, ivB64, tagB64, ctB64] = String(payload).split(':');
    if (ver !== VERSION || !ivB64 || !tagB64 || ctB64 === undefined) return null;
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'), {
      authTagLength: 16,
    });
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
    return pt.toString('utf8');
  } catch (_e) {
    // eslint-disable-next-line no-console
    console.warn(`[crypto] ถอดรหัสไม่สำเร็จ (context=${context}) - ข้อมูลอาจถูกแก้ไขหรือคีย์ไม่ตรง`);
    return null;
  }
}

function encryptJSON(obj, context) {
  return encrypt(JSON.stringify(obj), context);
}

function decryptJSON(payload, context) {
  const s = decrypt(payload, context);
  if (s === null) return null;
  try {
    return JSON.parse(s);
  } catch (_e) {
    return null;
  }
}

/** สตริงสุ่มสำหรับชื่อไฟล์ ฯลฯ */
function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { encrypt, decrypt, encryptJSON, decryptJSON, randomToken };
