/* หน้า "ปัดหาของ" — การ์ดแบบปัดซ้าย/ขวา ใช้ API เดิม (/lost/mine, /lost/:id/matches) */
(function () {
  'use strict';
  const { esc, icon } = UF;
  const deck = document.getElementById('deck');
  const picker = document.getElementById('picker');
  const btnNo = document.getElementById('btn-no');
  const btnYes = document.getElementById('btn-yes');
  const btnUndo = document.getElementById('btn-undo');
  const btnInfo = document.getElementById('btn-info');
  const THRESHOLD = 110;
  const WEIGHTS = { category: 35, keywords: 30, location: 20, time: 15 };
  const WHY_LABEL = { category: 'หมวด', keywords: 'คำค้น', location: 'สถานที่', time: 'เวลา' };

  let me = null;
  let lostItems = [];
  let lostId = null;
  let queue = [];
  const skipped = []; // สำหรับปุ่มย้อนกลับ
  let busy = false;

  // ---------- เก็บการ์ดที่ปัดซ้ายไว้ในเครื่อง (ไม่ส่งไปเซิร์ฟเวอร์) ----------
  const nopeKey = () => `uf-nope-${me.id}-${lostId}`;
  function getNope() {
    try { return JSON.parse(localStorage.getItem(nopeKey())) || []; } catch (_e) { return []; }
  }
  function setNope(list) {
    try { localStorage.setItem(nopeKey(), JSON.stringify(list.slice(-200))); } catch (_e) { /* storage ใช้ไม่ได้ก็ข้าม */ }
  }

  // ---------- การ์ด ----------
  function whyBars(b) {
    if (!b) return '';
    return `<div class="why" aria-label="เหตุผลที่ระบบจับคู่">${Object.keys(WEIGHTS)
      .map((k) => {
        const pct = Math.round(((Number(b[k]) || 0) / WEIGHTS[k]) * 100);
        return `<div>${WHY_LABEL[k]}<span class="bar-track"><span class="bar-fill" data-w="${pct}"></span></span></div>`;
      })
      .join('')}</div>`;
  }

  function cardEl(m) {
    const el = document.createElement('article');
    el.className = 'swipe-card';
    el.dataset.id = String(m.foundItemId);
    el.innerHTML = `<div class="media">
        ${UF.thumb(m)}
        <div class="score-sticker">${Number(m.score)}%<small>ตรงกัน</small></div>
        <span class="stamp yes">ใช่ของฉัน</span>
        <span class="stamp no">ไม่ใช่</span>
      </div>
      <div class="info">
        <h3>${esc(m.title)}</h3>
        <div class="meta">
          <span>${icon('pin')} ${esc(m.location.name)}</span>
          <span>${icon('clock')} เจอ ${esc(UF.timeAgo(m.foundAt))}</span>
          <span>${icon('user')} คนเก็บได้: ${esc(m.finderName)}${m.status === 'pending_claim' ? ' (มีคนขอรับอยู่)' : ''}</span>
        </div>
        ${whyBars(m.breakdown)}
      </div>`;
    // ความกว้างแท่งตั้งผ่าน CSSOM (CSP ไม่อนุญาต inline style)
    el.querySelectorAll('.bar-fill').forEach((f) => { f.style.width = `${f.dataset.w}%`; });
    el.querySelectorAll('img').forEach((img) => img.addEventListener('dragstart', (e) => e.preventDefault()));
    return el;
  }

  function setControls(enabled) {
    btnNo.disabled = !enabled;
    btnYes.disabled = !enabled;
    btnInfo.disabled = !enabled;
    btnUndo.disabled = !skipped.length;
  }

  function emptyState() {
    const nopeCount = getNope().length;
    deck.innerHTML = `<div class="deck-empty">
      ${icon('sparkle', 'i-lg')}
      <h3 class="mt">ปัดครบทุกใบแล้ว</h3>
      <p class="muted">ตอนนี้ยังไม่มีของที่ใกล้เคียงเพิ่ม พอมีคนแจ้งเจอของที่คล้ายกัน ระบบจะเด้งแจ้งเตือนทันที</p>
      <div class="row center-row">
        ${nopeCount ? `<button class="btn btn-sm" id="reset-nope" type="button">${icon('undo')} ดูใบที่ข้ามอีกรอบ (${nopeCount})</button>` : ''}
        <button class="btn btn-sm btn-butter" id="rematch" type="button">${icon('refresh')} ให้ระบบหาใหม่</button>
      </div>
    </div>`;
    const reset = document.getElementById('reset-nope');
    if (reset) reset.addEventListener('click', () => { setNope([]); loadDeck(); });
    document.getElementById('rematch').addEventListener('click', async (e) => {
      UF.setBusy(e.currentTarget, true, 'กำลังหา...');
      try {
        const r = await UF.api.post(`/lost/${lostId}/rematch`);
        UF.toast(r.message, 'success');
        await loadDeck();
      } catch (err) {
        UF.toast(err.message, 'error');
        UF.setBusy(e.currentTarget, false);
      }
    });
    setControls(false);
  }

  /** วาดกองการ์ดใหม่ทั้งหมด (ใบบนสุดอยู่ท้าย DOM) */
  function renderDeck() {
    deck.innerHTML = '';
    if (!queue.length) { emptyState(); return; }
    const visible = queue.slice(0, 3);
    for (let i = visible.length - 1; i >= 0; i -= 1) {
      const el = cardEl(visible[i]);
      if (i === 1) el.classList.add('behind-1');
      if (i === 2) el.classList.add('behind-2');
      deck.appendChild(el);
    }
    attachDrag(deck.lastElementChild);
    setControls(true);
  }

  /** เลื่อนการ์ดใบถัดไปขึ้นมาแบบไม่วาดใหม่ทั้งกอง (ใบล่างขยับขึ้นแบบมีแอนิเมชัน) */
  function promote() {
    let list = Array.from(deck.querySelectorAll('.swipe-card'));
    if (queue[list.length] && list.length < 3) {
      deck.insertBefore(cardEl(queue[list.length]), deck.firstChild);
      list = Array.from(deck.querySelectorAll('.swipe-card'));
    }
    list.forEach((c) => c.classList.remove('behind-1', 'behind-2'));
    const n = list.length;
    if (n >= 2) list[n - 2].classList.add('behind-1');
    if (n >= 3) list[n - 3].classList.add('behind-2');
    const top = list[n - 1];
    if (top) { attachDrag(top); setControls(true); } else emptyState();
  }

  function flyOut(el, dir) {
    return new Promise((resolve) => {
      el.classList.remove('dragging');
      el.classList.add('fly');
      el.style.transform = `translate(${dir * 700}px, 40px) rotate(${dir * 28}deg)`;
      setTimeout(() => { el.remove(); resolve(); }, 330);
    });
  }

  async function swipe(dir) {
    if (busy || !queue.length) return;
    busy = true;
    const top = deck.querySelector('.swipe-card:last-of-type');
    const m = queue[0];
    if (top) {
      top.querySelector(dir > 0 ? '.stamp.yes' : '.stamp.no').style.opacity = '1';
      await flyOut(top, dir);
    }
    if (dir > 0) {
      location.href = `/match-verify.html?id=${Number(m.foundItemId)}&lost=${Number(lostId)}&verify=1`;
      return;
    }
    queue.shift();
    skipped.push(m);
    setNope([...getNope(), m.foundItemId]);
    if (queue.length) promote(); else emptyState();
    btnUndo.disabled = !skipped.length;
    busy = false;
  }

  function undo() {
    if (busy || !skipped.length) return;
    const m = skipped.pop();
    setNope(getNope().filter((id) => id !== m.foundItemId));
    queue.unshift(m);
    renderDeck();
  }

  // ---------- ลากด้วยนิ้ว/เมาส์ ----------
  function attachDrag(el) {
    if (!el || el.dataset.drag) return;
    el.dataset.drag = '1';
    const yes = el.querySelector('.stamp.yes');
    const no = el.querySelector('.stamp.no');
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;
    let active = false;

    el.addEventListener('pointerdown', (e) => {
      if (busy || e.button > 0) return;
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dy = 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      el.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 16}deg)`;
      yes.style.opacity = String(Math.max(0, Math.min(1, dx / THRESHOLD)));
      no.style.opacity = String(Math.max(0, Math.min(1, -dx / THRESHOLD)));
    });
    const end = () => {
      if (!active) return;
      active = false;
      el.classList.remove('dragging');
      if (dx > THRESHOLD) { swipe(1); return; }
      if (dx < -THRESHOLD) { swipe(-1); return; }
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        el.style.transform = '';
        return;
      }
      el.classList.add('settle');
      el.style.transform = '';
      yes.style.opacity = '0';
      no.style.opacity = '0';
      setTimeout(() => el.classList.remove('settle'), 300);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ---------- รายการของหาย ----------
  function renderPicker() {
    picker.innerHTML = lostItems
      .map(
        (l) => `<button type="button" class="lost-pick" data-id="${Number(l.id)}" aria-pressed="${l.id === lostId}">
          <span class="ico">${UF.catIcon(l.category)}</span>
          <span>${esc(l.title)}</span>
          <span class="count">${Number(l.matchCount)}</span></button>`
      )
      .join('') + `<a class="lost-pick add-pick" href="/report-lost.html">${icon('plus')} แจ้งเพิ่ม</a>`;
    picker.querySelectorAll('.lost-pick').forEach((b) =>
      b.addEventListener('click', () => {
        lostId = Number(b.dataset.id);
        history.replaceState(null, '', `?lost=${lostId}`);
        renderPicker();
        loadDeck();
      })
    );
  }

  async function loadDeck() {
    deck.innerHTML = '<div class="spinner"></div>';
    skipped.length = 0;
    try {
      const r = await UF.api.get(`/lost/${lostId}/matches`);
      const nope = getNope();
      queue = r.matches.filter((m) => m.status !== 'returned' && !nope.includes(m.foundItemId));
      renderDeck();
    } catch (err) {
      deck.innerHTML = `<div class="deck-empty">${UF.empty('info', 'โหลดการ์ดไม่ได้', err.message)}</div>`;
      setControls(false);
    }
  }

  btnNo.addEventListener('click', () => swipe(-1));
  btnYes.addEventListener('click', () => swipe(1));
  btnUndo.addEventListener('click', undo);
  btnInfo.addEventListener('click', () => {
    if (queue[0]) location.href = `/match-verify.html?id=${Number(queue[0].foundItemId)}&lost=${Number(lostId)}`;
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') swipe(-1);
    if (e.key === 'ArrowRight') swipe(1);
  });

  (async function init() {
    me = await UF.requireAuth();
    if (!me) return;
    try {
      lostItems = (await UF.api.get('/lost/mine')).items.filter((l) => ['searching', 'matched'].includes(l.status));
    } catch (err) {
      deck.innerHTML = `<div class="deck-empty">${UF.empty('info', 'โหลดข้อมูลไม่ได้', err.message)}</div>`;
      setControls(false);
      return;
    }
    if (!lostItems.length) {
      document.getElementById('picker-title').classList.add('hidden');
      deck.innerHTML = `<div class="deck-empty">
        ${icon('search', 'i-lg')}
        <h3 class="mt">ยังไม่มีของที่ตามหาอยู่</h3>
        <p class="muted">แจ้งของหายก่อน แล้วระบบจะคัดของที่มีคนเก็บได้มาให้ปัดดูตรงนี้</p>
        <a class="btn btn-grape" href="/report-lost.html">แจ้งของหาย</a></div>`;
      setControls(false);
      return;
    }
    const fromUrl = Number(UF.param('lost'));
    const preferred = lostItems.find((l) => l.id === fromUrl) || lostItems.find((l) => l.matchCount > 0) || lostItems[0];
    lostId = preferred.id;
    renderPicker();
    loadDeck();
  })();
})();
