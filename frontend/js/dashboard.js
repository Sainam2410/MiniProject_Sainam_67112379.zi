(function () {
  'use strict';
  const { esc, icon } = UF;

  function showTab(name) {
    document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
  }
  document.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      showTab(b.dataset.tab);
      history.replaceState(null, '', `#${b.dataset.tab}`);
    })
  );
  document.getElementById('logout-mobile').addEventListener('click', () => UF.logout());

  // ---------- ของที่หาย ----------
  async function loadLost() {
    const box = document.getElementById('lost-list');
    const { items } = await UF.api.get('/lost/mine');
    const open = items.filter((i) => ['searching', 'matched'].includes(i.status));
    const waiting = open.reduce((s, i) => s + i.matchCount, 0);
    document.getElementById('s-lost').textContent = open.length;
    document.getElementById('s-match').textContent = waiting;

    const best = open.filter((i) => i.bestScore !== null).sort((a, b) => b.bestScore - a.bestScore)[0];
    document.getElementById('nudge').innerHTML = best
      ? `<div class="note match">${icon('sparkle')}<div class="row between nudge-row">
          <div><strong>มีของที่อาจเป็น "${esc(best.title)}" ตรงกันสูงสุด ${Number(best.bestScore)}%</strong>
          <div class="small">${best.newMatches ? `ใบใหม่ ${Number(best.newMatches)} ใบ ` : ''}รอให้เธอปัดดูอยู่</div></div>
          <a class="btn btn-ink btn-sm" href="/match.html?lost=${Number(best.id)}">${icon('cards')} ไปปัด</a></div></div>`
      : '';

    box.innerHTML = items.length
      ? items
          .map((i) => {
            const isOpen = ['searching', 'matched'].includes(i.status);
            return `<div class="panel">
            <div class="row between">
              <div class="row"><span class="ico-tile cat-${esc(i.category)}">${UF.catIcon(i.category)}</span>
                <div><h3>${esc(i.title)}</h3>
                <div class="small muted">${icon('pin')} ${esc(i.location.name)}</div>
                <div class="small muted">${icon('clock')} หายเมื่อ ${esc(UF.fmtDateTime(i.lostAt))}</div></div></div>
              ${UF.badge(i.status, UF.LOST_STATUS)}
            </div>
            ${isOpen
              ? `<div class="row mt">
                  ${i.matchCount ? `<a class="btn btn-sm btn-grape" href="/match.html?lost=${Number(i.id)}">${icon('cards')} ปัดดู ${Number(i.matchCount)} ใบ</a>` : '<span class="small muted">ยังไม่มีใบที่ใกล้เคียง</span>'}
                  <button class="btn btn-sm" data-rematch="${Number(i.id)}">${icon('refresh')} ให้ระบบหาใหม่</button>
                  <button class="btn btn-sm btn-plain" data-cancel="${Number(i.id)}">ยกเลิกการแจ้ง</button></div>`
              : ''}
          </div>`;
          })
          .join('')
      : UF.empty('sparkle', 'ยังไม่มีของหาย', 'ขอให้เป็นแบบนี้ไปนาน ๆ');

    box.querySelectorAll('[data-rematch]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          const r = await UF.api.post(`/lost/${Number(b.dataset.rematch)}/rematch`);
          UF.toast(r.message, 'success');
          loadLost();
        } catch (err) { UF.toast(err.message, 'error'); }
      })
    );
    box.querySelectorAll('[data-cancel]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!window.confirm('ยกเลิกการแจ้งของหายชิ้นนี้?')) return;
        try {
          await UF.api.patch(`/lost/${Number(b.dataset.cancel)}/cancel`);
          UF.toast('ยกเลิกแล้ว', 'success');
          loadLost();
        } catch (err) { UF.toast(err.message, 'error'); }
      })
    );
  }

  // ---------- ของที่เก็บได้ ----------
  async function loadFound() {
    const { items } = await UF.api.get('/found/mine');
    document.getElementById('s-found').textContent = items.length;
    document.getElementById('found-list').innerHTML = items.length
      ? items.map((it) => UF.foundCard(it)).join('')
      : `${UF.empty('hand', 'ยังไม่เคยโพสต์ของที่เจอ', 'เจอของใครตกไว้ โพสต์ได้ที่ปุ่มเจอของ')}`;
  }

  // ---------- ตรวจคำตอบ ----------
  async function loadReview() {
    const { claims } = await UF.api.get('/claims/review');
    document.getElementById('s-review').textContent = claims.length;
    const count = document.getElementById('review-count');
    count.textContent = String(claims.length);
    count.classList.toggle('hidden', !claims.length);
    const box = document.getElementById('review-list');
    box.innerHTML = claims.length
      ? claims
          .map(
            (c) => `<div class="panel">
          <div class="row between"><h3>${esc(c.title)}</h3>
            <span class="tag pending_review">คำสำคัญตรง ${Number(c.autoScore)}%</span></div>
          <p class="small muted">ส่งโดย ${esc(c.claimant.name)} (${esc(c.claimant.studentId)}) ${esc(UF.timeAgo(c.submittedAt))}, ตอบผิดมาแล้ว ${Number(c.attempts)} ครั้ง</p>
          <div class="table-wrap"><table>
            <thead><tr><th>คำถาม</th><th>เขาตอบว่า</th><th>คำตอบที่เธอตั้งไว้</th></tr></thead>
            <tbody>${c.qa
              .map((q) => `<tr><td>${esc(q.question)}</td><td><strong>${esc(q.answer)}</strong></td>
                <td>${q.expected.map((k) => `<span class="kw">${esc(k)}</span>`).join('')}</td></tr>`)
              .join('')}</tbody></table></div>
          <div class="row mt">
            <button class="btn btn-mint" data-decide="approve" data-id="${Number(c.id)}">${icon('check')} ใช่เจ้าของ ให้ผ่าน</button>
            <button class="btn btn-danger" data-decide="reject" data-id="${Number(c.id)}">${icon('x')} ไม่ผ่าน</button>
          </div>
          <p class="hint">กดไม่ผ่านจะนับเป็นการตอบผิด 1 ครั้งของคนนั้น</p></div>`
          )
          .join('')
      : UF.empty('check', 'ไม่มีคำตอบรอตรวจ', 'มีคนส่งคำตอบมาเมื่อไหร่จะขึ้นตรงนี้');
    box.querySelectorAll('[data-decide]').forEach((b) =>
      b.addEventListener('click', async () => {
        const approve = b.dataset.decide === 'approve';
        if (!window.confirm(approve ? 'ให้ผ่านแล้วเขาจะเห็นช่องทางติดต่อเธอ โอเคไหม?' : 'ยืนยันว่าไม่ผ่าน?')) return;
        try {
          const r = await UF.api.post(`/claims/${Number(b.dataset.id)}/decision`, { decision: b.dataset.decide });
          UF.toast(r.message, 'success');
          loadReview();
          loadFound();
        } catch (err) { UF.toast(err.message, 'error'); }
      })
    );
  }

  // ---------- คำขอของฉัน ----------
  async function loadClaims() {
    const { claims } = await UF.api.get('/claims/mine');
    document.getElementById('claim-list').innerHTML = claims.length
      ? `<table><thead><tr><th>ของ</th><th>สถานะ</th><th>โอกาสที่เหลือ</th><th>อัปเดต</th><th></th></tr></thead><tbody>
        ${claims
          .map(
            (c) => `<tr><td>${esc(c.title)}</td>
            <td>${UF.badge(c.status, UF.CLAIM_STATUS)}</td>
            <td>${['approved', 'completed'].includes(c.status) ? '-' : `${Number(c.attemptsLeft)} ครั้ง`}</td>
            <td>${esc(UF.timeAgo(c.updatedAt))}</td>
            <td><a class="btn btn-sm" href="/match-verify.html?id=${Number(c.foundItemId)}">เปิด</a></td></tr>`
          )
          .join('')}</tbody></table>`
      : UF.empty('lock', 'ยังไม่เคยขอรับของ', 'ปัดขวาใบที่ใช่ แล้วตอบคำถามลับ คำขอจะมาอยู่ตรงนี้');
  }

  (async function init() {
    const me = await UF.requireAuth();
    if (!me) return;
    document.getElementById('hello').textContent = `หวัดดี ${me.firstName}`;
    document.getElementById('profile').textContent = `${me.studentId}, ${me.email}${me.role === 'admin' ? ', แอดมิน' : ''}`;
    const tab = location.hash.replace('#', '');
    if (['lost', 'found', 'review', 'claims'].includes(tab)) showTab(tab);
    const results = await Promise.allSettled([loadLost(), loadFound(), loadReview(), loadClaims()]);
    results.forEach((r) => { if (r.status === 'rejected') UF.toast(r.reason.message, 'error'); });
  })();
})();
