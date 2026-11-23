# 💜 UniFind DPU

**ระบบศูนย์กลางแจ้งของหายและจับคู่สิ่งของอัจฉริยะ มหาวิทยาลัยธุรกิจบัณฑิตย์ (Dhurakij Pundit University)**
โครงงานรายวิชา **CE306 โปรแกรมประยุกต์บนเว็บ**

UniFind DPU ช่วยให้นักศึกษาและบุคลากรแจ้ง "ของหาย" และ "ของที่เก็บได้" ภายในมหาวิทยาลัย
ระบบจะ **จับคู่อัตโนมัติ** ด้วยคะแนนความคล้ายคลึง (Match Score %) และปกป้องทรัพย์สินด้วย
**Blind Verification**: รูปภาพถูกเบลอ ข้อมูลผู้เก็บได้ถูกปกปิด จนกว่าผู้ขอรับคืนจะตอบ "คำถามลับ" ที่ผู้เก็บได้ตั้งไว้ได้ถูกต้อง

---

## 📑 สารบัญ

1. [ฟีเจอร์หลัก](#-ฟีเจอร์หลัก)
2. [สถาปัตยกรรมระบบ](#-สถาปัตยกรรมระบบ)
3. [โครงสร้างโฟลเดอร์](#-โครงสร้างโฟลเดอร์)
4. [ฐานข้อมูล](#-ฐานข้อมูล)
5. [การติดตั้งและรันระบบ](#-การติดตั้งและรันระบบ)
6. [บัญชีทดสอบ](#-บัญชีทดสอบ)
7. [สถานการณ์ทดสอบ: กระเป๋าเงินหายที่สำนักหอสมุด](#-สถานการณ์ทดสอบ-กระเป๋าเงินหายที่สำนักหอสมุด)
8. [อัลกอริทึมจับคู่ (Smart Matching)](#-อัลกอริทึมจับคู่-smart-matching)
9. [ระบบความปลอดภัย](#-ระบบความปลอดภัย)
10. [REST API](#-rest-api)
11. [การแก้ปัญหาที่พบบ่อย](#-การแก้ปัญหาที่พบบ่อย)

---

## ✨ ฟีเจอร์หลัก

| บทบาท | ทำอะไรได้บ้าง |
|---|---|
| 😢 **ผู้ทำของหาย** | แจ้งของหาย → เห็นรายการที่อาจตรงกันพร้อม % ความแม่นยำทันที → ตอบคำถามลับเพื่อปลดล็อก → แชตนัดรับคืน |
| 🤲 **ผู้พบสิ่งของ** | แจ้งพบพร้อมรูป (ลบ EXIF/GPS อัตโนมัติ) → ได้ชุดคำถามแบบตัวเลือกตามหมวดอัตโนมัติ แค่แตะว่าตัวไหนถูก (แก้/เพิ่มตัวเลือกเองได้) → ตรวจ/อนุมัติคำขอ → ยืนยันการส่งคืน |
| 🛡️ **ผู้ดูแลระบบ** | Dashboard สถิติจากฐานข้อมูลจริง (กราฟตามหมวดหมู่ สถานที่ 7 วันล่าสุด) → ปลดล็อกคำขอที่ถูกล็อก → ตรวจคำตอบ → จัดการผู้ใช้/สิ่งของ → ดู Audit Logs |

- 🔎 **ค้นหาและกรอง**: คำสำคัญ, หมวดหมู่, สถานที่ใน DPU, ช่วงวันที่, สถานะ (รอรับคืน / รอตรวจสอบคำขอ / รับคืนแล้ว)
- 🔔 **แจ้งเตือนในระบบ**: เมื่อจับคู่ได้, มีคำขอรอตรวจ, ยืนยันสำเร็จ, มีข้อความใหม่, คำขอถูกล็อก (แจ้ง Admin)
- 📍 **สถานที่จริงใน DPU** 8 จุด: อาคาร 7, อาคาร 1-6, อาคาร 10 (CIBA), สำนักหอสมุด, ศูนย์อาหาร, สำนักอธิการบดี/One Stop Service, ยิมเนเซียม/สนามกีฬา, อาคาร 12/ลานจอดรถ
- 🃏 **ปัดหาของ (Swipe Matching)** หน้า `match.html` แสดงของที่ระบบจับคู่ได้เป็นการ์ดทีละใบ ปัดขวา = ใช่ของฉัน (ไปตอบคำถามลับ), ปัดซ้าย = ไม่ใช่, มีปุ่มย้อนกลับ และใช้ปุ่มลูกศรบนคีย์บอร์ดได้ การ์ดแสดงเหตุผลการจับคู่ 4 ด้าน (หมวด/คำค้น/สถานที่/เวลา)
- 📱 **Responsive แบบแอป** มือถือมีแถบเมนูด้านล่าง ปุ่ม "ปัดหา" อยู่ตรงกลาง ฟอนต์ Prompt + Sarabun ไอคอน SVG

---

## 🏗️ สถาปัตยกรรมระบบ

```
┌──────────────────────────── Browser (มือถือ / คอมพิวเตอร์) ─────────────────────────────┐
│  HTML5 + CSS3 (Custom, ธีมม่วง DPU) + Vanilla JS (ES6+)                                 │
│  api.js (fetch + credentials) · nav.js · หน้าต่าง ๆ · chat.js (polling 5 วินาที)         │
│  🍪 JWT อยู่ใน Cookie HttpOnly/Secure/SameSite=Strict → JavaScript อ่าน token ไม่ได้     │
└───────────────────────────────┬─────────────────────────────────────────────────────────┘
                                │ HTTPS (same-origin, ไม่ต้องเปิด CORS)
┌───────────────────────────────▼─────────────────────────────────────────────────────────┐
│ Node.js + Express (server.js)                                                           │
│  helmet (CSP/HSTS/…) → express-rate-limit → noStore → originCheck (CSRF) → routes       │
│  ├─ middleware/auth.js       JWT verify + โหลดผู้ใช้จาก DB + RBAC (user / admin)         │
│  ├─ middleware/upload.js     multer (memory, 5MB, jpg/png/webp)                          │
│  ├─ controllers/*            auth · found · lost · claim · message · admin · meta        │
│  └─ utils/*                                                                             │
│      crypto.js      AES-256-GCM (+AAD ต่อฟิลด์)      masking.js   Data Masking           │
│      matching.js    Smart Matching Engine           answerCheck.js  ตรวจคีย์เวิร์ดคำตอบ    │
│      image.js       ตรวจ magic bytes + ลบ EXIF + สร้างภาพเบลอ/ลายน้ำ                     │
│      sanitize.js    Input validation/sanitization   audit.js     Audit log + แจ้งเตือน   │
│  📁 uploads/public  ภาพเบลอ (static)   📁 uploads/private ภาพคมชัด (ผ่าน API ที่ตรวจสิทธิ์) │
└───────────────────────────────┬─────────────────────────────────────────────────────────┘
                                │ mysql2 Prepared Statements (pool.execute)
┌───────────────────────────────▼─────────────────────────────────────────────────────────┐
│ MySQL 8 : users · lost_items · found_items · challenge_questions · matches              │
│           verification_claims · messages · notifications · audit_logs · locations       │
│   คอลัมน์ *_enc = ciphertext AES-256-GCM (เบอร์โทร, Line ID, ข้อมูลลับ, คำตอบ)              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**ลำดับการทำงานของ Blind Verification**

```
ผู้เก็บได้ ──แจ้งพบ + คำถามลับ──► [found_items + challenge_questions (คีย์เวิร์ดเข้ารหัส)]
                                         │  Matching Engine
ผู้ทำหาย ──แจ้งหาย──► [lost_items] ──────┴──► matches (score %) ──► 🔔 "พบรายการที่อาจตรงกัน! 97%"
     │
     └─► เปิดรายการ (🔒 Locked: ภาพเบลอ, ชื่อ/เบอร์ถูก mask, ซ่อนจุดนัดรับ)
           └─► ตอบคำถามลับ ──► ตรวจคีย์เวิร์ด (SELECT … FOR UPDATE)
                 ├─ ถูกครบ + auto-approve ──► ✅ approved → 🔓 ภาพคมชัด + ข้อมูลติดต่อ + แชต
                 ├─ ถูก ≥ 50% / ปิด auto ───► ⏳ pending_review → ผู้เก็บได้/Admin อนุมัติหรือปฏิเสธ
                 └─ ถูก < 50% ─────────────► ❌ attempts+1 → ครบ 3 ครั้ง = 🔒 locked + แจ้ง Admin
```

---

## 📂 โครงสร้างโฟลเดอร์

```
UniFind-DPU/
├── frontend/
│   ├── index.html            หน้าแรก + ค้นหา/กรองของที่พบ + สถิติ
│   ├── login.html            เข้าสู่ระบบ
│   ├── register.html         สมัครสมาชิก (@dpu.ac.th + รหัสนักศึกษา)
│   ├── dashboard.html        แดชบอร์ดผู้ใช้ (ของหาย / ของที่พบ / ตรวจคำขอ / คำขอของฉัน)
│   ├── report-lost.html      แจ้งของหาย + ผลจับคู่ทันที
│   ├── report-found.html     แจ้งพบ + อัปโหลดรูป + ตั้งคำถามลับ
│   ├── match.html            ปัดหาของ: การ์ดแบบปัดซ้าย/ขวา (Swipe Matching)
│   ├── match-verify.html     รายละเอียด (Locked/Unlocked) + Verification Quiz + ฉาก "แมตช์แล้ว!" + แชต
│   ├── admin.html            Admin Dashboard
│   ├── css/styles.css        ธีม "campus sticker" ม่วง DPU + เหลือง + มิ้นต์
│   ├── js/                   api.js, nav.js, chat.js และสคริปต์ของแต่ละหน้า
│   └── assets/               logo.svg, icons.svg (ไอคอน SVG sprite)
├── backend/
│   ├── server.js             จุดเริ่มต้น Express (API + เสิร์ฟ frontend)
│   ├── config/               index.js (env + ตรวจ secret), db.js (pool), constants.js
│   ├── controllers/          auth, found, lost, claim, message, admin, meta, notification
│   ├── middleware/           auth (JWT+RBAC), rateLimiters, upload, security (CSRF), errorHandler
│   ├── routes/index.js       RESTful routes ทั้งหมด
│   ├── utils/                crypto, masking, matching, matchService, answerCheck, image, sanitize, audit, httpError
│   ├── scripts/              seed.js (ตั้งรหัสผ่าน+เข้ารหัสข้อมูลทดสอบ), generate-keys.js
│   ├── tests/unit.test.js    Unit tests (ไม่ต้องใช้ฐานข้อมูล)
│   └── package.json
├── database.sql              สร้างฐานข้อมูล + ข้อมูลจำลองของ DPU
├── .env.example
└── README.md
```

---

## 🗄️ ฐานข้อมูล

| ตาราง | หน้าที่ | ข้อมูลที่เข้ารหัส AES-256-GCM |
|---|---|---|
| `users` | นักศึกษา/บุคลากร/Admin, bcrypt hash, token_version, ตัวนับล็อกอินผิด | `phone_enc`, `line_id_enc` |
| `lost_items` | รายการแจ้งของหาย | `private_note_enc` |
| `found_items` | รายการแจ้งพบ, ไฟล์ภาพเบลอ/คมชัด, auto_approve | `secret_detail_enc` |
| `challenge_questions` | คำถามยืนยันตัวตน 2-3 ข้อต่อรายการ ชนิด `single`/`multi` พร้อมตัวเลือก (`options_json`) | `answer_keywords_enc` (คำตอบที่ถูก) |
| `matches` | ผลจับคู่ + คะแนนแยกองค์ประกอบ (JSON) | - |
| `verification_claims` | คำขอยืนยันความเป็นเจ้าของ, attempts, สถานะล็อก | `answers_enc` |
| `messages` | แชตนัดรับคืน (เปิดเมื่อยืนยันสำเร็จ) | - |
| `notifications` | การแจ้งเตือนในระบบ | - |
| `audit_logs` | บันทึกเหตุการณ์ด้านความปลอดภัย (ไม่เก็บรหัสผ่าน/คำตอบ) | - |
| `locations`, `location_neighbors` | สถานที่ใน DPU และความใกล้เคียง | - |

> ข้อมูลจำลองมี: เคสกระเป๋าเงินหายที่หอสมุด, หูฟัง AirPods ที่ศูนย์อาหาร (ต้องให้ผู้เก็บได้อนุมัติเอง),
> กุญแจรถที่รับคืนแล้ว (มีประวัติแชต), บัตรนักศึกษาที่ถูกล็อกเพราะตอบผิด 3 ครั้ง ฯลฯ
>
> ความสัมพันธ์ "อาคารใกล้กัน" ใน `location_neighbors` เป็นค่าประมาณเพื่อการสาธิต ปรับให้ตรงผังจริงได้

---

## 🚀 การติดตั้งและรันระบบ

### 1. สิ่งที่ต้องมี
- **Node.js 20 LTS** ขึ้นไป (รองรับ ≥ 18.17) — ตรวจด้วย `node -v`
- **MySQL 8.0** ขึ้นไป (หรือ MariaDB 10.6+) — ติดตั้งผ่าน MySQL Installer, XAMPP, Docker หรือ Homebrew
- เบราว์เซอร์ Chrome / Edge / Firefox

### 2. สร้างฐานข้อมูลและผู้ใช้ MySQL (แนะนำแบบ Least Privilege)
```bash
mysql -u root -p < database.sql
```
จากนั้นสร้างบัญชีสำหรับแอป (ไม่ใช้ root ในการรันจริง):
```sql
CREATE USER 'unifind_app'@'localhost' IDENTIFIED BY 'ตั้งรหัสผ่านที่แข็งแรง';
GRANT SELECT, INSERT, UPDATE, DELETE ON unifind_dpu.* TO 'unifind_app'@'localhost';
FLUSH PRIVILEGES;
```
> ใช้ Docker ก็ได้: `docker run -d --name unifind-mysql -e MYSQL_ROOT_PASSWORD=root -p 3306:3306 mysql:8`
> แล้ว `docker exec -i unifind-mysql mysql -uroot -proot < database.sql`

### 3. ติดตั้งแพ็กเกจ Backend
```bash
cd backend
npm install
```

### 4. ตั้งค่าไฟล์ `.env`
```bash
cp ../.env.example ../.env      # Windows: copy ..\.env.example ..\.env
npm run keys                    # สร้าง ENCRYPTION_KEY และ JWT_SECRET แบบสุ่ม
```
คัดลอกค่าที่ได้ไปใส่ใน `.env` และแก้ `DB_USER` / `DB_PASSWORD` ให้ตรงกับขั้นตอนที่ 2
(ระบบจะไม่ยอมเริ่มทำงานถ้า ENCRYPTION_KEY ไม่ใช่ hex 64 ตัว หรือ JWT_SECRET สั้นกว่า 32 ตัว)

> ⚠️ ถ้าเปลี่ยน `ENCRYPTION_KEY` ภายหลัง ข้อมูลที่เข้ารหัสไว้เดิมจะถอดรหัสไม่ได้ — ให้รัน `npm run seed` ใหม่สำหรับข้อมูลทดสอบ

### 5. เติมข้อมูลทดสอบที่ต้องเข้ารหัส
```bash
npm run seed
```
สคริปต์นี้ตั้งรหัสผ่านบัญชีทดสอบด้วย bcrypt (12 rounds) และเข้ารหัสเบอร์โทร / Line ID / ข้อมูลลับ / คีย์เวิร์ดคำตอบ
ด้วย **คีย์ของเครื่องคุณเอง** — ไฟล์ SQL จึงไม่มี hash หรือ secret ใด ๆ ฝังไว้ (ใช้ `npm run seed -- --force` เพื่อรีเซ็ตรหัสผ่านบัญชีทดสอบ)

### 6. รันระบบ
```bash
npm start          # หรือ npm run dev (รีสตาร์ทอัตโนมัติเมื่อแก้โค้ด)
```
เปิด **http://localhost:3000** 🎉 (Backend เสิร์ฟหน้าเว็บให้ด้วย ไม่ต้องรัน frontend แยก)

### 7. รัน Unit Tests (ไม่ต้องใช้ MySQL)
```bash
npm test
```
ทดสอบ AES-256-GCM (รวมกรณีข้อมูลถูกแก้ไข), Data Masking, Matching Engine, การตรวจคำตอบ, Sanitization

---

## 👤 บัญชีทดสอบ

| บทบาท | อีเมล | รหัสผ่าน | ใช้ทดสอบ |
|---|---|---|---|
| 🛡️ Admin | `admin.unifind@dpu.ac.th` | `Admin@DPU2026!` | Admin Dashboard, ปลดล็อกคำขอ |
| 😢 ผู้ทำกระเป๋าเงินหาย | `somchai.jaidee@dpu.ac.th` | `Dpu@2026!` | จับคู่ + ยืนยันตัวตน |
| 🤲 ผู้เก็บกระเป๋าเงินได้ | `suda.rakrian@dpu.ac.th` | `Dpu@2026!` | ดูข้อมูลลับ, แชต, ยืนยันการส่งคืน |
| 🤲 ผู้เก็บ AirPods ได้ | `nattapong.srisuk@dpu.ac.th` | `Dpu@2026!` | อนุมัติคำขอด้วยตัวเอง (manual review) |
| 😢 ผู้ทำ AirPods หาย | `pimchanok.kaewsai@dpu.ac.th` | `Dpu@2026!` | คำขอที่รอผู้เก็บได้ตรวจ |

(เปลี่ยนรหัสผ่านเริ่มต้นได้ที่ `SEED_USER_PASSWORD` / `SEED_ADMIN_PASSWORD` ใน `.env` ก่อนรัน seed)

---

## 🧪 สถานการณ์ทดสอบ: กระเป๋าเงินหายที่สำนักหอสมุด

**ข้อมูลตั้งต้น**: คุณสุดาเก็บ "กระเป๋าสตางค์หนังสีน้ำตาล" ได้ที่สำนักหอสมุดชั้น 3 (20 พ.ย. 14:30 น.)
และคุณสมชายแจ้ง "กระเป๋าเงินหนังสีน้ำตาล" หายที่สำนักหอสมุด (20 พ.ย. 13:00 น.)

คำถามลับเป็นแบบ **แตะเลือก** (ไม่ต้องพิมพ์) ข้อที่ "เลือกได้หลายข้อ" ต้องเลือกให้ **ครบและตรง** ทุกตัว ขาดหรือเกินถือว่าผิด

| คำถามลับที่คุณสุดาตั้ง | ชนิด | คำตอบที่ถูก |
|---|---|---|
| ในกระเป๋ามีบัตรอะไรบ้าง | เลือกได้หลายข้อ | `บัตรนักศึกษา` + `บัตร ATM/เดบิต` |
| ข้างในมีของอะไรอีกบ้าง | เลือกได้หลายข้อ | `ธนบัตร` + `สติกเกอร์` |
| ซับในกระเป๋าเป็นสีอะไร | เลือกข้อเดียว | `เขียว` |

**ขั้นตอน**
1. **จับคู่อัตโนมัติ** — ล็อกอินเป็น `somchai.jaidee@dpu.ac.th` → หน้า "ของฉัน" แสดงแถบเหลือง
   **ตรงกันสูงสุด 97%** (หมวดหมู่ 35 + คำสำคัญ 27 + สถานที่ 20 + เวลา 15) → กด **ไปปัด**
2. **ปัดการ์ด + สถานะ Locked** — การ์ดใบบนสุดคือกระเป๋าสตางค์ 97% ลองปัดซ้าย/กดย้อนกลับ แล้ว **ปัดขวา** →
   หน้ารายละเอียดเปิดฟอร์มคำถามลับให้ทันที ชื่อผู้เก็บแสดงเป็น `คุณสุดา รั***` เบอร์ `081-xxx-xx78` จุดนัดรับถูกซ่อน
3. **ทดสอบตอบผิด** — เลือกผิดสักข้อ (เช่น สีซับในเลือก `ดำ`) →
   ระบบแจ้ง "เหลือโอกาสอีก 2 ครั้ง" โดยไม่บอกว่าข้อไหนผิด
4. **ตอบถูก → Unlocked** — ตอบตามตารางด้านบน → ขึ้นฉาก **"แมตช์แล้ว!"** แล้วเห็นชื่อเต็ม เบอร์ `0812345678`
   Line `suda_rr` และจุดนัดรับ "เคาน์เตอร์ยืม-คืน สำนักหอสมุด ชั้น 1" พร้อมกล่องแชต → ลองส่งข้อความ
5. **ฝั่งผู้เก็บได้** — ออกจากระบบ ล็อกอินเป็น `suda.rakrian@dpu.ac.th` → เปิดรายการเดิม → เห็นข้อมูลลับ (ถอดรหัสแล้ว)
   คีย์เวิร์ดคำตอบ และชื่อผู้ยืนยันสำเร็จ → กด "เปิดแชต" ตอบกลับ → กด **"คืนของแล้ว"**
   สถานะเปลี่ยนเป็น **รับคืนแล้ว** (สีเขียวมิ้นต์) และรายการแจ้งหายของคุณสมชายเป็น "ได้รับคืนแล้ว"

**ทดสอบ Anti-Brute Force (ล็อก 3 ครั้ง)**
6. ก่อนทำขั้นที่ 5 ให้ล็อกอินเป็น `nattapong.srisuk@dpu.ac.th` → เปิดรายการกระเป๋าสตางค์ → ตอบผิด 3 ครั้ง
   → สิทธิ์ถูกล็อก 24 ชั่วโมง + Admin ได้รับแจ้งเตือน 🔔 (ถ้าคุณสมชายยืนยันไปแล้ว ระบบจะตอบว่ามีผู้ยืนยันแล้ว)
7. ล็อกอินเป็น Admin → แท็บ **คำขอ** → เห็นคำขอที่ถูกล็อก → กด "ปลดล็อก" ได้; แท็บ **บันทึกความปลอดภัย** กรอง `CLAIM_LOCKED`

**ทดสอบการตรวจโดยผู้เก็บได้ (Manual Review)**
8. ล็อกอินเป็น `pimchanok.kaewsai@dpu.ac.th` → เปิด "หูฟังไร้สาย AirPods สีขาว" (จับคู่ 94%) →
   เลือก `สติกเกอร์` (ข้อเดียวในข้อแรก) และยี่ห้อ `Apple` → สถานะ **รอคนเก็บได้ตรวจ** (รายการนี้ปิด auto-approve)
9. ล็อกอินเป็น `nattapong.srisuk@dpu.ac.th` → หน้า "ของฉัน" → แท็บ **ตรวจคำตอบ** → เทียบคำตอบกับคีย์เวิร์ด → กด **ใช่เจ้าของ ให้ผ่าน**

**ทดสอบความเป็นส่วนตัวของรูปภาพ**
10. แจ้งพบสิ่งของใหม่พร้อมรูปจากมือถือ → หน้าแรกแสดงภาพเบลอ + ลายน้ำ "UniFind DPU • LOCKED"
    แม้ปิด CSS blur ใน DevTools ก็ยังเห็นภาพเบลอ เพราะไฟล์ใน `/uploads/public` ถูกเบลอจากเซิร์ฟเวอร์;
    ภาพคมชัดเรียกได้เฉพาะ `/api/found/:id/image` และตอบ `403` ถ้ายังไม่ยืนยันตัวตน
    ตรวจ EXIF ได้ด้วย `exiftool backend/uploads/private/<ไฟล์>.webp` → ไม่มีพิกัด GPS / ข้อมูลกล้อง

---

## 🧠 อัลกอริทึมจับคู่ (Smart Matching)

ไฟล์ `backend/utils/matching.js` (ฟังก์ชันบริสุทธิ์ ทดสอบได้) — คะแนนเต็ม 100

| องค์ประกอบ | น้ำหนัก | วิธีคำนวณ |
|---|---|---|
| หมวดหมู่ | 35 | ตรงกัน = เต็ม; ถ้าไม่ตรง คะแนนรวมถูกคูณ 0.6 |
| คำสำคัญ | 30 | ตัดคำไทยด้วย `Intl.Segmenter('th')` + พจนานุกรมคำพ้อง (กระเป๋าเงิน = กระเป๋าสตางค์ = wallet, หูฟัง = AirPods, สีน้ำตาล = brown ฯลฯ) แล้วใช้ Overlap coefficient: 65% จากชื่อ + 35% จากชื่อและคำอธิบาย |
| สถานที่ใน DPU | 20 | ที่เดียวกัน 100% · อาคารติดกัน 60% · โซนเดียวกัน 40% · อื่น ๆ 10% |
| ช่วงเวลา | 15 | พบภายใน 6 ชม. หลังหาย 100% · 24 ชม. 85% · 3 วัน 60% · 7 วัน 35% · 30 วัน 15%; ถ้าพบ **ก่อน** เวลาหายเกิน 6 ชม. = 0 และคะแนนรวมไม่เกิน 20 |

รายการที่ได้ ≥ `MATCH_THRESHOLD` (ค่าเริ่มต้น 50%) จะถูกบันทึกในตาราง `matches` และแจ้งเตือนเจ้าของ
ระบบจับคู่ทั้งสองทิศทาง: ตอนแจ้งของหาย (เทียบกับของที่พบทั้งหมด) และตอนแจ้งพบ (เทียบกับของหายที่ยังค้นหาอยู่)

---

## 🔐 ระบบความปลอดภัย

| หัวข้อ | การป้องกัน | ไฟล์ |
|---|---|---|
| **รหัสผ่าน** | bcrypt salt rounds ≥ 12 (บังคับขั้นต่ำในโค้ด), นโยบายรหัสผ่านแข็งแรง, เปรียบเทียบกับ dummy hash เมื่อไม่พบอีเมล (กัน user enumeration ผ่าน timing) | `authController.js` |
| **Session** | JWT HS256 (กำหนด algorithm/issuer/audience) ใน Cookie `HttpOnly; Secure; SameSite=Strict`; ตรวจผู้ใช้จาก DB ทุก request; `token_version` เพิกถอน token เมื่อออกจากระบบ/ถูกระงับ/เปลี่ยนบทบาท | `middleware/auth.js` |
| **RBAC** | `requireUser` / `requireAdmin` แยกชัดเจน; role อ่านจากฐานข้อมูล ไม่เชื่อค่าใน token; ตรวจความเป็นเจ้าของรายการทุก endpoint | `middleware/auth.js`, controllers |
| **Encryption at Rest** | AES-256-GCM, IV สุ่ม 12 ไบต์ทุกครั้ง, Auth tag ตรวจการแก้ไขข้อมูล, **AAD ผูกกับชื่อฟิลด์** (ย้าย ciphertext ข้ามคอลัมน์ไม่ได้), prefix `v1` รองรับ key rotation | `utils/crypto.js` |
| **Data Masking** | `089-xxx-xx45`, `คุณสมชาย ใจ***`, Line ID `so******jd`; ถอดรหัสส่งฉบับเต็มเฉพาะคู่กรณีที่ยืนยันสำเร็จ; Admin เห็นเบอร์แบบ mask (least privilege); ผู้ขอรับคืนไม่เคยเห็นข้อมูลลับ/คีย์เวิร์ด | `utils/masking.js`, `foundController.js` |
| **คำถามแบบตัวเลือก** | คำตอบที่ถูกเข้ารหัส และตรวจที่เซิร์ฟเวอร์เท่านั้น (ตัวเลือกเห็นได้ แต่ไม่รู้ว่าตัวไหนถูก); ตัวเลือกสลับลำดับทุกครั้ง; ข้อแบบเลือกหลายข้อต้องตรงทั้งชุด; ระบบคำนวณ "จำนวนแบบที่เดาได้" ของทั้งชุด ถ้าน้อยกว่า 150 แบบจะไม่ให้โพสต์ (เดาถูกใน 3 ครั้ง ≤ 2%); คำตอบแบบตัวเลือกที่ผิดถือว่าผิดเลย ไม่ส่งไปให้คนเก็บได้ตรวจ | `utils/answerCheck.js`, `foundController.js` |
| **Anti-Brute Force** | ตอบผิดสูงสุด **3 ครั้งต่อรายการ** (เก็บใน DB) → ล็อก 24 ชม. ครั้งที่สองล็อกถาวรจนกว่า Admin ปลด + แจ้งเตือน Admin; ใช้ `SELECT … FOR UPDATE` กัน race condition; ไม่บอกว่าข้อไหนผิด; ล็อกอินผิด 5 ครั้ง → ล็อกบัญชี 15 นาที | `claimController.js`, `authController.js` |
| **Rate Limiting** | `express-rate-limit`: Login 10/15 นาที/IP, Verification 5/15 นาที/ผู้ใช้, สมัคร 5/ชม., สร้างรายการ 20/ชม., แชต 30/5 นาที, API รวม 600/15 นาที | `middleware/rateLimiters.js` |
| **SQL Injection** | `pool.execute()` (Prepared Statements) ทุก query, escape `%`/`_` ใน LIKE, ชื่อตาราง/คอลัมน์มาจาก whitelist เท่านั้น, ปิด `multipleStatements` | ทุก controller |
| **XSS** | Sanitize ฝั่ง server (ตัดแท็ก/อักขระควบคุม/จำกัดความยาว) + escape ทุกครั้งก่อนแสดงผลฝั่ง client (`UF.esc`, `textContent`) + CSP `script-src 'self'` ไม่มี inline script | `utils/sanitize.js`, `frontend/js/*` |
| **CSRF** | Cookie `SameSite=Strict` + ตรวจ `Origin`/`Referer` ทุก request ที่เปลี่ยนข้อมูล | `middleware/security.js` |
| **Security Headers** | `helmet`: CSP, HSTS (production), X-Content-Type-Options, frame-ancestors none, Referrer-Policy, Permissions-Policy; API ส่ง `Cache-Control: no-store` | `server.js` |
| **Image Privacy** | multer จำกัด 5MB + MIME/นามสกุล → ตรวจ **magic bytes** จริง → `sharp` re-encode เป็น WebP (**ลบ EXIF/GPS/ข้อมูลกล้อง/XMP/ICC**) → ภาพเบลอ + ลายน้ำสำหรับสาธารณะ / ภาพคมชัดเก็บแยกส่งผ่าน API ที่ตรวจสิทธิ์; ชื่อไฟล์สุ่ม 128 บิต กัน path traversal | `utils/image.js`, `middleware/upload.js` |
| **Open Redirect** | พารามิเตอร์ `next` และลิงก์แจ้งเตือนอนุญาตเฉพาะ path ภายในระบบ | `login.js`, `notificationController.js` |
| **Audit Trail** | บันทึก LOGIN_FAILED, ACCOUNT_LOCKED, CLAIM_FAILED/LOCKED/APPROVED, IMAGE_ACCESS_DENIED, การกระทำของ Admin (ไม่เก็บรหัสผ่าน/คำตอบ/ข้อมูลลับ) | `utils/audit.js` |
| **Error Handling** | ไม่ส่ง stack trace / SQL error ให้ผู้ใช้; ระบบไม่เริ่มทำงานถ้า secret อ่อนแอ (fail-fast) | `errorHandler.js`, `config/index.js` |

**ข้อแนะนำเมื่อขึ้นระบบจริง**: ใช้ HTTPS (Nginx + Let's Encrypt) และตั้ง `NODE_ENV=production`, `TRUST_PROXY=1`;
เก็บ `ENCRYPTION_KEY` ใน Secret Manager; สำรองฐานข้อมูลแบบเข้ารหัส; ใช้ MySQL user ที่มีสิทธิ์เฉพาะ `unifind_dpu`;
หากรันหลายเครื่อง ให้ใช้ store กลาง (เช่น Redis) กับ express-rate-limit

---

## 🔌 REST API

ทุก endpoint อยู่ใต้ `/api` ตอบกลับเป็น JSON (ข้อผิดพลาด: `{ "error": "ข้อความภาษาไทย" }`)

| Method | Path | สิทธิ์ | คำอธิบาย |
|---|---|---|---|
| GET | `/meta` · `/meta/stats` | สาธารณะ | หมวดหมู่ สถานที่ สถานะ · สถิติหน้าแรก |
| POST | `/auth/register` · `/auth/login` · `/auth/logout` | สาธารณะ | สมัคร · เข้าสู่ระบบ · ออกจากระบบ |
| GET | `/auth/me` | user | ข้อมูลของฉัน |
| GET | `/found?q=&category=&location=&status=&dateFrom=&dateTo=&page=` | สาธารณะ | ค้นหาของที่พบ (ข้อมูลปกปิด) |
| GET | `/found/mine` | user | ของที่ฉันแจ้งพบ |
| GET | `/found/:id` | user | รายละเอียด (locked/unlocked/finder/admin) |
| GET | `/found/:id/image` | ผู้ยืนยันแล้ว/ผู้เก็บได้/admin | ภาพคมชัด |
| POST | `/found` (multipart) | user | แจ้งพบ + รูป + คำถามลับ |
| DELETE | `/found/:id` | เจ้าของ/admin | ลบประกาศ |
| POST | `/lost` · GET `/lost/mine` · GET `/lost/:id` | user | แจ้งของหาย (ตอบผลจับคู่ทันที) · รายการของฉัน |
| GET | `/lost/:id/matches` · POST `/lost/:id/rematch` · PATCH `/lost/:id/cancel` | เจ้าของ | ดูผลจับคู่ · จับคู่ใหม่ · ยกเลิก |
| POST | `/claims/found/:id/answers` | user | ส่งคำตอบยืนยันความเป็นเจ้าของ |
| GET | `/claims/mine` · `/claims/review` | user | คำขอของฉัน · คำขอรอฉันตรวจ |
| POST | `/claims/:id/decision` · `/claims/:id/complete` | ผู้เก็บได้/admin | อนุมัติ/ปฏิเสธ · ยืนยันส่งคืน |
| GET/POST | `/claims/:id/messages` | คู่กรณี (admin อ่านได้) | แชตนัดรับคืน |
| GET | `/notifications` · POST `/notifications/read` | user | การแจ้งเตือน |
| GET | `/admin/stats` · `/admin/users` · `/admin/items` · `/admin/claims` · `/admin/audit-logs` | admin | ข้อมูลผู้ดูแลระบบ |
| PATCH | `/admin/users/:id` | admin | ระงับ/เปิดใช้, เปลี่ยนบทบาท, ปลดล็อกอิน |
| DELETE | `/admin/items/:type/:id` | admin | ลบรายการ |
| POST | `/admin/claims/:id/unlock` | admin | ปลดล็อกคำขอ |

---

## 🛠️ การแก้ปัญหาที่พบบ่อย

| อาการ | วิธีแก้ |
|---|---|
| `[CONFIG ERROR] ENCRYPTION_KEY …` | รัน `npm run keys` แล้วใส่ค่าใน `.env` ที่ root โปรเจกต์ |
| `เชื่อมต่อ MySQL ไม่สำเร็จ` | ตรวจว่า MySQL ทำงานอยู่ และ `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD` ถูกต้อง, นำเข้า `database.sql` แล้ว |
| ล็อกอินบัญชีทดสอบไม่ได้ | ยังไม่ได้รัน `npm run seed` (ดูคำเตือนตอน `npm start`) |
| ล็อกอินสำเร็จแต่เด้งกลับหน้า login | เบราว์เซอร์ไม่รับ Secure cookie บน http (เช่น Safari) → ใช้ Chrome/Edge/Firefox หรือตั้ง `COOKIE_SECURE=false` ชั่วคราวในเครื่องพัฒนา |
| `คำขอไม่ได้มาจากเว็บไซต์ของระบบ (CSRF protection)` | ตั้ง `APP_ORIGIN` ให้ตรงกับ URL ที่เปิด เช่น `http://localhost:3000` |
| `npm install` ติดตั้ง bcrypt/sharp ไม่ได้ | ใช้ Node LTS รุ่นล่าสุด; บน Windows อาจต้องติดตั้ง "Desktop development with C++" (Visual Studio Build Tools) |
| ข้อมูลลับขึ้น `-` หลังเปลี่ยนคีย์ | ข้อมูลเข้ารหัสด้วยคีย์เก่า → รัน `npm run seed` ใหม่ (ข้อมูลทดสอบ) |
| ตอบคำถามแล้วขึ้น "ส่งคำตอบถี่เกินไป" | Rate limit 5 ครั้ง/15 นาที/ผู้ใช้ → รอ หรือรีสตาร์ทเซิร์ฟเวอร์ระหว่างพัฒนา |

---

💜 พัฒนาเพื่อชาว DPU — "ของหายไม่ใช่เรื่องใหญ่ ถ้าเรามีกันและกัน"
