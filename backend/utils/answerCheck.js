'use strict';
/**
 * ตรวจคำตอบคำถามยืนยันความเป็นเจ้าของ (ฟังก์ชันบริสุทธิ์ ทดสอบได้)
 *
 * ชนิดคำถาม
 *  - single : เลือกได้ข้อเดียว  -> ต้องตรงกับตัวเลือกที่ถูก
 *  - multi  : เลือกได้หลายข้อ   -> ต้องเลือก "ครบและตรง" ทุกตัว (ขาดหรือเกินถือว่าผิด)
 *  - text   : พิมพ์ตอบ (รองรับข้อมูลเดิม) -> ตรวจคีย์เวิร์ด
 */

function normalizeAnswer(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\s​-‍﻿]+/g, '')
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

/** ตรวจคำตอบแบบพิมพ์ด้วยคีย์เวิร์ด (คีย์เวิร์ดหนึ่งตัวใส่คำพ้องได้ด้วย "|") */
function checkAnswer(answer, keywords, minMatch = 1) {
  const a = normalizeAnswer(answer);
  if (!a || !Array.isArray(keywords) || !keywords.length) return { passed: false, matched: 0 };
  let matched = 0;
  for (const kw of keywords) {
    const alternatives = String(kw).split('|').map(normalizeAnswer).filter(Boolean);
    if (alternatives.some((alt) => a.includes(alt))) matched += 1;
  }
  const need = Math.max(1, Math.min(minMatch, keywords.length));
  return { passed: matched >= need, matched };
}

/** ตรวจคำตอบแบบตัวเลือก: ชุดที่เลือกต้องเท่ากับชุดคำตอบที่ถูกทุกตัว */
function checkChoice(selected, correct) {
  const sel = new Set((Array.isArray(selected) ? selected : [selected]).map(normalizeAnswer).filter(Boolean));
  const cor = new Set((correct || []).map(normalizeAnswer).filter(Boolean));
  if (!sel.size || sel.size !== cor.size) return false;
  for (const c of cor) if (!sel.has(c)) return false;
  return true;
}

/**
 * ประเมินคำตอบทั้งชุด
 * @param {{id:number, qtype?:string, keywords:string[], min_match:number}[]} questions
 *        (keywords = คีย์เวิร์ดสำหรับ text หรือ ตัวเลือกที่ถูกสำหรับ single/multi)
 * @param {Map<number, string|string[]>} answers
 * @returns {{ ratio:number, percent:number, verdict:'pass'|'partial'|'fail' }}
 *
 * verdict 'partial' (ส่งให้คนเก็บได้ตรวจเอง) ใช้เฉพาะเมื่อข้อที่ผิดเป็นแบบพิมพ์เท่านั้น
 * เพราะคำตอบแบบพิมพ์อาจสะกดต่างกัน แต่แบบตัวเลือกผิดคือผิดจริง ไม่ส่งไปรบกวนคนเก็บได้
 */
function evaluateAnswers(questions, answers) {
  if (!questions.length) return { ratio: 0, percent: 0, verdict: 'fail' };
  let passed = 0;
  let choiceFailed = false;
  for (const q of questions) {
    const type = q.qtype || 'text';
    const ok =
      type === 'text'
        ? checkAnswer(answers.get(q.id), q.keywords, q.min_match).passed
        : checkChoice(answers.get(q.id), q.keywords);
    if (ok) passed += 1;
    else if (type !== 'text') choiceFailed = true;
  }
  const ratio = passed / questions.length;
  const percent = Math.round(ratio * 100);
  let verdict = 'fail';
  if (ratio === 1) verdict = 'pass';
  else if (ratio >= 0.5 && !choiceFailed) verdict = 'partial';
  return { ratio, percent, verdict };
}

/**
 * จำนวนแบบที่เป็นไปได้ทั้งหมดของการเดา (ยิ่งมากยิ่งเดายาก)
 * single = n ตัวเลือก, multi = 2^n - 1 แบบ, text = ถือว่าเดายากมาก (1000)
 */
function guessSpace(questions) {
  return questions.reduce((acc, q) => {
    const n = (q.options || []).length;
    if (q.qtype === 'multi') return acc * (2 ** n - 1);
    if (q.qtype === 'single') return acc * n;
    return acc * 1000;
  }, 1);
}

/** แปลงข้อความคีย์เวิร์ดจากฟอร์ม "บัตรนักศึกษา, กสิกร|kbank" -> array (คำถามแบบพิมพ์) */
function parseKeywords(input) {
  return String(input || '')
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter((k) => normalizeAnswer(k).length > 0)
    .slice(0, 10);
}

module.exports = { normalizeAnswer, checkAnswer, checkChoice, evaluateAnswers, guessSpace, parseKeywords };
