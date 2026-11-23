(function () {
  'use strict';
  const { esc } = UF;
  const loaded = {};

  function showTab(name) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
    history.replaceState(null, '', `#${name}`);
    if (!loaded[name]) {
      loaded[name] = true;
      const loader = { overview: loadStats, claims: loadClaims, items: loadItems, users: loadUsers, audit: loadAudit }[name];
      Promise.resolve()
        .then(loader)
        .catch((e) => UF.toast(e.message, 'error'));
    }
  }
  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  const set = (id, v) => { document.getElementById(id).textContent = Number(v).toLocaleString('th-TH'); };

  // ---------- กราฟแท่งแนวนอน (lost vs found) ----------
  function hBars(container, rows) {
    container.innerHTML = '';
    const max = Math.max(1, ...rows.map((r) => Math.max(r.lost, r.found)));
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'bar-row';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = r.name;
      name.title = r.name;
      const pair = document.createElement('div');
      pair.className = 'bar-pair';
      [['lost', 'แจ้งหาย'], ['found', 'แจ้งเจอ']].forEach(([key, label]) => {
        const line = document.createElement('div');
        line.className = 'bar-line';
        const bar = document.createElement('div');
        bar.className = `bar ${key}`;
        bar.style.width = `${(r[key] / max) * 85}%`;
        bar.dataset.tip = `${r.name} · ${label} ${r[key]}`;
        const v = document.createElement('span');
        v.className = 'v';
        v.textContent = String(r[key]);
        line.append(bar, v);
        pair.appendChild(line);
      });
      row.append(name, pair);
      container.appendChild(row);
    });
  }

  // ---------- กราฟแท่งแนวตั้งรายวัน ----------
  function dailyCols(container, labels, rows) {
    container.innerHTML = '';
    labels.innerHTML = '';
    const max = Math.max(1, ...rows.map((r) => Math.max(r.lost, r.found)));
    rows.forEach((r) => {
      const g = document.createElement('div');
      g.className = 'col-group';
      const day = UF.fmtDate(`${r.day} 00:00:00`);
      [['lost', 'แจ้งหาย'], ['found', 'แจ้งเจอ']].forEach(([key, label]) => {
        const c = document.createElement('div');
        c.className = `col ${key}`;
        c.style.height = `${(r[key] / max) * 100}%`;
        c.dataset.tip = `${day} · ${label} ${r[key]}`;
        g.appendChild(c);
      });
      container.appendChild(g);
      const l = document.createElement('div');
      l.textContent = day.split(' ').slice(0, 2).join(' ');
      labels.appendChild(l);
    });
  }

  async function loadStats() {
    const s = await UF.api.get('/admin/stats');
    const t = s.totals;
    set('t-lost', t.lost_total);
    set('t-found', t.found_total);
    set('t-success', t.claims_success);
    set('t-pending', t.claims_pending);
    set('t-match', t.match_total);
    set('t-returned', t.returned_total);
    set('t-locked', t.claims_locked);
    set('t-users', t.users_active);
    const cc = document.getElementById('claims-count');
    cc.textContent = String(t.claims_locked + t.claims_pending);
    cc.classList.toggle('hidden', !(t.claims_locked + t.claims_pending));

    hBars(
      document.getElementById('chart-category'),
      s.byCategory.map((c) => ({ name: UF.catLabel(c.category), lost: c.lost, found: c.found }))
    );
    const locRows = s.byLocation
      .map((l) => ({ name: l.name, lost: l.lost, found: l.found }))
      .sort((a, b) => b.lost + b.found - (a.lost + a.found));
    hBars(document.getElementById('chart-location'), locRows);
    document.getElementById('location-table').innerHTML = `<table><thead><tr><th>สถานที่</th><th>แจ้งหาย</th><th>แจ้งเจอ</th></tr></thead>
      <tbody>${locRows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.lost}</td><td>${r.found}</td></tr>`).join('')}</tbody></table>`;
    dailyCols(document.getElementById('chart-daily'), document.getElementById('chart-daily-labels'), s.daily);
  }

  // ---------- คำขอ ----------
  async function loadClaims() {
    const status = document.getElementById('claim-status').value;
    const { claims } = await UF.api.get(`/admin/claims?status=${encodeURIComponent(status)}`);
    const box = document.getElementById('claims-table');
    box.innerHTML = claims.length
      ? `<table><thead><tr><th>#</th><th>สิ่งของ</th><th>ผู้ขอรับคืน</th><th>ผู้เก็บได้</th><th>ตอบผิด</th><th>สถานะ</th><th>อัปเดต</th><th></th></tr></thead><tbody>
        ${claims
          .map(
            (c) => `<tr><td>${Number(c.id)}</td><td><a href="/match-verify.html?id=${Number(c.foundItemId)}">${esc(c.title)}</a></td>
            <td>${esc(c.claimant)}</td><td>${esc(c.finder)}</td><td>${Number(c.attempts)} / 3</td>
            <td>${UF.badge(c.status, UF.CLAIM_STATUS)}${c.status === 'locked'
              ? `<div class="small muted">${c.lockedUntil ? `ถึง ${esc(UF.fmtDateTime(c.lockedUntil))}` : 'ล็อกถาวร'}</div>`
              : ''}</td>
            <td>${esc(UF.fmtDateTime(c.updatedAt))}</td>
            <td>${c.status === 'locked' ? `<button class="btn btn-sm" data-unlock="${Number(c.id)}">ปลดล็อก</button>` : ''}</td></tr>`
          )
          .join('')}</tbody></table>`
      : UF.empty('check', 'ไม่มีคำขอในสถานะนี้');
    box.querySelectorAll('[data-unlock]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!window.confirm('ปลดล็อกคำขอนี้? ผู้ใช้จะตอบคำถามได้อีก 3 ครั้ง (ควรตรวจสอบตัวตนที่ One Stop Service ก่อน)')) return;
        try {
          const r = await UF.api.post(`/admin/claims/${Number(b.dataset.unlock)}/unlock`);
          UF.toast(r.message, 'success');
          loadClaims();
          loadStats();
        } catch (err) { UF.toast(err.message, 'error'); }
      })
    );
    const review = document.getElementById('review-box');
    if (status !== 'pending_review') { review.innerHTML = ''; return; }
    const data = await UF.api.get('/claims/review');
    review.innerHTML = data.claims
      .map(
        (c) => `<div class="panel"><h3>ตรวจคำตอบ: ${esc(c.title)}</h3>
        <p class="small muted">${esc(c.claimant.name)} (${esc(c.claimant.studentId)}) · คีย์เวิร์ดผ่าน ${Number(c.autoScore)}%</p>
        <table><thead><tr><th>คำถาม</th><th>คำตอบ</th><th>คีย์เวิร์ด</th></tr></thead><tbody>
        ${c.qa.map((q) => `<tr><td>${esc(q.question)}</td><td><strong>${esc(q.answer)}</strong></td><td>${q.expected.map((k) => `<span class="kw">${esc(k)}</span>`).join('')}</td></tr>`).join('')}
        </tbody></table>
        <div class="row mt"><button class="btn btn-mint btn-sm" data-decide="approve" data-id="${Number(c.id)}">ให้ผ่าน</button>
        <button class="btn btn-danger btn-sm" data-decide="reject" data-id="${Number(c.id)}">ไม่ผ่าน</button></div></div>`
      )
      .join('');
    review.querySelectorAll('[data-decide]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          const r = await UF.api.post(`/claims/${Number(b.dataset.id)}/decision`, { decision: b.dataset.decide });
          UF.toast(r.message, 'success');
          loadClaims();
          loadStats();
        } catch (err) { UF.toast(err.message, 'error'); }
      })
    );
  }
  document.getElementById('claim-status').addEventListener('change', () => loadClaims().catch((e) => UF.toast(e.message, 'error')));

  // ---------- สิ่งของ ----------
  const STATUS_BY_TYPE = { found: UF.FOUND_STATUS, lost: UF.LOST_STATUS };
  function fillItemStatus() {
    const type = document.getElementById('items-type').value;
    UF.fillSelect(
      document.getElementById('items-status'),
      Object.entries(STATUS_BY_TYPE[type]).map(([value, label]) => ({ value, label })),
      'ทุกสถานะ'
    );
  }
  async function loadItems() {
    const type = document.getElementById('items-type').value;
    const params = new URLSearchParams({ type });
    const st = document.getElementById('items-status').value;
    const q = document.getElementById('items-q').value.trim();
    if (st) params.set('status', st);
    if (q) params.set('q', q);
    const { items } = await UF.api.get(`/admin/items?${params.toString()}`);
    const box = document.getElementById('items-table');
    box.innerHTML = items.length
      ? `<table><thead><tr><th>#</th><th>สิ่งของ</th><th>สถานที่</th><th>${type === 'lost' ? 'ผู้แจ้งหาย' : 'ผู้เก็บได้'}</th><th>วัน-เวลา</th><th>สถานะ</th><th></th></tr></thead><tbody>
        ${items
          .map(
            (i) => `<tr><td>${Number(i.id)}</td>
            <td>${type === 'found' ? `<a href="/match-verify.html?id=${Number(i.id)}">${esc(UF.catLabel(i.category))} ${esc(i.title)}</a>` : `${esc(UF.catLabel(i.category))} ${esc(i.title)}`}</td>
            <td>${esc(i.location)}</td><td>${esc(i.owner)}</td><td>${esc(UF.fmtDateTime(i.eventAt))}</td>
            <td>${UF.badge(i.status, STATUS_BY_TYPE[type])}</td>
            <td><button class="btn btn-danger btn-sm" data-del="${Number(i.id)}">ลบ</button></td></tr>`
          )
          .join('')}</tbody></table>`
      : UF.empty('box', 'ไม่พบรายการ');
    box.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!window.confirm('ลบรายการนี้ถาวร? (ข้อมูลคำขอและแชตที่เกี่ยวข้องจะถูกลบด้วย)')) return;
        try {
          await UF.api.del(`/admin/items/${type}/${Number(b.dataset.del)}`);
          UF.toast('ลบแล้ว', 'success');
          loadItems();
          loadStats();
        } catch (err) { UF.toast(err.message, 'error'); }
      })
    );
  }
  document.getElementById('items-type').addEventListener('change', () => { fillItemStatus(); loadItems(); });
  document.getElementById('items-form').addEventListener('submit', (e) => { e.preventDefault(); loadItems().catch((er) => UF.toast(er.message, 'error')); });

  // ---------- ผู้ใช้ ----------
  async function loadUsers() {
    const q = document.getElementById('users-q').value.trim();
    const { users } = await UF.api.get(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const box = document.getElementById('users-table');
    box.innerHTML = `<table><thead><tr><th>รหัส</th><th>ชื่อ</th><th>อีเมล</th><th>เบอร์โทร</th><th>บทบาท</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th>จัดการ</th></tr></thead><tbody>
      ${users
        .map(
          (u) => `<tr><td>${esc(u.studentId)}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.phone || '-')}</td>
          <td>${u.role === 'admin' ? '<span class="tag admin">Admin</span>' : '<span class="tag none">User</span>'}</td>
          <td>${u.isActive ? '<span class="tag approved">ใช้งาน</span>' : '<span class="tag inactive">ระงับ</span>'}
            ${u.loginLocked ? '<span class="tag locked">ล็อกอินถูกล็อก</span>' : ''}</td>
          <td>${esc(u.lastLoginAt ? UF.fmtDateTime(u.lastLoginAt) : '-')}</td>
          <td class="row">
            ${u.id === UF.me.id ? '<span class="small muted">บัญชีของคุณ</span>' : `
            <button class="btn btn-sm" data-active="${Number(u.id)}" data-val="${u.isActive ? 0 : 1}">${u.isActive ? 'ระงับ' : 'เปิดใช้'}</button>
            <button class="btn btn-sm" data-role="${Number(u.id)}" data-val="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'ลดเป็น User' : 'ตั้งเป็น Admin'}</button>
            ${u.loginLocked ? `<button class="btn btn-sm" data-unlock-login="${Number(u.id)}">ปลดล็อกอิน</button>` : ''}`}
          </td></tr>`
        )
        .join('')}</tbody></table>`;
    const patch = async (uid, body, confirmMsg) => {
      if (!window.confirm(confirmMsg)) return;
      try {
        const r = await UF.api.patch(`/admin/users/${uid}`, body);
        UF.toast(r.message, 'success');
        loadUsers();
      } catch (err) { UF.toast(err.message, 'error'); }
    };
    box.querySelectorAll('[data-active]').forEach((b) =>
      b.addEventListener('click', () => patch(Number(b.dataset.active), { isActive: b.dataset.val === '1' }, 'ยืนยันเปลี่ยนสถานะผู้ใช้?'))
    );
    box.querySelectorAll('[data-role]').forEach((b) =>
      b.addEventListener('click', () => patch(Number(b.dataset.role), { role: b.dataset.val }, `ยืนยันเปลี่ยนบทบาทเป็น ${b.dataset.val}?`))
    );
    box.querySelectorAll('[data-unlock-login]').forEach((b) =>
      b.addEventListener('click', () => patch(Number(b.dataset.unlockLogin), { unlockLogin: true }, 'ปลดล็อกการเข้าสู่ระบบของผู้ใช้นี้?'))
    );
  }
  document.getElementById('users-form').addEventListener('submit', (e) => { e.preventDefault(); loadUsers().catch((er) => UF.toast(er.message, 'error')); });

  // ---------- Audit ----------
  async function loadAudit() {
    const action = document.getElementById('audit-action').value;
    const { logs } = await UF.api.get(`/admin/audit-logs${action ? `?action=${encodeURIComponent(action)}` : ''}`);
    document.getElementById('audit-table').innerHTML = logs.length
      ? `<table><thead><tr><th>เวลา</th><th>เหตุการณ์</th><th>ผู้ใช้</th><th>อ้างอิง</th><th>IP</th><th>รายละเอียด</th></tr></thead><tbody>
        ${logs
          .map(
            (l) => `<tr><td>${esc(UF.fmtDateTime(l.createdAt))}</td>
            <td><span class="tag ${/FAILED|LOCKED|DENIED/.test(l.action) ? 'locked' : 'none'}">${esc(l.action)}</span></td>
            <td>${esc(l.user)}</td><td>${esc(l.entity)}</td><td>${esc(l.ip || '-')}</td>
            <td class="small">${esc(l.details ? JSON.stringify(l.details) : '-')}</td></tr>`
          )
          .join('')}</tbody></table>`
      : UF.empty('list', 'ไม่พบบันทึก');
  }
  document.getElementById('audit-form').addEventListener('submit', (e) => { e.preventDefault(); loadAudit().catch((er) => UF.toast(er.message, 'error')); });

  document.getElementById('refresh').addEventListener('click', () => {
    Object.keys(loaded).forEach((k) => { loaded[k] = false; });
    const current = (document.querySelector('[data-tab].active') || {}).dataset;
    loaded.overview = true;
    loadStats().catch((e) => UF.toast(e.message, 'error'));
    if (current && current.tab !== 'overview') { loaded[current.tab] = false; showTab(current.tab); }
    UF.toast('อัปเดตแล้ว');
  });

  (async function init() {
    if (!(await UF.requireAuth('admin'))) return;
    fillItemStatus();
    loaded.overview = true;
    try { await loadStats(); } catch (e) { UF.toast(e.message, 'error'); }
    const tab = location.hash.replace('#', '');
    if (['claims', 'items', 'users', 'audit'].includes(tab)) showTab(tab);
  })();
})();
