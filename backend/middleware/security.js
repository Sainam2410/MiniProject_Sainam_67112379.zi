'use strict';
/**
 * Security middleware เพิ่มเติม
 * - originCheck: ป้องกัน CSRF ชั้นที่ 2 (ชั้นแรกคือ SameSite=Strict cookie)
 *   ทุก request ที่เปลี่ยนข้อมูล (POST/PUT/PATCH/DELETE) ต้องมาจาก Origin ของระบบเท่านั้น
 * - noStore: ห้าม browser/proxy cache ข้อมูลส่วนบุคคลจาก API
 */
const config = require('../config');
const { HttpError } = require('../utils/httpError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function originCheck(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const allowed = new Set([config.appOrigin, `${req.protocol}://${req.get('host')}`]);
  const origin = req.get('origin');
  const referer = req.get('referer');
  let source = origin;
  if (!source && referer) {
    try {
      source = new URL(referer).origin;
    } catch (_e) {
      source = null;
    }
  }
  if (!source || !allowed.has(source)) {
    return next(new HttpError(403, 'คำขอไม่ได้มาจากเว็บไซต์ของระบบ (CSRF protection)'));
  }
  return next();
}

function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
}

module.exports = { originCheck, noStore };
