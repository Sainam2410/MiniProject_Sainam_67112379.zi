'use strict';
/**
 * Image Privacy Pipeline
 * 1) ตรวจ Magic bytes จริงของไฟล์ (ไม่เชื่อ MIME/นามสกุลที่ client ส่งมา) รับเฉพาะ JPG / PNG / WEBP
 * 2) Re-encode ด้วย sharp -> ลบ EXIF / GPS / ข้อมูลกล้อง / ICC / XMP ทั้งหมดโดยอัตโนมัติ
 *    (sharp ไม่คัดลอก metadata ใด ๆ ไปยังไฟล์ผลลัพธ์ เว้นแต่เรียก withMetadata())
 *    และ .rotate() หมุนภาพตาม EXIF Orientation ก่อนทิ้ง metadata
 * 3) สร้าง 2 เวอร์ชัน
 *    - private/<random>.webp  : ภาพคมชัด ส่งผ่าน API ที่ตรวจสิทธิ์เท่านั้น (ไม่เปิดเป็น static)
 *    - public/<random>.webp   : ภาพเบลอหนัก + ลายน้ำ "LOCKED" สำหรับหน้าสาธารณะ
 *    => แม้ผู้ไม่หวังดีจะปิด CSS blur ใน DevTools ก็ยังเห็นแค่ภาพที่เบลอจากฝั่งเซิร์ฟเวอร์
 */
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');
const { randomToken } = require('./crypto');
const { HttpError } = require('./httpError');

const PRIVATE_DIR = path.join(config.uploadDir, 'private');
const PUBLIC_DIR = path.join(config.uploadDir, 'public');

function detectImageType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function watermarkSvg(width, height) {
  const lines = [];
  const step = 140;
  for (let y = -height; y < height * 2; y += step) {
    lines.push(
      `<text x="${-width}" y="${y}" transform="rotate(-25 ${width / 2} ${height / 2})">` +
        'UniFind DPU • LOCKED • UniFind DPU • LOCKED • UniFind DPU • LOCKED • UniFind DPU • LOCKED' +
        '</text>'
    );
  }
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>text{font:bold 30px sans-serif;fill:rgba(255,255,255,0.55);letter-spacing:2px}</style>
      <rect width="100%" height="100%" fill="rgba(91,33,182,0.18)"/>
      ${lines.join('')}
    </svg>`
  );
}

/**
 * ประมวลผลรูปที่อัปโหลด
 * @param {Buffer} buffer
 * @returns {Promise<{publicName:string, privateName:string}>}
 */
async function processUpload(buffer) {
  const type = detectImageType(buffer);
  if (!type) throw new HttpError(400, 'รองรับเฉพาะไฟล์ภาพ .jpg, .png และ .webp เท่านั้น');

  let clear;
  try {
    clear = await sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (_e) {
    throw new HttpError(400, 'ไฟล์ภาพเสียหายหรือไม่ถูกต้อง');
  }

  const small = await sharp(clear)
    .resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = small.info;
  const blurred = await sharp(small.data)
    .blur(28)
    .modulate({ saturation: 0.6 })
    .composite([{ input: watermarkSvg(width, height), top: 0, left: 0 }])
    .webp({ quality: 60 })
    .toBuffer();

  await fs.mkdir(PRIVATE_DIR, { recursive: true });
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  const id = randomToken(16);
  const privateName = `${id}.webp`;
  const publicName = `${id}_locked.webp`;
  await fs.writeFile(path.join(PRIVATE_DIR, privateName), clear, { mode: 0o600 });
  await fs.writeFile(path.join(PUBLIC_DIR, publicName), blurred, { mode: 0o644 });
  return { publicName, privateName };
}

/** คืน path ไฟล์ภาพคมชัดอย่างปลอดภัย (กัน path traversal) */
function privatePath(name) {
  if (!/^[a-f0-9]{32}\.webp$/.test(String(name || ''))) return null;
  return path.join(PRIVATE_DIR, name);
}

async function removeImages(publicName, privateName) {
  const tasks = [];
  if (publicName && /^[a-f0-9]{32}_locked\.webp$/.test(publicName)) tasks.push(fs.rm(path.join(PUBLIC_DIR, publicName), { force: true }));
  const p = privatePath(privateName);
  if (p) tasks.push(fs.rm(p, { force: true }));
  await Promise.all(tasks);
}

module.exports = { processUpload, privatePath, removeImages, detectImageType, PUBLIC_DIR, PRIVATE_DIR };
