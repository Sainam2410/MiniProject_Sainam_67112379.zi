'use strict';

const CATEGORIES = {
  wallet: { label: 'กระเป๋าสตางค์', icon: '👛' },
  it: { label: 'อุปกรณ์ไอที', icon: '💻' },
  card_doc: { label: 'บัตรนักศึกษา/เอกสาร', icon: '🪪' },
  key: { label: 'กุญแจ', icon: '🔑' },
  personal: { label: 'ของใช้ส่วนตัว', icon: '🎒' },
};

const FOUND_STATUS = {
  available: 'รอรับคืน',
  pending_claim: 'รอตรวจสอบคำขอ',
  returned: 'รับคืนแล้ว',
};

const LOST_STATUS = {
  searching: 'กำลังค้นหา',
  matched: 'พบรายการที่อาจตรงกัน',
  resolved: 'ได้รับคืนแล้ว',
  cancelled: 'ยกเลิก',
};

const CLAIM_STATUS = {
  in_progress: 'กำลังยืนยันตัวตน',
  pending_review: 'รอผู้เก็บได้/Admin ตรวจสอบ',
  approved: 'ยืนยันตัวตนสำเร็จ',
  locked: 'ถูกล็อกชั่วคราว',
  completed: 'รับคืนเรียบร้อย',
};

module.exports = { CATEGORIES, FOUND_STATUS, LOST_STATUS, CLAIM_STATUS };
