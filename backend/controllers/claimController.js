'use strict';
/**
 * Blind Verification - ยืนยันความเป็นเจ้าของด้วยคำถามลับ
 *
 * กติกา
 *  - ตอบถูกครบทุกข้อ + ผู้เก็บได้เปิด "อนุมัติอัตโนมัติ"  -> approved (ปลดล็อกทันที)
 *  - ตอบถูกครบแต่ปิดอนุมัติอัตโนมัติ หรือถูก >= 50%      -> pending_review (ผู้เก็บได้/Admin ตัดสิน)
 *  - ถูก < 50%                                          -> นับเป็นการตอบผิด 1 ครั้ง
 *  - ผิดครบ 3 ครั้ง -> locked (ครั้งแรกล็อก 24 ชม., ครั้งที่สองล็อกถาวรจนกว่า Admin ปลด) + แจ้งเตือน Admin
 *  - ไม่บอกว่าข้อไหนผิด (กันผู้ไม่หวังดีใช้ระบบเป็น oracle เดาทีละข้อ)
 *  - ใช้ SELECT ... FOR UPDATE ใน Transaction กัน race condition ยิงคำตอบพร้อมกันหลาย request เพื่อเลี่ยงตัวนับ
 */
const { pool, withTransaction } = require('../config/db');
const config = require('../config');
const { HttpError } = require('../utils/httpError');
const { encryptJSON, decryptJSON } = require('../utils/crypto');
const S = require('../utils/sanitize');
const { evaluateAnswers, normalizeAnswer } = require('../utils/answerCheck');
const { parseOptions } = require('./foundController');
const { audit, notify, notifyAdmins } = require('../utils/audit');
const { maskName, maskStudentId } = require('../utils/masking');

function lockOutcome(claim) {
  const lockCount = Number(claim.lock_count) + 1;
  const permanent = lockCount >= 2;
  return { lockCount, permanent };
}

/** POST /api/claims/found/:id/answers */
async function submitAnswers(req, res) {
  const foundId = S.requireInt(req.params.id, 'รหัสรายการ');
  const body = req.body || {};
  if (!Array.isArray(body.answers) || !body.answers.length || body.answers.length > 3) {
    throw new HttpError(400, 'กรุณาตอบคำถามให้ครบทุกข้อ');
  }
  // คำตอบเป็นข้อความ (คำถามแบบพิมพ์) หรือ array ของตัวเลือก (คำถามแบบเลือก)
  const answers = new Map();
  for (const a of body.answers) {
    const qid = S.requireInt(a && a.questionId, 'รหัสคำถาม');
    const raw = a && a.answer;
    if (Array.isArray(raw)) {
      if (!raw.length || raw.length > 12) throw new HttpError(400, 'กรุณาตอบคำถามให้ครบทุกข้อ');
      answers.set(qid, raw.map((x) => S.cleanText(x, { max: 60 })).filter(Boolean));
    } else {
      answers.set(qid, S.requireText(raw, 'คำตอบ', { max: 300 }));
    }
  }
  const lostItemId = S.optionalInt(body.lostItemId);
  if (lostItemId) {
    const [own] = await pool.execute('SELECT id FROM lost_items WHERE id = ? AND user_id = ?', [lostItemId, req.user.id]);
    if (!own.length) throw new HttpError(400, 'รายการแจ้งของหายไม่ถูกต้อง');
  }

  const result = await withTransaction(async (conn) => {
    const [[found]] = await conn.execute(
      'SELECT id, finder_id, title, status, auto_approve FROM found_items WHERE id = ? FOR UPDATE',
      [foundId]
    );
    if (!found) throw new HttpError(404, 'ไม่พบรายการนี้');
    if (found.finder_id === req.user.id) throw new HttpError(400, 'ไม่สามารถยืนยันรายการที่คุณแจ้งพบเองได้');
    if (found.status === 'returned') throw new HttpError(409, 'สิ่งของชิ้นนี้ถูกส่งคืนเจ้าของเรียบร้อยแล้ว');

    const [[{ others }]] = await conn.execute(
      "SELECT COUNT(*) AS others FROM verification_claims WHERE found_item_id = ? AND claimant_id <> ? AND status = 'approved'",
      [foundId, req.user.id]
    );
    if (Number(others) > 0) throw new HttpError(409, 'รายการนี้มีผู้ยืนยันความเป็นเจ้าของแล้ว และอยู่ระหว่างนัดรับคืน');

    await conn.execute(
      'INSERT IGNORE INTO verification_claims (found_item_id, claimant_id, lost_item_id) VALUES (?, ?, ?)',
      [foundId, req.user.id, lostItemId]
    );
    const [[claim]] = await conn.execute(
      `SELECT id, status, attempts, lock_count, locked_until,
              (locked_until IS NOT NULL AND locked_until <= NOW()) AS lock_expired
         FROM verification_claims WHERE found_item_id = ? AND claimant_id = ? FOR UPDATE`,
      [foundId, req.user.id]
    );

    if (claim.status === 'locked') {
      if (Number(claim.lock_expired)) {
        await conn.execute(
          "UPDATE verification_claims SET status = 'in_progress', attempts = 0, locked_until = NULL WHERE id = ?",
          [claim.id]
        );
        claim.status = 'in_progress';
        claim.attempts = 0;
      } else {
        throw new HttpError(
          423,
          claim.locked_until
            ? 'สิทธิ์การขอรับคืนรายการนี้ถูกล็อกชั่วคราว เนื่องจากตอบผิดครบ 3 ครั้ง'
            : 'สิทธิ์การขอรับคืนรายการนี้ถูกล็อก กรุณาติดต่อผู้ดูแลระบบที่ One Stop Service',
          { lockedUntil: claim.locked_until }
        );
      }
    }
    if (claim.status === 'pending_review') throw new HttpError(409, 'คำตอบของคุณอยู่ระหว่างรอผู้เก็บได้/Admin ตรวจสอบ');
    if (['approved', 'completed'].includes(claim.status)) throw new HttpError(409, 'คุณยืนยันความเป็นเจ้าของรายการนี้แล้ว');

    const [qRows] = await conn.execute(
      'SELECT id, question, qtype, options_json, answer_keywords_enc, min_match FROM challenge_questions WHERE found_item_id = ? ORDER BY sort_order',
      [foundId]
    );
    const questions = qRows.map((q) => ({
      id: q.id,
      question: q.question,
      qtype: q.qtype,
      options: parseOptions(q.options_json),
      keywords: decryptJSON(q.answer_keywords_enc, 'question.keywords'),
      min_match: q.min_match,
    }));
    if (!questions.length || questions.some((q) => !Array.isArray(q.keywords))) {
      throw new HttpError(503, 'รายการนี้ยังตั้งค่าคำถามไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลระบบ');
    }
    // ตรวจรูปแบบคำตอบก่อน (คำตอบที่ผิดรูปแบบไม่นับเป็นการตอบผิด)
    for (const q of questions) {
      if (!answers.has(q.id)) throw new HttpError(400, 'กรุณาตอบคำถามให้ครบทุกข้อ');
      if (q.qtype === 'single' || q.qtype === 'multi') {
        const picked = [].concat(answers.get(q.id));
        const allowed = new Set(q.options.map(normalizeAnswer));
        if (!picked.length || picked.some((x) => !allowed.has(normalizeAnswer(x)))) {
          throw new HttpError(400, 'คำตอบไม่ตรงกับตัวเลือกที่มีให้');
        }
        if (q.qtype === 'single' && picked.length !== 1) throw new HttpError(400, 'คำถามแบบเลือกข้อเดียว เลือกได้ 1 ตัวเท่านั้น');
        answers.set(q.id, picked);
      }
    }

    const evaluation = evaluateAnswers(questions, answers);
    const answersEnc = encryptJSON(
      questions.map((q) => ({ questionId: q.id, answer: answers.get(q.id) })),
      'claims.answers'
    );
    const link = `/match-verify.html?id=${foundId}`;

    if (evaluation.verdict === 'pass' && found.auto_approve) {
      await conn.execute(
        `UPDATE verification_claims SET status = 'approved', auto_score = ?, answers_enc = ?, approved_at = NOW(),
                lost_item_id = COALESCE(?, lost_item_id) WHERE id = ?`,
        [evaluation.percent, answersEnc, lostItemId, claim.id]
      );
      await conn.execute("UPDATE found_items SET status = 'pending_claim' WHERE id = ?", [foundId]);
      await notify(found.finder_id, 'claim_approved', `มีผู้ยืนยันความเป็นเจ้าของ "${found.title}" สำเร็จ กรุณานัดรับคืน`, link, conn);
      await audit(req, 'CLAIM_AUTO_APPROVED', { entityType: 'claim', entityId: claim.id, details: { score: evaluation.percent } }, conn);
      return { status: 'approved', message: 'ยืนยันตัวตนสำเร็จ! 🎉 ปลดล็อกข้อมูลผู้เก็บได้และภาพคมชัดแล้ว' };
    }

    if (evaluation.verdict === 'pass' || evaluation.verdict === 'partial') {
      await conn.execute(
        `UPDATE verification_claims SET status = 'pending_review', auto_score = ?, answers_enc = ?,
                lost_item_id = COALESCE(?, lost_item_id) WHERE id = ?`,
        [evaluation.percent, answersEnc, lostItemId, claim.id]
      );
      await conn.execute("UPDATE found_items SET status = 'pending_claim' WHERE id = ? AND status = 'available'", [foundId]);
      await notify(found.finder_id, 'claim_review', `มีคำขอรับคืน "${found.title}" รอให้คุณตรวจสอบคำตอบ`, '/dashboard.html#review', conn);
      await audit(req, 'CLAIM_SUBMITTED_REVIEW', { entityType: 'claim', entityId: claim.id, details: { score: evaluation.percent } }, conn);
      return {
        status: 'pending_review',
        message: 'ส่งคำตอบแล้ว ⏳ กำลังรอผู้เก็บได้หรือผู้ดูแลระบบตรวจสอบ ระบบจะแจ้งเตือนเมื่อมีผล',
      };
    }

    // ตอบผิด
    const attempts = Number(claim.attempts) + 1;
    if (attempts >= config.claimMaxAttempts) {
      const { lockCount, permanent } = lockOutcome(claim);
      await conn.execute(
        `UPDATE verification_claims
            SET status = 'locked', attempts = ?, lock_count = ?, auto_score = ?, answers_enc = ?,
                locked_until = ${permanent ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? HOUR)'}
          WHERE id = ?`,
        permanent
          ? [attempts, lockCount, evaluation.percent, answersEnc, claim.id]
          : [attempts, lockCount, evaluation.percent, answersEnc, String(config.claimLockHours), claim.id]
      );
      await notifyAdmins(
        'claim_locked',
        `⚠️ คำขอรับคืน "${found.title}" ถูกล็อก: ผู้ใช้ ${req.user.studentId} ตอบผิดครบ ${config.claimMaxAttempts} ครั้ง`,
        '/admin.html#claims',
        conn
      );
      await notify(found.finder_id, 'claim_locked', `มีผู้พยายามตอบคำถาม "${found.title}" ผิดครบ ${config.claimMaxAttempts} ครั้ง ระบบล็อกสิทธิ์แล้ว`, link, conn);
      await audit(req, 'CLAIM_LOCKED', { entityType: 'claim', entityId: claim.id, details: { attempts, permanent } }, conn);
      return {
        status: 'locked',
        attemptsLeft: 0,
        message: permanent
          ? 'ตอบผิดครบ 3 ครั้ง สิทธิ์ถูกล็อกจนกว่าผู้ดูแลระบบจะตรวจสอบ หากเป็นเจ้าของจริงกรุณาติดต่อ One Stop Service'
          : `ตอบผิดครบ 3 ครั้ง สิทธิ์การขอรับคืนรายการนี้ถูกล็อก ${config.claimLockHours} ชั่วโมง และระบบได้แจ้งผู้ดูแลแล้ว`,
      };
    }
    await conn.execute(
      'UPDATE verification_claims SET attempts = ?, auto_score = ?, answers_enc = ? WHERE id = ?',
      [attempts, evaluation.percent, answersEnc, claim.id]
    );
    await audit(req, 'CLAIM_FAILED', { entityType: 'claim', entityId: claim.id, details: { attempt: attempts } }, conn);
    const left = config.claimMaxAttempts - attempts;
    return { status: 'in_progress', attemptsLeft: left, message: `คำตอบยังไม่ถูกต้อง เหลือโอกาสอีก ${left} ครั้ง` };
  });

  res.json(result);
}

/** GET /api/claims/review  คำขอที่รอตรวจสอบ (ผู้เก็บได้เห็นของตัวเอง / Admin เห็นทั้งหมด) */
async function reviewList(req, res) {
  const isAdmin = req.user.role === 'admin';
  const [rows] = await pool.execute(
    `SELECT c.id, c.found_item_id, c.auto_score, c.answers_enc, c.attempts, c.created_at, c.updated_at,
            f.title, f.category, u.first_name, u.last_name, u.student_id
       FROM verification_claims c
       JOIN found_items f ON f.id = c.found_item_id
       JOIN users u ON u.id = c.claimant_id
      WHERE c.status = 'pending_review' ${isAdmin ? '' : 'AND f.finder_id = ?'}
      ORDER BY c.updated_at ASC`,
    isAdmin ? [] : [req.user.id]
  );
  const out = [];
  for (const r of rows) {
    const [qs] = await pool.execute(
      'SELECT id, question, qtype, answer_keywords_enc FROM challenge_questions WHERE found_item_id = ? ORDER BY sort_order',
      [r.found_item_id]
    );
    const given = decryptJSON(r.answers_enc, 'claims.answers') || [];
    out.push({
      id: r.id,
      foundItemId: r.found_item_id,
      title: r.title,
      category: r.category,
      autoScore: r.auto_score,
      attempts: r.attempts,
      submittedAt: r.updated_at,
      claimant: { name: maskName(r.first_name, r.last_name), studentId: maskStudentId(r.student_id) },
      qa: qs.map((q) => {
        const ans = (given.find((g) => g.questionId === q.id) || {}).answer;
        return {
          question: q.question,
          type: q.qtype,
          expected: decryptJSON(q.answer_keywords_enc, 'question.keywords') || [],
          answer: Array.isArray(ans) ? ans.join(', ') : ans || '',
        };
      }),
    });
  }
  res.json({ claims: out });
}

async function loadClaimForUpdate(conn, claimId) {
  const [[c]] = await conn.execute(
    `SELECT c.*, f.finder_id, f.title, f.status AS found_status
       FROM verification_claims c JOIN found_items f ON f.id = c.found_item_id
      WHERE c.id = ? FOR UPDATE`,
    [claimId]
  );
  if (!c) throw new HttpError(404, 'ไม่พบคำขอนี้');
  return c;
}

/** POST /api/claims/:id/decision  { decision: 'approve' | 'reject' } */
async function decide(req, res) {
  const claimId = S.requireInt(req.params.id, 'รหัสคำขอ');
  const decision = String((req.body && req.body.decision) || '');
  if (!['approve', 'reject'].includes(decision)) throw new HttpError(400, 'การตัดสินไม่ถูกต้อง');

  const result = await withTransaction(async (conn) => {
    const c = await loadClaimForUpdate(conn, claimId);
    if (c.finder_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'คุณไม่มีสิทธิ์ตัดสินคำขอนี้');
    if (c.status !== 'pending_review') throw new HttpError(409, 'คำขอนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ');
    const link = `/match-verify.html?id=${c.found_item_id}`;

    if (decision === 'approve') {
      await conn.execute(
        `UPDATE verification_claims SET status = 'approved', reviewed_by = ?, reviewed_at = NOW(), approved_at = NOW() WHERE id = ?`,
        [req.user.id, claimId]
      );
      await conn.execute("UPDATE found_items SET status = 'pending_claim' WHERE id = ?", [c.found_item_id]);
      await notify(c.claimant_id, 'claim_approved', `ยืนยันตัวตนสำเร็จ! 🎉 "${c.title}" ปลดล็อกข้อมูลการติดต่อแล้ว`, link, conn);
      await audit(req, 'CLAIM_APPROVED', { entityType: 'claim', entityId: claimId }, conn);
      return { status: 'approved', message: 'อนุมัติคำขอแล้ว ผู้ขอรับคืนจะเห็นข้อมูลติดต่อและนัดรับคืนกับคุณได้' };
    }

    const attempts = Number(c.attempts) + 1;
    let status = 'in_progress';
    if (attempts >= config.claimMaxAttempts) {
      const { lockCount, permanent } = lockOutcome(c);
      status = 'locked';
      await conn.execute(
        `UPDATE verification_claims SET status = 'locked', attempts = ?, lock_count = ?, reviewed_by = ?, reviewed_at = NOW(),
                locked_until = ${permanent ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? HOUR)'} WHERE id = ?`,
        permanent
          ? [attempts, lockCount, req.user.id, claimId]
          : [attempts, lockCount, req.user.id, String(config.claimLockHours), claimId]
      );
      await notifyAdmins('claim_locked', `⚠️ คำขอรับคืน "${c.title}" ถูกล็อกหลังถูกปฏิเสธครบ ${config.claimMaxAttempts} ครั้ง`, '/admin.html#claims', conn);
    } else {
      await conn.execute(
        "UPDATE verification_claims SET status = 'in_progress', attempts = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
        [attempts, req.user.id, claimId]
      );
    }
    const [[{ active }]] = await conn.execute(
      "SELECT COUNT(*) AS active FROM verification_claims WHERE found_item_id = ? AND status IN ('pending_review','approved')",
      [c.found_item_id]
    );
    if (Number(active) === 0) {
      await conn.execute("UPDATE found_items SET status = 'available' WHERE id = ? AND status = 'pending_claim'", [c.found_item_id]);
    }
    await notify(
      c.claimant_id,
      'claim_rejected',
      status === 'locked'
        ? `คำขอรับคืน "${c.title}" ไม่ผ่านการตรวจสอบและถูกล็อกสิทธิ์`
        : `คำตอบสำหรับ "${c.title}" ยังไม่ถูกต้อง เหลือโอกาสอีก ${config.claimMaxAttempts - attempts} ครั้ง`,
      link,
      conn
    );
    await audit(req, 'CLAIM_REJECTED', { entityType: 'claim', entityId: claimId, details: { attempts } }, conn);
    return { status, message: 'ปฏิเสธคำขอแล้ว' };
  });
  res.json(result);
}

/** POST /api/claims/:id/complete  ผู้เก็บได้/Admin ยืนยันว่าส่งคืนเรียบร้อย */
async function complete(req, res) {
  const claimId = S.requireInt(req.params.id, 'รหัสคำขอ');
  await withTransaction(async (conn) => {
    const c = await loadClaimForUpdate(conn, claimId);
    if (c.finder_id !== req.user.id && req.user.role !== 'admin') throw new HttpError(403, 'คุณไม่มีสิทธิ์ดำเนินการนี้');
    if (c.status !== 'approved') throw new HttpError(409, 'คำขอนี้ยังไม่ได้รับการอนุมัติ');
    await conn.execute("UPDATE verification_claims SET status = 'completed', completed_at = NOW() WHERE id = ?", [claimId]);
    await conn.execute("UPDATE found_items SET status = 'returned' WHERE id = ?", [c.found_item_id]);
    // ปิดรายการแจ้งของหายที่เกี่ยวข้องของผู้รับคืน
    await conn.execute(
      `UPDATE lost_items SET status = 'resolved'
        WHERE user_id = ? AND status IN ('searching','matched')
          AND (id = ? OR id IN (SELECT lost_item_id FROM matches WHERE found_item_id = ?))`,
      [c.claimant_id, c.lost_item_id || 0, c.found_item_id]
    );
    await notify(c.claimant_id, 'returned', `"${c.title}" ถูกบันทึกว่ารับคืนเรียบร้อยแล้ว ขอบคุณที่ใช้ UniFind DPU 💜`, `/match-verify.html?id=${c.found_item_id}`, conn);
    await audit(req, 'CLAIM_COMPLETED', { entityType: 'claim', entityId: claimId }, conn);
  });
  res.json({ message: 'บันทึกการรับคืนเรียบร้อย 🎉' });
}

/** GET /api/claims/mine */
async function mine(req, res) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.found_item_id, c.status, c.attempts, c.locked_until, c.updated_at, f.title, f.category
       FROM verification_claims c JOIN found_items f ON f.id = c.found_item_id
      WHERE c.claimant_id = ? ORDER BY c.updated_at DESC`,
    [req.user.id]
  );
  res.json({
    claims: rows.map((r) => ({
      id: r.id,
      foundItemId: r.found_item_id,
      title: r.title,
      category: r.category,
      status: r.status,
      attemptsLeft: Math.max(0, config.claimMaxAttempts - r.attempts),
      lockedUntil: r.locked_until,
      updatedAt: r.updated_at,
    })),
  });
}

module.exports = { submitAnswers, reviewList, decide, complete, mine };
