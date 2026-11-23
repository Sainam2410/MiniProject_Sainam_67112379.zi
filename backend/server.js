'use strict';
/**
 * UniFind DPU - Express Server
 * เสิร์ฟทั้ง REST API (/api) และหน้าเว็บ Frontend จาก origin เดียวกัน
 * (ทำให้ใช้ Cookie แบบ SameSite=Strict ได้ และไม่ต้องเปิด CORS)
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { pool } = require('./config/db');
const routes = require('./routes');
const { apiLimiter } = require('./middleware/rateLimiters');
const { originCheck, noStore } = require('./middleware/security');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy); // เมื่ออยู่หลัง reverse proxy เช่น Nginx

// ---------- Security Headers (helmet) ----------
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"], // ไม่อนุญาต inline script -> ลดผลกระทบ XSS
        'style-src': ["'self'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
        // production: ห้ามฝังในเว็บอื่น (กัน Clickjacking)
        // development: อนุญาตให้เปิดดูใน VS Code Simple Browser / Live Preview ได้
        'frame-ancestors': config.isProd ? ["'none'"] : ["'self'", 'vscode-webview:'],
        'upgrade-insecure-requests': config.isProd ? [] : null,
      },
    },
    xFrameOptions: config.isProd ? { action: 'deny' } : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  })
);
app.use((_req, res, next) => {
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(cookieParser());

// ---------- API ----------
app.use('/api', apiLimiter, noStore, originCheck, routes);
app.use('/api', notFound);

// ---------- ไฟล์ภาพเบลอ (สาธารณะ) - ภาพคมชัดไม่ถูกเสิร์ฟแบบ static เด็ดขาด ----------
const publicUploads = path.join(config.uploadDir, 'public');
fs.mkdirSync(publicUploads, { recursive: true });
fs.mkdirSync(path.join(config.uploadDir, 'private'), { recursive: true });
app.use(
  '/uploads/public',
  express.static(publicUploads, { maxAge: '1d', index: false, dotfiles: 'deny', fallthrough: false })
);

// ---------- Frontend ----------
app.use(express.static(config.frontendDir, { extensions: ['html'], index: 'index.html', dotfiles: 'deny' }));
app.use((req, res) => res.status(404).sendFile(path.join(config.frontendDir, 'index.html')));

app.use(errorHandler);

async function start() {
  try {
    await pool.query('SELECT 1');
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE password_hash IS NULL');
    if (Number(n) > 0) {
      // eslint-disable-next-line no-console
      console.warn(`⚠️  มีบัญชีทดสอบ ${n} บัญชีที่ยังไม่ได้ตั้งรหัสผ่าน -> รัน "npm run seed" ก่อนทดสอบ`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('❌ เชื่อมต่อ MySQL ไม่สำเร็จ:', err.message, '\nตรวจสอบค่า DB_* ในไฟล์ .env และนำเข้า database.sql แล้วหรือยัง');
    process.exit(1);
  }
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`💜 UniFind DPU พร้อมใช้งานที่ ${config.appOrigin} (port ${config.port}, ${config.env})`);
  });
}

if (require.main === module) start();

module.exports = app;
