/* UniFind DPU - ตัวช่วยกลาง: เรียก API, escape HTML, ไอคอน, วันที่, การ์ดสิ่งของ */
(function () {
  'use strict';

  const UF = {};

  UF.CATEGORIES = {
    wallet: { label: 'กระเป๋าสตางค์', icon: 'wallet' },
    it: { label: 'ไอที/แก็ดเจ็ต', icon: 'laptop' },
    card_doc: { label: 'บัตร/เอกสาร', icon: 'idcard' },
    key: { label: 'กุญแจ', icon: 'key' },
    personal: { label: 'ของใช้ส่วนตัว', icon: 'bag' },
  };
  UF.FOUND_STATUS = { available: 'รอเจ้าของ', pending_claim: 'มีคนขอรับแล้ว', returned: 'คืนแล้ว' };
  UF.LOST_STATUS = { searching: 'กำลังตามหา', matched: 'มีของที่อาจใช่', resolved: 'ได้คืนแล้ว', cancelled: 'ยกเลิกแล้ว' };
  UF.CLAIM_STATUS = {
    none: 'ยังไม่ได้ยืนยัน',
    in_progress: 'กำลังยืนยัน',
    pending_review: 'รอคนเก็บได้ตรวจ',
    approved: 'ยืนยันผ่านแล้ว',
    locked: 'ถูกล็อกชั่วคราว',
    completed: 'รับของแล้ว',
  };

  /** Escape ข้อความทุกครั้งก่อนแทรกลง innerHTML (ป้องกัน XSS) */
  UF.esc = function (value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"'`=/]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;', '/': '&#47;',
    })[c]);
  };

  /** อนุญาตเฉพาะ URL ภายในระบบ */
  UF.safeUrl = function (u) {
    const s = String(u || '');
    return /^\/(?!\/)[A-Za-z0-9_\-./?=&#%]*$/.test(s) ? s : '#';
  };

  /** ไอคอนจาก sprite (ชื่อมาจากโค้ดเท่านั้น ไม่ใช่จากผู้ใช้) */
  UF.icon = function (name, cls) {
    const n = String(name).replace(/[^a-z-]/g, '');
    return `<svg class="i ${cls || ''}" aria-hidden="true"><use href="/assets/icons.svg#${n}"></use></svg>`;
  };
  UF.catIcon = (c, cls) => UF.icon((UF.CATEGORIES[c] || { icon: 'box' }).icon, cls);
  UF.catLabel = (c) => (UF.CATEGORIES[c] ? UF.CATEGORIES[c].label : c);

  async function request(method, url, body, isForm) {
    const opts = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined && !isForm) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (isForm) {
      opts.body = body;
    }
    let res;
    try {
      res = await fetch(`/api${url}`, opts);
    } catch (_e) {
      throw Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ เช็กเน็ตหรือดูว่าเปิดเซิร์ฟเวอร์อยู่ไหม'), { status: 0 });
    }
    let data = {};
    try { data = await res.json(); } catch (_e) { data = {}; }
    if (!res.ok) {
      const err = new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  UF.api = {
    get: (u) => request('GET', u),
    post: (u, b) => request('POST', u, b || {}),
    patch: (u, b) => request('PATCH', u, b || {}),
    del: (u) => request('DELETE', u),
    upload: (u, formData) => request('POST', u, formData, true),
  };

  UF.me = null;
  UF.loadMe = async function () {
    try {
      UF.me = (await UF.api.get('/auth/me')).user;
    } catch (_e) {
      UF.me = null;
    }
    return UF.me;
  };

  /** บังคับเข้าสู่ระบบ (และตรวจบทบาทถ้าระบุ) */
  UF.requireAuth = async function (role) {
    const me = UF.me || (await UF.ready);
    if (!me) {
      location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      return null;
    }
    if (role && me.role !== role) {
      UF.toast('หน้านี้สำหรับผู้ดูแลระบบเท่านั้น', 'error');
      location.href = '/dashboard.html';
      return null;
    }
    return me;
  };

  let metaPromise = null;
  UF.loadMeta = function () {
    if (!metaPromise) metaPromise = UF.api.get('/meta');
    return metaPromise;
  };

  UF.fillSelect = function (select, items, placeholder) {
    select.innerHTML = '';
    if (placeholder !== undefined) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = placeholder;
      select.appendChild(o);
    }
    items.forEach((it) => {
      const o = document.createElement('option');
      o.value = it.value;
      o.textContent = it.label;
      select.appendChild(o);
    });
  };

  UF.fillLocations = async function (select, placeholder) {
    const meta = await UF.loadMeta();
    UF.fillSelect(select, meta.locations.map((l) => ({ value: l.id, label: l.name })), placeholder);
  };

  UF.fillCategories = function (select, placeholder) {
    UF.fillSelect(select, Object.entries(UF.CATEGORIES).map(([value, c]) => ({ value, label: c.label })), placeholder);
  };

  function toDate(s) {
    if (!s) return null;
    const str = String(s);
    return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(str) ? str : `${str.replace(' ', 'T')}+07:00`);
  }
  UF.fmtDateTime = function (s) {
    const d = toDate(s);
    if (!d || Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }) + ' น.';
  };
  UF.fmtDate = function (s) {
    const d = toDate(s);
    if (!d || Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
  };
  /** เวลาแบบเป็นกันเอง: "เมื่อกี้", "3 ชม. ที่แล้ว", "2 วันก่อน" */
  UF.timeAgo = function (s) {
    const d = toDate(s);
    if (!d || Number.isNaN(d.getTime())) return '-';
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 2) return 'เมื่อกี้';
    if (min < 60) return `${min} นาทีที่แล้ว`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} ชม. ที่แล้ว`;
    const day = Math.round(h / 24);
    if (day < 7) return `${day} วันก่อน`;
    return UF.fmtDate(s);
  };
  /** ค่าเวลาปัจจุบันสำหรับ input datetime-local (เวลาไทย) */
  UF.nowLocal = function () {
    return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16);
  };

  UF.param = (name) => new URLSearchParams(location.search).get(name);

  UF.toast = function (message, type) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const t = document.createElement('div');
    t.className = `toast ${type || ''}`;
    t.setAttribute('role', 'status');
    t.textContent = message;
    root.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  };

  UF.badge = function (status, dict) {
    const label = (dict || UF.FOUND_STATUS)[status] || status;
    return `<span class="tag ${UF.esc(status)}">${UF.esc(label)}</span>`;
  };

  /** ภาพ: ภาพสาธารณะเบลอจากเซิร์ฟเวอร์อยู่แล้ว + ซ้อน CSS blur; ไม่มีรูป = ไอคอนหมวดบนพื้นสี */
  UF.thumb = function (item, opts) {
    const o = opts || {};
    const locked = o.locked !== false;
    const body = item.image
      ? `<img src="${UF.esc(UF.safeUrl(item.image))}" alt="รูป${UF.esc(item.title)}" loading="lazy" draggable="false">`
      : `<svg class="ph" aria-hidden="true"><use href="/assets/icons.svg#${(UF.CATEGORIES[item.category] || { icon: 'box' }).icon}"></use></svg>`;
    const lock = item.image && locked ? `<span class="lock-badge">${UF.icon('lock')} ยืนยันก่อนถึงจะเห็นชัด</span>` : '';
    return `<div class="thumb cat-${UF.esc(item.category)}${item.image && locked ? ' locked-img' : ''}">${body}${lock}
      ${o.noLabel ? '' : `<span class="cat-label">${UF.catIcon(item.category)} ${UF.esc(UF.catLabel(item.category))}</span>`}</div>`;
  };

  /** การ์ดของที่พบ (ข้อมูลปกปิด) สำหรับกริด */
  UF.foundCard = function (item, opts) {
    const o = opts || {};
    const href = `/match-verify.html?id=${Number(item.id || item.foundItemId)}${o.lostId ? `&lost=${Number(o.lostId)}` : ''}`;
    return `<a class="tile" href="${href}">
      ${UF.thumb(item)}
      <div class="body">
        <h3>${UF.esc(item.title)}</h3>
        <div class="meta">${UF.icon('pin')} ${UF.esc(item.location ? item.location.name : '')}</div>
        <div class="meta">${UF.icon('clock')} เจอ ${UF.esc(UF.timeAgo(item.foundAt))}</div>
        <div class="foot">${UF.badge(item.status)}${o.score !== undefined && o.score !== null ? `<strong>${Number(o.score)}%</strong>` : ''}</div>
      </div>
    </a>`;
  };

  /** ปุ่มเลือกหมวดหมู่แบบชิป (radio) */
  UF.categoryChips = function (container, name) {
    container.innerHTML = Object.entries(UF.CATEGORIES)
      .map(
        ([k, c], i) => `<label class="chip"><input type="radio" name="${UF.esc(name)}" value="${UF.esc(k)}" ${i === 0 ? 'checked' : ''}>
          <span>${UF.icon(c.icon)} ${UF.esc(c.label)}</span></label>`
      )
      .join('');
  };

  UF.empty = (icon, title, text) =>
    `<div class="empty">${UF.icon(icon)}<strong>${UF.esc(title)}</strong>${text ? UF.esc(text) : ''}</div>`;

  UF.setBusy = function (btn, busy, text) {
    if (!btn) return;
    if (busy) {
      btn.dataset.html = btn.innerHTML;
      btn.textContent = text || 'รอแป๊บ...';
      btn.disabled = true;
    } else {
      if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
      btn.disabled = false;
    }
  };

  window.UF = UF;
})();
