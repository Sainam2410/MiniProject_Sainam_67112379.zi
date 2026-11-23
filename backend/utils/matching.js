'use strict';
/**
 * Smart Matching Engine (ฟังก์ชันบริสุทธิ์ ไม่ยุ่งกับฐานข้อมูล -> ทดสอบได้ง่าย)
 *
 * คะแนนรวม 100 คะแนน
 *   1. หมวดหมู่ตรงกัน          35 คะแนน
 *   2. คำสำคัญในชื่อ/คำอธิบาย    30 คะแนน  (ตัดคำภาษาไทยด้วย Intl.Segmenter + พจนานุกรมคำพ้อง)
 *   3. สถานที่ใน DPU            20 คะแนน  (ที่เดียวกัน / อาคารติดกัน / โซนเดียวกัน)
 *   4. ช่วงเวลาที่สัมพันธ์กัน     15 คะแนน  (ของต้องถูกพบหลังจากหาย)
 */

const WEIGHTS = { category: 35, keywords: 30, location: 20, time: 15 };

// คำพ้องความหมาย -> คำมาตรฐาน (เรียงคำยาวก่อนเพื่อแทนที่ได้ถูกต้อง)
const SYNONYMS = [
  ['กระเป๋าสตางค์', ' wallet '], ['กระเป๋าเงิน', ' wallet '], ['กระเป๋าตังค์', ' wallet '], ['กระเป๋าตัง', ' wallet '],
  ['wallet', ' wallet '], ['purse', ' wallet '],
  ['หูฟังไร้สาย', ' earphone '], ['หูฟังบลูทูธ', ' earphone '], ['หูฟัง', ' earphone '], ['แอร์พอด', ' earphone '],
  ['airpods', ' earphone '], ['airpod', ' earphone '], ['earbuds', ' earphone '], ['headphone', ' earphone '],
  ['โทรศัพท์มือถือ', ' phone '], ['มือถือ', ' phone '], ['โทรศัพท์', ' phone '], ['ไอโฟน', ' phone iphone '],
  ['iphone', ' phone iphone '], ['smartphone', ' phone '],
  ['โน้ตบุ๊ก', ' laptop '], ['โน๊ตบุ๊ค', ' laptop '], ['notebook', ' laptop '], ['แล็ปท็อป', ' laptop '], ['macbook', ' laptop '],
  ['เครื่องคิดเลข', ' calculator '], ['แท็บเล็ต', ' tablet '], ['ไอแพด', ' tablet '], ['ipad', ' tablet '],
  ['สายชาร์จ', ' charger '], ['ที่ชาร์จ', ' charger '], ['พาวเวอร์แบงค์', ' powerbank '], ['แบตสำรอง', ' powerbank '],
  ['บัตรนักศึกษา', ' studentcard '], ['บัตรนศ', ' studentcard '], ['บัตรประชาชน', ' idcard '],
  ['กุญแจรถมอเตอร์ไซค์', ' key motorbike '], ['กุญแจรถจักรยานยนต์', ' key motorbike '], ['พวงกุญแจ', ' key '],
  ['ลูกกุญแจ', ' key '], ['กุญแจ', ' key '], ['มอเตอร์ไซค์', ' motorbike '], ['จักรยานยนต์', ' motorbike '],
  ['ฮอนด้า', ' honda '], ['ยามาฮ่า', ' yamaha '],
  ['ร่มพับ', ' umbrella '], ['ร่ม', ' umbrella '], ['ขวดน้ำ', ' bottle '], ['กระบอกน้ำ', ' bottle '], ['แว่นตา', ' glasses '],
  ['สีน้ำตาล', ' brown '], ['น้ำตาล', ' brown '], ['สีดำ', ' black '], ['สีขาว', ' white '], ['สีม่วง', ' purple '],
  ['สีแดง', ' red '], ['สีฟ้า', ' blue '], ['สีน้ำเงิน', ' blue '], ['สีชมพู', ' pink '], ['สีเขียว', ' green '],
  ['สีเทา', ' gray '], ['หนังสือ', ' book '], ['หนัง', ' leather '],
];

const STOPWORDS = new Set([
  'ที่', 'และ', 'ของ', 'ใน', 'ไว้', 'ได้', 'มี', 'เป็น', 'จะ', 'การ', 'ให้', 'กับ', 'แล้ว', 'อยู่', 'ไป', 'มา',
  'บน', 'ใต้', 'ตอน', 'ช่วง', 'ระหว่าง', 'น่าจะ', 'แบบ', 'อัน', 'ชิ้น', 'ใบ', 'เครื่อง', 'ทำ', 'หาย', 'พบ', 'เก็บ',
  'ลืม', 'หล่น', 'ตก', 'สี', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'and', 'my', 'is',
]);

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('th', { granularity: 'word' })
    : null;

function normalizeForTokens(text) {
  let s = ` ${String(text || '').toLowerCase().normalize('NFC')} `;
  for (const [from, to] of SYNONYMS) s = s.split(from).join(to);
  return s;
}

/** ตัดคำ (ไทย + อังกฤษ) -> Set ของ token */
function tokenize(text) {
  const s = normalizeForTokens(text);
  const tokens = new Set();
  const push = (w) => {
    const t = w.trim().replace(/[^\p{L}\p{N}]/gu, '');
    if (t.length >= 2 && !STOPWORDS.has(t)) tokens.add(t);
  };
  if (segmenter) {
    for (const seg of segmenter.segment(s)) if (seg.isWordLike) push(seg.segment);
  } else {
    s.split(/[\s,.;:!?()/\\-]+/).forEach(push);
  }
  return tokens;
}

/** Overlap coefficient = |A∩B| / min(|A|,|B|) */
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.min(a.size, b.size);
}

function keywordScore(lost, found) {
  const tl = tokenize(lost.title);
  const tf = tokenize(found.title);
  const al = tokenize(`${lost.title} ${lost.description || ''}`);
  const af = tokenize(`${found.title} ${found.public_description || ''}`);
  const titleSim = overlap(tl, tf);
  const fullSim = overlap(al, af);
  return Math.min(1, 0.65 * titleSim + 0.35 * fullSim);
}

/**
 * @param {number} lostLoc
 * @param {number} foundLoc
 * @param {{ neighbors: Map<number, Set<number>>, zones: Map<number,string> }} geo
 */
function locationScore(lostLoc, foundLoc, geo) {
  if (Number(lostLoc) === Number(foundLoc)) return 1;
  const nb = geo.neighbors.get(Number(lostLoc));
  if (nb && nb.has(Number(foundLoc))) return 0.6;
  if (geo.zones.get(Number(lostLoc)) && geo.zones.get(Number(lostLoc)) === geo.zones.get(Number(foundLoc))) return 0.4;
  return 0.1;
}

function toMs(dt) {
  if (dt instanceof Date) return dt.getTime();
  // MySQL DATETIME string (เวลาไทย)
  return new Date(`${String(dt).replace(' ', 'T')}+07:00`).getTime();
}

/** ของควรถูกพบหลังจากเวลาที่หาย (ยอมให้คลาดเคลื่อนได้ 6 ชม. เพราะผู้ใช้อาจจำเวลาไม่แม่น) */
function timeScore(lostAt, foundAt) {
  const diffH = (toMs(foundAt) - toMs(lostAt)) / 3600000;
  if (Number.isNaN(diffH)) return 0;
  if (diffH < -6) return 0;
  const h = Math.max(0, diffH);
  if (h <= 6) return 1;
  if (h <= 24) return 0.85;
  if (h <= 72) return 0.6;
  if (h <= 168) return 0.35;
  if (h <= 720) return 0.15;
  return 0.05;
}

/**
 * คำนวณคะแนนความคล้ายคลึง
 * @returns {{ score:number, breakdown:{category:number,keywords:number,location:number,time:number} }}
 */
function scoreMatch(lost, found, geo) {
  const cat = lost.category === found.category ? 1 : 0;
  const kw = keywordScore(lost, found);
  const loc = locationScore(lost.location_id, found.location_id, geo);
  const tm = timeScore(lost.lost_at, found.found_at);

  const breakdown = {
    category: Math.round(cat * WEIGHTS.category),
    keywords: Math.round(kw * WEIGHTS.keywords),
    location: Math.round(loc * WEIGHTS.location),
    time: Math.round(tm * WEIGHTS.time),
  };
  let score = breakdown.category + breakdown.keywords + breakdown.location + breakdown.time;
  // หากหมวดหมู่ไม่ตรงกัน ลดน้ำหนักลง เพื่อไม่ให้ของต่างประเภทโผล่ขึ้นมาเพียงเพราะที่/เวลาตรงกัน
  if (!cat) score = Math.round(score * 0.6);
  // ของพบก่อนหายแบบเป็นไปไม่ได้ -> ไม่จับคู่
  if (tm === 0) score = Math.min(score, 20);
  return { score: Math.max(0, Math.min(100, score)), breakdown };
}

/** สร้างโครงสร้าง geo จากแถวในตาราง locations / location_neighbors */
function buildGeo(locationRows, neighborRows) {
  const zones = new Map(locationRows.map((r) => [Number(r.id), r.zone]));
  const neighbors = new Map();
  for (const r of neighborRows) {
    const k = Number(r.location_id);
    if (!neighbors.has(k)) neighbors.set(k, new Set());
    neighbors.get(k).add(Number(r.neighbor_id));
  }
  return { zones, neighbors };
}

module.exports = { scoreMatch, tokenize, buildGeo, keywordScore, timeScore, locationScore, WEIGHTS };
