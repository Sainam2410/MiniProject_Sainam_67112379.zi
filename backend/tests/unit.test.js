'use strict';
/**
 * Unit tests (ไม่ต้องใช้ MySQL) : npm test
 */
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-long-enough-1234567890';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt, encryptJSON, decryptJSON } = require('../utils/crypto');
const { maskPhone, maskName, maskLineId } = require('../utils/masking');
const { scoreMatch, buildGeo, tokenize } = require('../utils/matching');
const { checkAnswer, checkChoice, evaluateAnswers, guessSpace, parseKeywords } = require('../utils/answerCheck');
const { cleanText, isStrongPassword } = require('../utils/sanitize');

test('AES-256-GCM: เข้ารหัส/ถอดรหัสได้ และ IV ไม่ซ้ำ', () => {
  const a = encrypt('0891234545', 'users.phone');
  const b = encrypt('0891234545', 'users.phone');
  assert.notEqual(a, b);
  assert.match(a, /^v1:/);
  assert.equal(decrypt(a, 'users.phone'), '0891234545');
  assert.deepEqual(decryptJSON(encryptJSON(['เขียว|green'], 'question.keywords'), 'question.keywords'), ['เขียว|green']);
});

test('AES-256-GCM: ใช้ context ผิด หรือข้อมูลถูกแก้ไข -> ถอดรหัสไม่ได้', () => {
  const enc = encrypt('secret', 'users.phone');
  assert.equal(decrypt(enc, 'users.line_id'), null);
  const parts = enc.split(':');
  const ct = Buffer.from(parts[3], 'base64');
  ct[0] ^= 0xff;
  parts[3] = ct.toString('base64');
  assert.equal(decrypt(parts.join(':'), 'users.phone'), null);
});

test('Data Masking', () => {
  assert.equal(maskPhone('0891234545'), '089-xxx-xx45');
  assert.equal(maskName('สมชาย', 'ใจดี'), 'คุณสมชาย ใจ***');
  assert.equal(maskLineId('somchai.jd'), 'so******jd');
});

test('Matching: กระเป๋าเงินหายที่หอสมุด ตรงกับกระเป๋าสตางค์ที่พบที่หอสมุด >= 85%', () => {
  const geo = buildGeo(
    [{ id: 4, zone: 'academic' }, { id: 5, zone: 'service' }, { id: 7, zone: 'sport' }],
    [{ location_id: 4, neighbor_id: 5 }, { location_id: 5, neighbor_id: 4 }]
  );
  const lost = { title: 'กระเป๋าเงินหนังสีน้ำตาล', description: 'ลืมไว้บนโต๊ะอ่านหนังสือชั้น 3', category: 'wallet', location_id: 4, lost_at: '2026-11-20 13:00:00' };
  const found = { title: 'กระเป๋าสตางค์หนังสีน้ำตาล', public_description: 'พบบนโต๊ะอ่านหนังสือ ชั้น 3', category: 'wallet', location_id: 4, found_at: '2026-11-20 14:30:00' };
  const umbrella = { title: 'ร่มพับสีม่วง', public_description: '', category: 'personal', location_id: 7, found_at: '2026-11-21 17:20:00' };
  const good = scoreMatch(lost, found, geo);
  const bad = scoreMatch(lost, umbrella, geo);
  assert.ok(good.score >= 85, `score=${good.score}`);
  assert.ok(bad.score < 50, `score=${bad.score}`);
  assert.ok(tokenize('กระเป๋าเงิน').has('wallet'));
});

test('Matching: ของที่ถูกพบก่อนเวลาหายนาน ๆ ไม่ควรจับคู่', () => {
  const geo = buildGeo([{ id: 4, zone: 'academic' }], []);
  const lost = { title: 'กระเป๋าสตางค์', category: 'wallet', location_id: 4, lost_at: '2026-11-20 13:00:00' };
  const found = { title: 'กระเป๋าสตางค์', category: 'wallet', location_id: 4, found_at: '2026-11-10 13:00:00' };
  assert.ok(scoreMatch(lost, found, geo).score <= 20);
});

test('Answer check: คีย์เวิร์ด + คำพ้อง ไม่สนช่องว่าง/ตัวพิมพ์', () => {
  assert.equal(checkAnswer('ซับในสี เขียว ค่ะ', ['เขียว|green']).passed, true);
  assert.equal(checkAnswer('GREEN', ['เขียว|green']).passed, true);
  assert.equal(checkAnswer('สีแดง', ['เขียว|green']).passed, false);
  const qs = [
    { id: 1, keywords: ['บัตรนักศึกษา|กสิกร'], min_match: 1 },
    { id: 2, keywords: ['แมว'], min_match: 1 },
    { id: 3, keywords: ['เขียว'], min_match: 1 },
  ];
  assert.equal(evaluateAnswers(qs, new Map([[1, 'บัตรนักศึกษา'], [2, 'รูปแมว'], [3, 'เขียว']])).verdict, 'pass');
  assert.equal(evaluateAnswers(qs, new Map([[1, 'บัตรนักศึกษา'], [2, 'รูปแมว'], [3, 'ม่วง']])).verdict, 'partial');
  assert.equal(evaluateAnswers(qs, new Map([[1, 'ไม่รู้'], [2, 'หมา'], [3, 'ม่วง']])).verdict, 'fail');
  assert.deepEqual(parseKeywords('บัตรนักศึกษา, กสิกร|kbank'), ['บัตรนักศึกษา', 'กสิกร|kbank']);
});

test('Choice: ต้องเลือกครบและตรง ขาดหรือเกินถือว่าผิด และไม่ส่งไปตรวจแบบ partial', () => {
  assert.equal(checkChoice(['บัตรนักศึกษา', 'บัตร ATM/เดบิต'], ['บัตร ATM/เดบิต', 'บัตรนักศึกษา']), true);
  assert.equal(checkChoice(['บัตรนักศึกษา'], ['บัตรนักศึกษา', 'บัตร ATM/เดบิต']), false);
  assert.equal(checkChoice(['บัตรนักศึกษา', 'บัตร ATM/เดบิต', 'ใบขับขี่'], ['บัตรนักศึกษา', 'บัตร ATM/เดบิต']), false);
  assert.equal(checkChoice('เขียว', ['เขียว']), true);
  const qs = [
    { id: 1, qtype: 'multi', keywords: ['บัตรนักศึกษา', 'บัตร ATM/เดบิต'] },
    { id: 2, qtype: 'multi', keywords: ['ธนบัตร', 'สติกเกอร์'] },
    { id: 3, qtype: 'single', keywords: ['เขียว'] },
  ];
  const ok = new Map([[1, ['บัตรนักศึกษา', 'บัตร ATM/เดบิต']], [2, ['สติกเกอร์', 'ธนบัตร']], [3, ['เขียว']]]);
  assert.equal(evaluateAnswers(qs, ok).verdict, 'pass');
  const twoOfThree = new Map([[1, ['บัตรนักศึกษา', 'บัตร ATM/เดบิต']], [2, ['สติกเกอร์', 'ธนบัตร']], [3, ['ดำ']]]);
  assert.equal(evaluateAnswers(qs, twoOfThree).verdict, 'fail');
  // multi 8 ตัวเลือก = 255 แบบ, single 10 ตัวเลือก = 10 แบบ
  assert.equal(guessSpace([{ qtype: 'multi', options: new Array(8).fill('x') }, { qtype: 'single', options: new Array(10).fill('x') }]), 2550);
  assert.ok(guessSpace([{ qtype: 'single', options: new Array(6).fill('x') }, { qtype: 'single', options: new Array(6).fill('x') }]) < 150);
});

test('Sanitize & password policy', () => {
  assert.equal(cleanText('<script>alert(1)</script>สวัสดี'), 'alert(1)สวัสดี');
  assert.equal(isStrongPassword('Dpu@2026!'), true);
  assert.equal(isStrongPassword('password'), false);
});
