'use strict';
const fs = require('fs');
const { pool, withTransaction } = require('../config/db');
const config = require('../config');
const { HttpError } = require('../utils/httpError');
const { encrypt, decrypt, encryptJSON, decryptJSON } = require('../utils/crypto');
const S = require('../utils/sanitize');
const { maskName, maskPhone, maskLineId } = require('../utils/masking');
const { parseKeywords, normalizeAnswer, guessSpace } = require('../utils/answerCheck');
const { processUpload, privatePath, removeImages } = require('../utils/image');
const { matchFoundItem } = require('../utils/matchService');
const { audit } = require('../utils/audit');

const PAGE_SIZE = 12;
// ชุดคำถามต้องมีแบบคำตอบที่เป็นไปได้อย่างน้อยเท่านี้ (กันการมั่ว: 3 ครั้งเดาถูก <= ~2%)
const MIN_GUESS_SPACE = 150;

function parseOptions(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (_e) { return []; }
  }
  return [];
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function publicImageUrl(name) {
  return name ? `/uploads/public/${name}` : null;
}

/** การ์ดแบบปกปิดข้อมูล (Locked) สำหรับหน้าสาธารณะ */
function toLockedCard(r) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    location: { id: r.location_id, name: r.location_name, icon: r.location_icon },
    foundAt: r.found_at,
    status: r.status,
    publicDescription: r.public_description,
    image: publicImageUrl(r.image_public),
    finderName: maskName(r.first_name, r.last_name),
    questionCount: Number(r.question_count || 0),
    createdAt: r.created_at,
  };
}

/** GET /api/found  (สาธารณะ) ค้นหา + ตัวกรอง */
async function listPublic(req, res) {
  const q = S.cleanText(req.query.q, { max: 60 });
  const where = ['1 = 1'];
  const params = [];
  if (q) {
    where.push('(f.title LIKE ? OR f.public_description LIKE ?)');
    const like = `%${escapeLike(q)}%`;
    params.push(like, like);
  }
  if (req.query.category) {
    where.push('f.category = ?');
    params.push(S.requireCategory(req.query.category));
  }
  const loc = S.optionalInt(req.query.location, { min: 1, max: 255 });
  if (loc) {
    where.push('f.location_id = ?');
    params.push(loc);
  }
  if (req.query.status) {
    const st = String(req.query.status);
    if (!['available', 'pending_claim', 'returned'].includes(st)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
    where.push('f.status = ?');
    params.push(st);
  }
  const from = S.optionalDate(req.query.dateFrom);
  if (from) {
    where.push('f.found_at >= ?');
    params.push(`${from} 00:00:00`);
  }
  const to = S.optionalDate(req.query.dateTo);
  if (to) {
    where.push('f.found_at <= ?');
    params.push(`${to} 23:59:59`);
  }
  const page = S.optionalInt(req.query.page, { min: 1, max: 1000 }) || 1;
  const offset = (page - 1) * PAGE_SIZE;

  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM found_items f WHERE ${whereSql}`, params);
  const [rows] = await pool.execute(
    `SELECT f.id, f.title, f.category, f.location_id, f.found_at, f.status, f.public_description, f.image_public, f.created_at,
            l.name_th AS location_name, l.icon AS location_icon, u.first_name, u.last_name,
            (SELECT COUNT(*) FROM challenge_questions q WHERE q.found_item_id = f.id) AS question_count
       FROM found_items f
       JOIN locations l ON l.id = f.location_id
       JOIN users u ON u.id = f.finder_id
      WHERE ${whereSql}
      ORDER BY FIELD(f.status, 'available', 'pending_claim', 'returned'), f.found_at DESC
      LIMIT ? OFFSET ?`,
    [...params, String(PAGE_SIZE), String(offset)]
  );
  res.json({ items: rows.map(toLockedCard), total: Number(total), page, pageSize: PAGE_SIZE });
}

async function loadFound(id) {
  const [rows] = await pool.execute(
    `SELECT f.*, l.name_th AS location_name, l.icon AS location_icon,
            u.first_name, u.last_name, u.email AS finder_email, u.phone_enc, u.line_id_enc,
            (SELECT COUNT(*) FROM challenge_questions q WHERE q.found_item_id = f.id) AS question_count
       FROM found_items f
       JOIN locations l ON l.id = f.location_id
       JOIN users u ON u.id = f.finder_id
      WHERE f.id = ?`,
    [id]
  );
  if (!rows.length) throw new HttpError(404, 'ไม่พบรายการนี้');
  return rows[0];
}

/** ระดับสิทธิ์ของผู้ใช้ต่อรายการนี้ */
async function accessLevel(user, found) {
  if (!user) return { level: 'locked', claim: null };
  if (found.finder_id === user.id) return { level: 'finder', claim: null };
  const [claims] = await pool.execute(
    `SELECT id, status, attempts, lock_count, locked_until, auto_score
       FROM verification_claims WHERE found_item_id = ? AND claimant_id = ?`,
    [found.id, user.id]
  );
  const claim = claims[0] || null;
  if (claim && ['approved', 'completed'].includes(claim.status)) return { level: 'unlocked', claim };
  if (user.role === 'admin') return { level: 'admin', claim };
  return { level: 'locked', claim };
}

/** GET /api/found/:id  รายละเอียด (ปกปิด/ปลดล็อกตามสิทธิ์) */
async function getDetail(req, res) {
  const id = S.requireInt(req.params.id, 'รหัสรายการ');
  const f = await loadFound(id);
  const { level, claim } = await accessLevel(req.user, f);
  const unlocked = level !== 'locked';

  const base = toLockedCard(f);
  const [questions] = await pool.execute(
    'SELECT id, question, qtype, options_json, answer_keywords_enc, min_match FROM challenge_questions WHERE found_item_id = ? ORDER BY sort_order',
    [id]
  );

  // คะแนนจับคู่สูงสุดระหว่างของหายของผู้ใช้กับรายการนี้
  const [best] = await pool.execute(
    `SELECT m.score, m.lost_item_id, li.title AS lost_title
       FROM matches m JOIN lost_items li ON li.id = m.lost_item_id
      WHERE m.found_item_id = ? AND li.user_id = ?
      ORDER BY m.score DESC LIMIT 1`,
    [id, req.user.id]
  );

  const phone = decrypt(f.phone_enc, 'users.phone');
  const lineId = decrypt(f.line_id_enc, 'users.line_id');

  const payload = {
    access: level,
    item: {
      ...base,
      image: f.image_private && unlocked ? `/api/found/${id}/image` : base.image,
      imageLocked: !unlocked,
      meetingPoint: unlocked ? f.meeting_point : null,
      autoApprove: Boolean(f.auto_approve),
    },
    // Admin เห็นข้อมูลติดต่อแบบ mask (least privilege) - ฉบับเต็มเฉพาะผู้เก็บได้เองและผู้ยืนยันสำเร็จ
    finder: level === 'finder' || level === 'unlocked'
      ? {
          name: `${f.first_name} ${f.last_name}`,
          phone,
          lineId,
          email: f.finder_email,
        }
      : { name: maskName(f.first_name, f.last_name), phone: maskPhone(phone), lineId: maskLineId(lineId), email: null },
    // ตัวเลือกไม่ใช่ความลับ แต่ "ตัวไหนถูก" เป็นความลับ
    questions: questions.map((q) => ({ id: q.id, question: q.question, type: q.qtype, options: parseOptions(q.options_json) })),
    match: best[0] ? { score: best[0].score, lostItemId: best[0].lost_item_id, lostTitle: best[0].lost_title } : null,
    claim: claim
      ? {
          id: claim.id,
          status: claim.status,
          attempts: claim.attempts,
          attemptsLeft: Math.max(0, config.claimMaxAttempts - claim.attempts),
          lockedUntil: claim.locked_until,
          permanentLock: claim.status === 'locked' && !claim.locked_until,
        }
      : { id: null, status: 'none', attempts: 0, attemptsLeft: config.claimMaxAttempts },
  };

  // ข้อมูลลับ + คีย์เวิร์ดคำตอบ ให้เห็นเฉพาะผู้เก็บได้และ Admin เท่านั้น (ผู้ขอรับคืนแม้ผ่านแล้วก็ไม่เห็น)
  if (level === 'finder' || level === 'admin') {
    payload.secretDetail = decrypt(f.secret_detail_enc, 'found.secret_detail');
    payload.questions = questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.qtype,
      options: parseOptions(q.options_json),
      correct: decryptJSON(q.answer_keywords_enc, 'question.keywords') || [],
      minMatch: q.min_match,
    }));
  }

  // ห้องแชต: claim ที่อนุมัติแล้วของรายการนี้
  if (level === 'unlocked') payload.chatClaimId = claim.id;
  if (level === 'finder' || level === 'admin') {
    const [chats] = await pool.execute(
      `SELECT c.id, c.status, u.first_name, u.last_name
         FROM verification_claims c JOIN users u ON u.id = c.claimant_id
        WHERE c.found_item_id = ? AND c.status IN ('approved','completed') ORDER BY c.id DESC`,
      [id]
    );
    payload.approvedClaims = chats.map((c) => ({
      id: c.id,
      status: c.status,
      claimantName: `${c.first_name} ${c.last_name}`,
    }));
  }

  res.json(payload);
}

/** GET /api/found/:id/image  ภาพคมชัด - เฉพาะผู้ที่ปลดล็อกแล้ว */
async function getImage(req, res) {
  const id = S.requireInt(req.params.id, 'รหัสรายการ');
  const f = await loadFound(id);
  const { level } = await accessLevel(req.user, f);
  if (level === 'locked') {
    await audit(req, 'IMAGE_ACCESS_DENIED', { entityType: 'found_item', entityId: id });
    throw new HttpError(403, 'ต้องยืนยันความเป็นเจ้าของก่อนจึงจะดูภาพคมชัดได้');
  }
  const p = privatePath(f.image_private);
  if (!p || !fs.existsSync(p)) throw new HttpError(404, 'ไม่พบไฟล์ภาพ');
  res.set('Cache-Control', 'private, no-store');
  res.type('image/webp');
  res.sendFile(p);
}

/**
 * รับคำถามจากฟอร์ม
 *  แบบตัวเลือก: { type: 'single'|'multi', question, options: [..], correct: [..] }
 *  แบบพิมพ์ (รองรับของเดิม): { type: 'text', question, keywords: "a, b|c" }
 */
function parseQuestions(raw) {
  let list;
  try {
    list = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_e) {
    throw new HttpError(400, 'รูปแบบคำถามยืนยันตัวตนไม่ถูกต้อง');
  }
  if (!Array.isArray(list)) throw new HttpError(400, 'รูปแบบคำถามยืนยันตัวตนไม่ถูกต้อง');
  const out = list
    .filter((q) => q && typeof q === 'object')
    .map((q, i) => {
      const no = i + 1;
      const question = S.cleanText(q.question, { max: 200 });
      const qtype = ['single', 'multi', 'text'].includes(q.type) ? q.type : 'single';
      if (!question) throw new HttpError(400, `กรุณาใส่คำถามข้อที่ ${no}`);
      if (qtype === 'text') {
        const keywords = parseKeywords(S.cleanText(q.keywords, { max: 300, multiline: true }));
        if (!keywords.length) throw new HttpError(400, `กรุณาใส่คำตอบของคำถามข้อที่ ${no}`);
        return { question, qtype, options: null, correct: keywords };
      }
      const seen = new Set();
      const options = (Array.isArray(q.options) ? q.options : [])
        .map((o) => S.cleanText(o, { max: 60 }))
        .filter((o) => {
          const k = normalizeAnswer(o);
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, 12);
      if (options.length < 4) throw new HttpError(400, `คำถามข้อที่ ${no} ต้องมีตัวเลือกอย่างน้อย 4 ตัว`);
      const optionKeys = new Set(options.map(normalizeAnswer));
      const correct = [...new Set((Array.isArray(q.correct) ? q.correct : []).map((c) => S.cleanText(c, { max: 60 })))]
        .filter((c) => optionKeys.has(normalizeAnswer(c)));
      if (!correct.length) throw new HttpError(400, `เลือกคำตอบที่ถูกของคำถามข้อที่ ${no} ด้วย`);
      if (qtype === 'single' && correct.length !== 1) throw new HttpError(400, `คำถามข้อที่ ${no} แบบเลือกข้อเดียว ต้องมีคำตอบถูก 1 ตัว`);
      if (qtype === 'multi' && correct.length === options.length) {
        throw new HttpError(400, `คำถามข้อที่ ${no} ห้ามเลือกถูกทุกตัวเลือก`);
      }
      return { question, qtype, options, correct };
    });
  if (out.length < 2 || out.length > 3) throw new HttpError(400, 'ต้องตั้งคำถามยืนยันตัวตน 2-3 ข้อ');
  if (guessSpace(out) < MIN_GUESS_SPACE) {
    throw new HttpError(400, 'ชุดคำถามนี้เดาง่ายเกินไป ลองเพิ่มตัวเลือก หรือเปลี่ยนสักข้อเป็นแบบเลือกได้หลายข้อ');
  }
  return out;
}

/** POST /api/found  (multipart/form-data) */
async function create(req, res) {
  const b = req.body || {};
  const title = S.requireText(b.title, 'ชื่อสิ่งของ', { max: 120, min: 2 });
  const category = S.requireCategory(b.category);
  const locationId = S.requireInt(b.locationId, 'สถานที่', { min: 1, max: 255 });
  const foundAt = S.requireDateTime(b.foundAt, 'วัน-เวลาที่พบ');
  const publicDescription = S.cleanText(b.publicDescription, { max: 1000, multiline: true });
  const secretDetail = S.requireText(b.secretDetail, 'ข้อมูลลับ/จุดสังเกตเฉพาะ', { max: 1000, multiline: true, min: 5 });
  const meetingPoint = S.requireText(b.meetingPoint, 'จุดนัดรับคืน', { max: 200 });
  const autoApprove = String(b.autoApprove ?? '1') === '1' ? 1 : 0;
  const questions = parseQuestions(b.questions);

  const [locs] = await pool.execute('SELECT id FROM locations WHERE id = ?', [locationId]);
  if (!locs.length) throw new HttpError(400, 'สถานที่ไม่ถูกต้อง');

  let images = { publicName: null, privateName: null };
  if (req.file) images = await processUpload(req.file.buffer);

  let foundId;
  try {
    foundId = await withTransaction(async (conn) => {
      const [r] = await conn.execute(
        `INSERT INTO found_items (finder_id, title, category, location_id, found_at, public_description,
                                  secret_detail_enc, meeting_point, image_public, image_private, auto_approve)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          title,
          category,
          locationId,
          foundAt,
          publicDescription,
          encrypt(secretDetail, 'found.secret_detail'),
          meetingPoint,
          images.publicName,
          images.privateName,
          autoApprove,
        ]
      );
      let order = 1;
      for (const q of questions) {
        await conn.execute(
          `INSERT INTO challenge_questions (found_item_id, question, qtype, options_json, answer_keywords_enc, min_match, sort_order)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
          [
            r.insertId,
            q.question,
            q.qtype,
            q.options ? JSON.stringify(q.options) : null,
            encryptJSON(q.correct, 'question.keywords'),
            order,
          ]
        );
        order += 1;
      }
      return r.insertId;
    });
  } catch (err) {
    await removeImages(images.publicName, images.privateName);
    throw err;
  }

  await audit(req, 'FOUND_CREATED', { entityType: 'found_item', entityId: foundId, details: { category, locationId } });
  const matched = await matchFoundItem({
    id: foundId,
    finder_id: req.user.id,
    title,
    category,
    location_id: locationId,
    found_at: foundAt,
    public_description: publicDescription,
  });
  res.status(201).json({
    message: 'แจ้งพบสิ่งของสำเร็จ ขอบคุณที่ช่วยเหลือเพื่อนชาว DPU 💜',
    id: foundId,
    notifiedOwners: matched,
  });
}

/** GET /api/found/mine */
async function mine(req, res) {
  const [rows] = await pool.execute(
    `SELECT f.id, f.title, f.category, f.location_id, f.found_at, f.status, f.public_description, f.image_public, f.created_at,
            l.name_th AS location_name, l.icon AS location_icon, u.first_name, u.last_name,
            (SELECT COUNT(*) FROM challenge_questions q WHERE q.found_item_id = f.id) AS question_count,
            (SELECT COUNT(*) FROM verification_claims c WHERE c.found_item_id = f.id AND c.status = 'pending_review') AS pending_claims
       FROM found_items f JOIN locations l ON l.id = f.location_id JOIN users u ON u.id = f.finder_id
      WHERE f.finder_id = ? ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json({ items: rows.map((r) => ({ ...toLockedCard(r), pendingClaims: Number(r.pending_claims) })) });
}

/** DELETE /api/found/:id  (ผู้เก็บได้ลบได้เมื่อยังไม่มีคำขอที่อนุมัติ / Admin ลบได้เสมอ) */
async function remove(req, res) {
  const id = S.requireInt(req.params.id, 'รหัสรายการ');
  const f = await loadFound(id);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && f.finder_id !== req.user.id) throw new HttpError(403, 'คุณไม่มีสิทธิ์ลบรายการนี้');
  if (!isAdmin) {
    const [active] = await pool.execute(
      "SELECT COUNT(*) AS n FROM verification_claims WHERE found_item_id = ? AND status IN ('approved','pending_review')",
      [id]
    );
    if (Number(active[0].n) > 0) throw new HttpError(409, 'มีคำขอรับคืนที่กำลังดำเนินการอยู่ ไม่สามารถลบได้');
  }
  await pool.execute('DELETE FROM found_items WHERE id = ?', [id]);
  await removeImages(f.image_public, f.image_private);
  await audit(req, 'FOUND_DELETED', { entityType: 'found_item', entityId: id });
  res.json({ message: 'ลบรายการเรียบร้อย' });
}

module.exports = { listPublic, getDetail, getImage, create, mine, remove, toLockedCard, parseQuestions, parseOptions };
