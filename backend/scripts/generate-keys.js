'use strict';
/**
 * npm run keys  -> สร้าง Secret Keys แบบสุ่มที่ปลอดภัย สำหรับคัดลอกไปใส่ในไฟล์ .env
 * (ไม่ต้องโหลด config เพราะใช้ตอนที่ยังไม่มี .env)
 */
const crypto = require('crypto');

console.log('# คัดลอก 2 บรรทัดนี้ไปใส่ในไฟล์ .env (ห้าม commit ขึ้น Git)');
console.log(`ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`);
console.log(`JWT_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
