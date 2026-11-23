'use strict';
/**
 * โหลดและตรวจสอบตัวแปรระบบ (Environment Variables)
 * ระบบจะไม่ยอมเริ่มทำงานถ้า Secret Keys ไม่ปลอดภัยพอ (Fail-fast)
 */
const path = require('path');
const dotenv = require('dotenv');

// อ่าน .env ที่ root ของโปรเจกต์ก่อน แล้วค่อย backend/.env (ค่าแรกที่เจอมีผล)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name, fallback) {
  const n = parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  port: int('PORT', 3000),
  appOrigin: env('APP_ORIGIN', 'http://localhost:3000'),
  trustProxy: int('TRUST_PROXY', 0),

  db: {
    host: env('DB_HOST', '127.0.0.1'),
    port: int('DB_PORT', 3306),
    user: env('DB_USER', 'root'),
    password: env('DB_PASSWORD', ''),
    database: env('DB_NAME', 'unifind_dpu'),
    connectionLimit: int('DB_POOL_SIZE', 10),
  },

  jwt: {
    secret: env('JWT_SECRET', ''),
    expiresIn: env('JWT_EXPIRES_IN', '2h'),
    cookieName: 'unifind_token',
    cookieMaxAgeMs: int('JWT_COOKIE_MAX_AGE_MIN', 120) * 60 * 1000,
  },

  cookieSecure: env('COOKIE_SECURE', 'true') !== 'false',
  encryptionKeyHex: env('ENCRYPTION_KEY', ''),
  bcryptRounds: Math.max(12, int('BCRYPT_ROUNDS', 12)),
  allowedEmailDomains: env('ALLOWED_EMAIL_DOMAINS', 'dpu.ac.th')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),

  matchThreshold: int('MATCH_THRESHOLD', 50),
  claimMaxAttempts: int('CLAIM_MAX_ATTEMPTS', 3),
  claimLockHours: int('CLAIM_LOCK_HOURS', 24),
  loginMaxFailures: int('LOGIN_MAX_FAILURES', 5),
  loginLockMinutes: int('LOGIN_LOCK_MINUTES', 15),

  uploadDir: path.resolve(__dirname, '..', 'uploads'),
  frontendDir: path.resolve(__dirname, '..', '..', 'frontend'),
};

function fatal(msg) {
  // eslint-disable-next-line no-console
  console.error(`\n[CONFIG ERROR] ${msg}\nดูวิธีตั้งค่าใน README.md หัวข้อ "ตั้งค่าไฟล์ .env"\n`);
  process.exit(1);
}

if (!/^[0-9a-fA-F]{64}$/.test(config.encryptionKeyHex)) {
  fatal('ENCRYPTION_KEY ต้องเป็นเลขฐาน 16 ยาว 64 ตัวอักษร (256 บิต) - สร้างได้ด้วยคำสั่ง npm run keys');
}
if (config.jwt.secret.length < 32) {
  fatal('JWT_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร - สร้างได้ด้วยคำสั่ง npm run keys');
}
if (config.isProd && !config.cookieSecure) {
  fatal('ห้ามปิด COOKIE_SECURE ใน production');
}

module.exports = config;
