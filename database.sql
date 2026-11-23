-- =====================================================================
--  UniFind DPU - ระบบศูนย์กลางแจ้งของหายและจับคู่สิ่งของอัจฉริยะ
--  มหาวิทยาลัยธุรกิจบัณฑิตย์ (Dhurakij Pundit University)
--  รายวิชา CE306 โปรแกรมประยุกต์บนเว็บ
--
--  ใช้งาน:  mysql -u root -p < database.sql
--  จากนั้นรัน  cd backend && npm run seed
--    (สคริปต์ seed จะตั้งรหัสผ่านบัญชีทดสอบด้วย bcrypt และเข้ารหัสข้อมูลอ่อนไหว
--     ด้วย AES-256-GCM โดยใช้ ENCRYPTION_KEY ของเครื่องคุณเอง
--     จึงไม่มี secret / hash ใด ๆ ฝังอยู่ในไฟล์ SQL นี้)
--
--  หมายเหตุ: สคริปต์นี้จะลบฐานข้อมูล unifind_dpu เดิมทิ้งแล้วสร้างใหม่ (สำหรับพัฒนา/ทดสอบ)
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+07:00';

DROP DATABASE IF EXISTS unifind_dpu;
CREATE DATABASE unifind_dpu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE unifind_dpu;

-- ---------------------------------------------------------------------
-- 1) สถานที่ภายใน DPU
-- ---------------------------------------------------------------------
CREATE TABLE locations (
  id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  code        VARCHAR(10)  NOT NULL UNIQUE,
  name_th     VARCHAR(150) NOT NULL,
  zone        ENUM('academic','service','sport') NOT NULL,
  icon        VARCHAR(8)   NOT NULL,
  sort_order  TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- ความสัมพันธ์ "อยู่ใกล้กัน" ใช้ในอัลกอริทึมจับคู่ (ปรับแก้ได้ตามผังจริง)
CREATE TABLE location_neighbors (
  location_id TINYINT UNSIGNED NOT NULL,
  neighbor_id TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (location_id, neighbor_id),
  CONSTRAINT fk_ln_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  CONSTRAINT fk_ln_nb  FOREIGN KEY (neighbor_id) REFERENCES locations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2) ผู้ใช้ (นักศึกษา / บุคลากร / ผู้ดูแลระบบ)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id          VARCHAR(12)  NOT NULL UNIQUE,
  email               VARCHAR(120) NOT NULL UNIQUE,
  password_hash       CHAR(60)     NULL COMMENT 'bcrypt hash (NULL = บัญชี seed ที่ยังไม่ได้รัน npm run seed จะล็อกอินไม่ได้)',
  first_name          VARCHAR(60)  NOT NULL,
  last_name           VARCHAR(60)  NOT NULL,
  phone_enc           VARCHAR(255) NULL COMMENT 'AES-256-GCM',
  line_id_enc         VARCHAR(255) NULL COMMENT 'AES-256-GCM',
  role                ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  token_version       INT UNSIGNED NOT NULL DEFAULT 0,
  failed_login_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME     NULL,
  last_login_at       DATETIME     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3) รายการแจ้งของหาย
-- ---------------------------------------------------------------------
CREATE TABLE lost_items (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  title             VARCHAR(120) NOT NULL,
  category          ENUM('wallet','it','card_doc','key','personal') NOT NULL,
  location_id       TINYINT UNSIGNED NOT NULL,
  lost_at           DATETIME     NOT NULL,
  description       VARCHAR(1000) NOT NULL DEFAULT '',
  private_note_enc  TEXT         NULL COMMENT 'จุดสังเกตส่วนตัวของเจ้าของ (AES-256-GCM)',
  status            ENUM('searching','matched','resolved','cancelled') NOT NULL DEFAULT 'searching',
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lost_status_cat (status, category),
  INDEX idx_lost_user (user_id),
  CONSTRAINT fk_lost_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_lost_loc  FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4) รายการแจ้งพบสิ่งของ
-- ---------------------------------------------------------------------
CREATE TABLE found_items (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  finder_id           INT UNSIGNED NOT NULL,
  title               VARCHAR(120) NOT NULL,
  category            ENUM('wallet','it','card_doc','key','personal') NOT NULL,
  location_id         TINYINT UNSIGNED NOT NULL,
  found_at            DATETIME     NOT NULL,
  public_description  VARCHAR(1000) NOT NULL DEFAULT '' COMMENT 'คำอธิบายแบบกว้าง ๆ ที่แสดงสาธารณะได้',
  secret_detail_enc   TEXT         NULL COMMENT 'ข้อมูลลับ/จุดสังเกตเฉพาะ (AES-256-GCM)',
  meeting_point       VARCHAR(200) NOT NULL DEFAULT '',
  image_public        VARCHAR(80)  NULL COMMENT 'ไฟล์ภาพเบลอ + ลายน้ำ (เปิดสาธารณะ)',
  image_private       VARCHAR(80)  NULL COMMENT 'ไฟล์ภาพคมชัด (ส่งผ่าน API ที่ตรวจสิทธิ์เท่านั้น)',
  auto_approve        TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 = ตอบถูกครบทุกข้อแล้วปลดล็อกอัตโนมัติ',
  status              ENUM('available','pending_claim','returned') NOT NULL DEFAULT 'available',
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_found_status_cat (status, category),
  INDEX idx_found_loc (location_id),
  INDEX idx_found_finder (finder_id),
  CONSTRAINT fk_found_user FOREIGN KEY (finder_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_found_loc  FOREIGN KEY (location_id) REFERENCES locations(id)
) ENGINE=InnoDB;

-- คำถามยืนยันความเป็นเจ้าของ (2-3 ข้อต่อรายการ)
CREATE TABLE challenge_questions (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  found_item_id       INT UNSIGNED NOT NULL,
  question            VARCHAR(255) NOT NULL,
  qtype               ENUM('single','multi','text') NOT NULL DEFAULT 'single' COMMENT 'single = เลือกข้อเดียว, multi = เลือกได้หลายข้อ, text = พิมพ์ตอบ (รองรับของเดิม)',
  options_json        JSON NULL COMMENT 'ตัวเลือกที่แสดงให้ผู้ขอรับคืนเห็น (ไม่ใช่ความลับ)',
  answer_keywords_enc TEXT NULL COMMENT 'JSON array ของคำตอบที่ถูก (ตัวเลือกที่ถูก หรือคีย์เวิร์ด) เข้ารหัส AES-256-GCM',
  min_match           TINYINT UNSIGNED NOT NULL DEFAULT 1,
  sort_order          TINYINT UNSIGNED NOT NULL DEFAULT 1,
  INDEX idx_q_found (found_item_id),
  CONSTRAINT fk_q_found FOREIGN KEY (found_item_id) REFERENCES found_items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5) ผลการจับคู่อัตโนมัติ
-- ---------------------------------------------------------------------
CREATE TABLE matches (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lost_item_id   INT UNSIGNED NOT NULL,
  found_item_id  INT UNSIGNED NOT NULL,
  score          TINYINT UNSIGNED NOT NULL,
  breakdown      JSON NULL,
  is_seen        TINYINT(1) NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_match (lost_item_id, found_item_id),
  INDEX idx_match_found (found_item_id),
  CONSTRAINT fk_m_lost  FOREIGN KEY (lost_item_id)  REFERENCES lost_items(id)  ON DELETE CASCADE,
  CONSTRAINT fk_m_found FOREIGN KEY (found_item_id) REFERENCES found_items(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 6) คำขอยืนยันความเป็นเจ้าของ (Blind Verification)
-- ---------------------------------------------------------------------
CREATE TABLE verification_claims (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  found_item_id  INT UNSIGNED NOT NULL,
  claimant_id    INT UNSIGNED NOT NULL,
  lost_item_id   INT UNSIGNED NULL,
  status         ENUM('in_progress','pending_review','approved','locked','completed') NOT NULL DEFAULT 'in_progress',
  attempts       TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'จำนวนครั้งที่ตอบผิด (สูงสุด 3)',
  lock_count     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until   DATETIME NULL COMMENT 'NULL + status=locked = ล็อกจนกว่า Admin จะปลด',
  auto_score     TINYINT UNSIGNED NULL COMMENT '% ข้อที่ตอบผ่านจากการตรวจคีย์เวิร์ด',
  answers_enc    TEXT NULL COMMENT 'คำตอบล่าสุด (AES-256-GCM) ให้ผู้เก็บได้/Admin ตรวจ',
  reviewed_by    INT UNSIGNED NULL,
  reviewed_at    DATETIME NULL,
  approved_at    DATETIME NULL,
  completed_at   DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_claim (found_item_id, claimant_id),
  INDEX idx_claim_status (status),
  CONSTRAINT fk_c_found    FOREIGN KEY (found_item_id) REFERENCES found_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_c_user     FOREIGN KEY (claimant_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_c_lost     FOREIGN KEY (lost_item_id)  REFERENCES lost_items(id) ON DELETE SET NULL,
  CONSTRAINT fk_c_reviewer FOREIGN KEY (reviewed_by)   REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ข้อความนัดรับคืน (เปิดใช้เมื่อคำขอได้รับการอนุมัติแล้วเท่านั้น)
CREATE TABLE messages (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  claim_id    INT UNSIGNED NOT NULL,
  sender_id   INT UNSIGNED NOT NULL,
  body        VARCHAR(1000) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_claim (claim_id, id),
  CONSTRAINT fk_msg_claim  FOREIGN KEY (claim_id)  REFERENCES verification_claims(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  type        VARCHAR(40)  NOT NULL,
  message     VARCHAR(255) NOT NULL,
  link        VARCHAR(255) NULL,
  is_read     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id, is_read),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 7) บันทึกการตรวจสอบ (Audit Logs) - ห้ามเก็บรหัสผ่าน/คำตอบ/ข้อมูลลับ
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NULL,
  action       VARCHAR(60)  NOT NULL,
  entity_type  VARCHAR(30)  NULL,
  entity_id    INT UNSIGNED NULL,
  ip_address   VARCHAR(45)  NULL,
  user_agent   VARCHAR(255) NULL,
  details      JSON NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_action (action),
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================
--  SEED DATA
-- =====================================================================

INSERT INTO locations (id, code, name_th, zone, icon, sort_order) VALUES
 (1, 'B7',   'อาคารเฉลิมพระเกียรติ (อาคาร 7)',                                  'academic', '🏛️', 1),
 (2, 'B1-6', 'อาคาร 1 - 6 (ตึกเรียนรวม)',                                        'academic', '🏫', 2),
 (3, 'B10',  'อาคาร 10 (วิทยาลัยบริหารธุรกิจนวัตกรรมและการบัญชี - CIBA)',          'academic', '💼', 3),
 (4, 'LIB',  'สำนักหอสมุด (DPU Library)',                                        'academic', '📚', 4),
 (5, 'FOOD', 'ศูนย์อาหาร DPU (Food Court)',                                      'service',  '🍜', 5),
 (6, 'OSS',  'อาคารสำนักอธิการบดี / ศูนย์บริการเบ็ดเสร็จ (One Stop Service)',       'service',  '🏢', 6),
 (7, 'GYM',  'อาคารยิมเนเซียม / สนามกีฬา DPU',                                    'sport',    '🏀', 7),
 (8, 'B12',  'อาคาร 12 / ลานจอดรถ',                                              'sport',    '🅿️', 8);

-- ความใกล้เคียง (สองทิศทาง) - เป็นค่าประมาณเพื่อการสาธิต ปรับให้ตรงผังจริงได้
INSERT INTO location_neighbors (location_id, neighbor_id) VALUES
 (1,2),(2,1), (1,4),(4,1), (2,4),(4,2), (2,5),(5,2), (3,2),(2,3),
 (3,6),(6,3), (4,5),(5,4), (5,6),(6,5), (7,8),(8,7), (6,8),(8,6), (5,7),(7,5);

-- ผู้ใช้ทดสอบ (password_hash / เบอร์ / Line จะถูกเติมโดย npm run seed)
INSERT INTO users (id, student_id, email, first_name, last_name, role) VALUES
 (1, 'STAFF001',  'admin.unifind@dpu.ac.th',   'ผู้ดูแล',   'ระบบยูนิไฟนด์', 'admin'),
 (2, '65130001',  'somchai.jaidee@dpu.ac.th',  'สมชาย',    'ใจดี',          'user'),
 (3, '65130002',  'suda.rakrian@dpu.ac.th',    'สุดา',     'รักเรียน',       'user'),
 (4, '66130003',  'nattapong.srisuk@dpu.ac.th','ณัฐพงศ์',   'ศรีสุข',         'user'),
 (5, '64130004',  'pimchanok.kaewsai@dpu.ac.th','พิมพ์ชนก', 'แก้วใส',         'user');

-- ของที่พบ (กรณีศึกษาหลัก: กระเป๋าสตางค์ที่สำนักหอสมุด)
INSERT INTO found_items (id, finder_id, title, category, location_id, found_at, public_description, meeting_point, auto_approve, status) VALUES
 (1, 3, 'กระเป๋าสตางค์หนังสีน้ำตาล', 'wallet',   4, '2026-11-20 14:30:00',
     'พบกระเป๋าสตางค์หนังสีน้ำตาลแบบพับสองตอน วางลืมไว้บนโต๊ะอ่านหนังสือ ชั้น 3 โซนเงียบ',
     'เคาน์เตอร์ยืม-คืน สำนักหอสมุด ชั้น 1', 1, 'available'),
 (2, 4, 'หูฟังไร้สาย AirPods สีขาว', 'it',       5, '2026-11-21 12:40:00',
     'พบหูฟังไร้สายพร้อมเคสสีขาว ตกอยู่ใต้โต๊ะโซนร้านก๋วยเตี๋ยว',
     'หน้าร้านกาแฟ ศูนย์อาหาร DPU', 0, 'available'),
 (3, 4, 'พวงกุญแจรถจักรยานยนต์ Honda', 'key',     8, '2026-11-18 08:10:00',
     'พวงกุญแจรถจักรยานยนต์ มีพวงกุญแจห้อยเพิ่ม 1 ชิ้น',
     'ป้อม รปภ. ลานจอดรถ อาคาร 12', 1, 'returned'),
 (4, 3, 'บัตรนักศึกษา DPU', 'card_doc', 1, '2026-11-22 10:05:00',
     'พบบัตรนักศึกษาตกอยู่บริเวณลิฟต์ชั้น 1 อาคาร 7',
     'ศูนย์บริการเบ็ดเสร็จ (One Stop Service)', 1, 'available'),
 (5, 2, 'ร่มพับสีม่วง', 'personal', 7, '2026-11-21 17:20:00',
     'ร่มพับสามตอนสีม่วง ลืมไว้ที่อัฒจันทร์สนามกีฬา',
     'ประตูหน้ายิมเนเซียม', 1, 'available');

-- คำถามยืนยันตัวตนแบบตัวเลือก (คำตอบที่ถูกถูกเข้ารหัสโดย npm run seed)
INSERT INTO challenge_questions (id, found_item_id, question, qtype, options_json, min_match, sort_order) VALUES
 (1, 1, 'ในกระเป๋ามีบัตรอะไรบ้าง (เลือกให้ครบทุกใบ)', 'multi', '["บัตรนักศึกษา", "บัตรประชาชน", "บัตร ATM/เดบิต", "บัตรเครดิต", "ใบขับขี่", "บัตรรถไฟฟ้า BTS/MRT", "บัตรสะสมแต้ม", "ไม่มีบัตร"]', 1, 1),
 (2, 1, 'ข้างในมีของอะไรอีกบ้าง (เลือกให้ครบ)', 'multi', '["ธนบัตร", "เหรียญ", "รูปถ่าย", "สติกเกอร์", "ใบเสร็จ", "นามบัตร", "กุญแจ", "ไม่มีอย่างอื่น"]', 1, 2),
 (3, 1, 'ซับในกระเป๋าเป็นสีอะไร', 'single', '["ดำ", "น้ำตาล", "ขาว/ครีม", "เทา", "แดง", "ชมพู", "ม่วง", "น้ำเงิน/ฟ้า", "เขียว", "ลวดลาย/ลายสก็อต"]', 1, 3),
 (4, 2, 'บนเคสหูฟังมีอะไรติดอยู่ (เลือกให้ครบ)', 'multi', '["สติกเกอร์", "ที่ห้อย/พวงกุญแจ", "เคสซิลิโคนสี", "ชื่อเขียนไว้", "รอยแตก/รอยถลอก", "ไม่มีอะไรเลย"]', 1, 1),
 (5, 2, 'หูฟังยี่ห้ออะไร', 'single', '["Apple", "Samsung", "Xiaomi", "Sony", "JBL", "Huawei", "OPPO/realme", "อื่น ๆ"]', 1, 2),
 (6, 3, 'บนพวงกุญแจมีอะไรห้อยอยู่ (เลือกให้ครบ)', 'multi', '["ตุ๊กตาหมี", "ห่วงโลหะเปล่า", "รีโมต/คีย์การ์ด", "ป้ายชื่อ", "ที่เปิดขวด", "ไม่มีอะไรห้อย"]', 1, 1),
 (7, 3, 'มีกุญแจทั้งหมดกี่ดอก', 'single', '["1", "2", "3", "4", "5", "6 ขึ้นไป"]', 1, 2),
 (8, 4, 'รหัสนักศึกษาบนบัตรขึ้นต้นด้วยเลขอะไร', 'single', '["63", "64", "65", "66", "67", "68", "69"]', 1, 1),
 (9, 4, 'บัตรมีอะไรติดมาด้วย (เลือกให้ครบ)', 'multi', '["สายคล้องคอ", "ซองใส่บัตร", "สติกเกอร์", "ลายเซ็นด้านหลัง", "ไม่มีอะไรเลย"]', 1, 2),
 (10, 5, 'ด้ามจับร่มเป็นแบบไหน', 'single', '["ไม้", "พลาสติกสีดำ", "พลาสติกสี", "ยาง", "เหล็ก", "ด้ามโค้งตัว J"]', 1, 1),
 (11, 5, 'ร่มมีจุดสังเกตอะไรบ้าง (เลือกให้ครบ)', 'multi', '["ปลอกลายจุด", "มีชื่อเขียนไว้", "ก้านหัก", "สติกเกอร์", "มีที่ห้อย", "ไม่มีจุดสังเกต"]', 1, 2);

-- ของหาย
INSERT INTO lost_items (id, user_id, title, category, location_id, lost_at, description, status) VALUES
 (1, 2, 'กระเป๋าเงินหนังสีน้ำตาล', 'wallet', 4, '2026-11-20 13:00:00',
     'ทำกระเป๋าเงินหายระหว่างอ่านหนังสือที่หอสมุดชั้น 3 ช่วงบ่าย น่าจะลืมไว้บนโต๊ะ', 'matched'),
 (2, 5, 'หูฟัง AirPods', 'it', 5, '2026-11-21 12:00:00',
     'ลืมหูฟังไว้ที่โต๊ะในศูนย์อาหารตอนพักเที่ยง เคสสีขาว', 'matched'),
 (3, 4, 'เครื่องคิดเลข Casio fx-991', 'it', 3, '2026-11-19 15:30:00',
     'เครื่องคิดเลขวิทยาศาสตร์สีดำ ลืมไว้ในห้องเรียนชั้น 5 อาคาร 10', 'searching'),
 (4, 5, 'กุญแจรถมอเตอร์ไซค์', 'key', 8, '2026-11-18 07:45:00',
     'กุญแจรถฮอนด้า หล่นแถวลานจอดรถอาคาร 12', 'resolved');

-- ผลจับคู่ตั้งต้น (npm run seed จะคำนวณคะแนนใหม่ด้วย Matching Engine จริง)
INSERT INTO matches (lost_item_id, found_item_id, score, breakdown) VALUES
 (1, 1, 97, JSON_OBJECT('category', 35, 'keywords', 27, 'location', 20, 'time', 15)),
 (2, 2, 94, JSON_OBJECT('category', 35, 'keywords', 24, 'location', 20, 'time', 15)),
 (4, 3, 90, JSON_OBJECT('category', 35, 'keywords', 20, 'location', 20, 'time', 15));

-- คำขอยืนยันตัวตน
INSERT INTO verification_claims (id, found_item_id, claimant_id, lost_item_id, status, attempts, lock_count, locked_until, auto_score, approved_at, completed_at) VALUES
 (1, 3, 5, 4, 'completed', 0, 0, NULL, 100, '2026-11-18 09:00:00', '2026-11-18 12:30:00'),
 (2, 4, 4, NULL, 'locked', 3, 1, '2026-11-24 10:30:00', 0, NULL, NULL);

INSERT INTO messages (claim_id, sender_id, body, created_at) VALUES
 (1, 5, 'สวัสดีค่ะ ขอบคุณมากที่เก็บกุญแจไว้ให้นะคะ สะดวกให้ไปรับตอนเที่ยงไหมคะ', '2026-11-18 09:05:00'),
 (1, 4, 'ได้ครับ ฝากไว้ที่ป้อม รปภ. ลานจอดรถอาคาร 12 แล้วนะครับ', '2026-11-18 09:12:00'),
 (1, 5, 'ได้รับแล้วค่ะ ขอบคุณมากค่ะ 🙏', '2026-11-18 12:31:00');

INSERT INTO notifications (user_id, type, message, link, is_read) VALUES
 (2, 'match', 'พบรายการที่อาจตรงกับ "กระเป๋าเงินหนังสีน้ำตาล" ของคุณ!', '/match-verify.html?id=1', 0),
 (5, 'match', 'พบรายการที่อาจตรงกับ "หูฟัง AirPods" ของคุณ!', '/match-verify.html?id=2', 0),
 (1, 'claim_locked', 'คำขอรับคืน "บัตรนักศึกษา DPU" ถูกล็อกเนื่องจากตอบผิดครบ 3 ครั้ง', '/admin.html#claims', 0);

INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, details, created_at) VALUES
 (3, 'FOUND_CREATED', 'found_item', 1, '127.0.0.1', JSON_OBJECT('category', 'wallet'), '2026-11-20 14:35:00'),
 (2, 'LOST_CREATED',  'lost_item',  1, '127.0.0.1', JSON_OBJECT('category', 'wallet'), '2026-11-20 16:00:00'),
 (4, 'CLAIM_FAILED',  'claim',      2, '127.0.0.1', JSON_OBJECT('attempt', 1), '2026-11-23 10:20:00'),
 (4, 'CLAIM_FAILED',  'claim',      2, '127.0.0.1', JSON_OBJECT('attempt', 2), '2026-11-23 10:25:00'),
 (4, 'CLAIM_LOCKED',  'claim',      2, '127.0.0.1', JSON_OBJECT('attempt', 3), '2026-11-23 10:30:00'),
 (5, 'CLAIM_COMPLETED','claim',     1, '127.0.0.1', NULL, '2026-11-18 12:30:00');

-- ปรับ AUTO_INCREMENT ให้ต่อจากข้อมูล seed
ALTER TABLE users AUTO_INCREMENT = 100;
ALTER TABLE found_items AUTO_INCREMENT = 100;
ALTER TABLE lost_items AUTO_INCREMENT = 100;
ALTER TABLE challenge_questions AUTO_INCREMENT = 100;
ALTER TABLE verification_claims AUTO_INCREMENT = 100;
