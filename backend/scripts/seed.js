'use strict';
/**
 * npm run seed
 * เติมข้อมูลอ่อนไหวของบัญชี/รายการทดสอบด้วย "คีย์ของเครื่องคุณเอง"
 *   - ตั้งรหัสผ่านบัญชีทดสอบด้วย bcrypt (salt rounds >= 12)
 *   - เข้ารหัสเบอร์โทร / Line ID / ข้อมูลลับ / คีย์เวิร์ดคำตอบ ด้วย AES-256-GCM
 *   - คำนวณคะแนนจับคู่ใหม่ด้วย Matching Engine จริง
 *
 * ใช้ --force เพื่อรีเซ็ตรหัสผ่านทุกบัญชีทดสอบกลับเป็นค่าเริ่มต้น
 */
const bcrypt = require('bcrypt');
const config = require('../config');
const { pool } = require('../config/db');
const { encrypt, encryptJSON } = require('../utils/crypto');
const { matchLostItem } = require('../utils/matchService');

const FORCE = process.argv.includes('--force');
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'Dpu@2026!';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@DPU2026!';

const USERS = {
  1: { password: ADMIN_PASSWORD, phone: '021234567', lineId: 'unifind_admin' },
  2: { password: USER_PASSWORD, phone: '0891234545', lineId: 'somchai.jd' },
  3: { password: USER_PASSWORD, phone: '0812345678', lineId: 'suda_rr' },
  4: { password: USER_PASSWORD, phone: '0923456781', lineId: 'nattapong.s' },
  5: { password: USER_PASSWORD, phone: '0634567812', lineId: 'pim.kaewsai' },
};

const FOUND_SECRETS = {
  1: 'ข้างในมีบัตรนักศึกษา DPU ชื่อสมชาย, บัตร ATM ธนาคารกสิกรไทย, สติกเกอร์รูปแมวสีส้ม, ซับในสีเขียว และธนบัตร 100 บาท 2 ใบ',
  2: 'เคสมีสติกเกอร์รูปดาวสีม่วง ชื่ออุปกรณ์ในบลูทูธคือ Pim’s AirPods',
  3: 'พวงกุญแจห้อยตุ๊กตาหมีสีน้ำตาล มีกุญแจ 2 ดอก (กุญแจรถ + กุญแจล็อกเบาะ)',
  4: 'บัตรนักศึกษาคณะวิศวกรรมศาสตร์ รหัสลงท้าย 5521',
  5: 'ด้ามจับเป็นไม้ ปลอกร่มลายจุดสีขาว',
};

// คำตอบที่ถูกของคำถามแบบตัวเลือก (ต้องตรงกับ options_json ใน database.sql)
const QUESTION_ANSWERS = {
  1: ['บัตรนักศึกษา', 'บัตร ATM/เดบิต'],
  2: ['ธนบัตร', 'สติกเกอร์'],
  3: ['เขียว'],
  4: ['สติกเกอร์'],
  5: ['Apple'],
  6: ['ตุ๊กตาหมี'],
  7: ['2'],
  8: ['66'],
  9: ['สายคล้องคอ', 'ซองใส่บัตร'],
  10: ['ไม้'],
  11: ['ปลอกลายจุด'],
};

async function main() {
  console.log('🌱 เริ่ม seed ข้อมูลทดสอบ UniFind DPU ...');
  for (const [id, u] of Object.entries(USERS)) {
    const [[row]] = await pool.execute('SELECT id, email, password_hash FROM users WHERE id = ?', [id]);
    if (!row) continue;
    const sets = ['phone_enc = ?', 'line_id_enc = ?'];
    const params = [encrypt(u.phone, 'users.phone'), encrypt(u.lineId, 'users.line_id')];
    if (!row.password_hash || FORCE) {
      sets.push('password_hash = ?', 'failed_login_count = 0', 'locked_until = NULL');
      params.push(await bcrypt.hash(u.password, config.bcryptRounds));
    }
    await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    console.log(`  ✔ ผู้ใช้ ${row.email}`);
  }

  for (const [id, secret] of Object.entries(FOUND_SECRETS)) {
    await pool.execute('UPDATE found_items SET secret_detail_enc = ? WHERE id = ?', [
      encrypt(secret, 'found.secret_detail'),
      id,
    ]);
  }
  for (const [id, kws] of Object.entries(QUESTION_ANSWERS)) {
    await pool.execute('UPDATE challenge_questions SET answer_keywords_enc = ? WHERE id = ?', [
      encryptJSON(kws, 'question.keywords'),
      id,
    ]);
  }
  console.log('  ✔ เข้ารหัสข้อมูลลับและคำตอบที่ถูกด้วย AES-256-GCM');

  const [losts] = await pool.execute(
    "SELECT id, user_id, title, category, location_id, lost_at, description, status FROM lost_items WHERE status IN ('searching','matched')"
  );
  for (const l of losts) {
    const r = await matchLostItem(l);
    console.log(`  ✔ จับคู่ "${l.title}" -> ${r.length ? r.map((m) => `${m.title} ${m.score}%`).join(', ') : 'ยังไม่พบ'}`);
  }

  console.log('\n✅ เสร็จสิ้น! บัญชีทดสอบ:');
  console.log(`   Admin : admin.unifind@dpu.ac.th / ${ADMIN_PASSWORD}`);
  console.log(`   User  : somchai.jaidee@dpu.ac.th (และบัญชีอื่น) / ${USER_PASSWORD}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ seed ล้มเหลว:', err.message);
  await pool.end();
  process.exit(1);
});
