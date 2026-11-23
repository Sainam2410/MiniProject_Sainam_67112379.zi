(function () {
  'use strict';
  const form = document.getElementById('search-form');
  const results = document.getElementById('results');
  const info = document.getElementById('result-info');
  const pager = document.getElementById('pagination');
  const catInput = document.getElementById('f-category');
  let page = 1;

  async function loadStats() {
    try {
      const s = await UF.api.get('/meta/stats');
      document.getElementById('live-text').textContent =
        `ตอนนี้มีของรอเจ้าของ ${s.waiting} ชิ้น และส่งคืนไปแล้ว ${s.returned} ชิ้น`;
    } catch (_e) {
      document.getElementById('live-line').classList.add('hidden');
    }
  }

  function quickCats() {
    const wrap = document.getElementById('quick-cats');
    const cats = [['', 'ทั้งหมด', 'sparkle'], ...Object.entries(UF.CATEGORIES).map(([k, c]) => [k, c.label, c.icon])];
    wrap.innerHTML = cats
      .map(([k, l, ic]) => `<button type="button" class="pill-btn" data-cat="${UF.esc(k)}" aria-pressed="${k === ''}">${UF.icon(ic)} ${UF.esc(l)}</button>`)
      .join('');
    wrap.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        catInput.value = b.dataset.cat;
        page = 1;
        search();
      })
    );
  }

  async function search() {
    const params = new URLSearchParams();
    new FormData(form).forEach((v, k) => { if (v) params.set(k, v); });
    params.set('page', String(page));
    results.innerHTML = '<div class="spinner"></div>';
    try {
      const data = await UF.api.get(`/found?${params.toString()}`);
      info.textContent = `เจอ ${data.total} รายการ`;
      results.innerHTML = data.items.length
        ? data.items.map((it) => UF.foundCard(it)).join('')
        : UF.empty('search', 'ยังไม่เจอที่ตรงกับที่ค้น', 'ลองเปลี่ยนคำค้น หรือแจ้งของหายไว้ มีคนเก็บได้เมื่อไหร่ระบบจะเด้งบอก');
      const pages = Math.ceil(data.total / data.pageSize);
      pager.innerHTML = '';
      if (pages > 1) {
        for (let p = 1; p <= pages; p += 1) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `btn btn-sm ${p === page ? 'btn-ink' : ''}`;
          b.textContent = String(p);
          b.addEventListener('click', () => { page = p; search(); window.scrollTo({ top: form.offsetTop - 90 }); });
          pager.appendChild(b);
        }
      }
    } catch (err) {
      results.innerHTML = UF.empty('info', 'โหลดรายการไม่ได้', err.message);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    page = 1;
    search();
  });
  ['f-location', 'f-status', 'f-from', 'f-to'].forEach((id) =>
    document.getElementById(id).addEventListener('change', () => { page = 1; search(); })
  );

  (async function init() {
    try { await UF.fillLocations(document.getElementById('f-location'), 'ทุกที่ใน DPU'); } catch (_e) { /* ignore */ }
    quickCats();
    loadStats();
    search();
  })();
})();
