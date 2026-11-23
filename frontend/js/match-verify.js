(function () {
  'use strict';
  const { esc, icon } = UF;
  const id = Number(UF.param('id'));
  const lostParam = Number(UF.param('lost')) || null;
  const autoQuiz = UF.param('verify') === '1';
  const page = document.getElementById('page');
  const banner = document.getElementById('banner');
  let stopChat = null;

  if (lostParam) document.getElementById('back-link').href = `/match.html?lost=${lostParam}`;

  function attempts(left, max) {
    let html = `<span class="attempts" aria-label="เหลือโอกาส ${left} ครั้ง">`;
    for (let i = 0; i < max; i += 1) html += `<i class="${i < max - left ? 'used' : ''}"></i>`;
    return `${html}</span>`;
  }

  const hiddenVal = (v) => `<span class="hidden-val">${icon('eye-off')} ${esc(v || 'ซ่อนไว้')}</span>`;

  function detailPanel(d) {
    const it = d.item;
    const showContact = d.access === 'finder' || d.access === 'unlocked';
    const f = d.finder;
    return `<div class="panel">
      <div class="row between">${UF.badge(it.status)}<span class="small muted">${icon('clock')} ${esc(UF.fmtDateTime(it.foundAt))}</span></div>
      <h1 class="mt">${esc(it.title)}</h1>
      <p class="muted">${esc(it.publicDescription || 'คนเก็บได้ไม่ได้ใส่คำอธิบายเพิ่ม')}</p>
      <dl class="facts">
        <dt>${icon('pin')} เจอที่</dt><dd>${esc(it.location.name)}</dd>
        <dt>${icon('user')} คนเก็บได้</dt><dd>${showContact ? esc(f.name) : hiddenVal(f.name)}</dd>
        <dt>${icon('chat')} เบอร์โทร</dt><dd>${showContact ? (f.phone ? `<a href="tel:${esc(f.phone)}">${esc(f.phone)}</a>` : '-') : hiddenVal(f.phone)}</dd>
        <dt>${icon('chat')} Line</dt><dd>${showContact ? esc(f.lineId || '-') : hiddenVal(f.lineId)}</dd>
        <dt>${icon('box')} จุดนัดรับ</dt><dd>${d.access !== 'locked' ? esc(it.meetingPoint) : hiddenVal('บอกหลังยืนยันผ่าน')}</dd>
      </dl>
    </div>`;
  }

  function ownerPanel(d) {
    const qs = d.questions
      .map((q, i) => {
        const correct = q.correct || [];
        const items = q.type === 'text' || !q.options || !q.options.length
          ? correct.map((k) => `<span class="kw">${esc(k)}</span>`).join('')
          : q.options.map((o) => `<span class="kw ${correct.includes(o) ? 'kw-ok' : ''}">${correct.includes(o) ? icon('check') : ''}${esc(o)}</span>`).join('');
        return `<li class="mt"><strong>${i + 1}. ${esc(q.question)}</strong><br>${items}</li>`;
      })
      .join('');
    const claims = (d.approvedClaims || [])
      .map(
        (c) => `<div class="q-block row between">
          <div><strong>${esc(c.claimantName)}</strong> ${UF.badge(c.status, UF.CLAIM_STATUS)}</div>
          <div class="row">
            <button class="btn btn-sm" data-chat="${Number(c.id)}" data-done="${c.status === 'completed' ? 1 : 0}">${icon('chat')} แชต</button>
            ${c.status === 'approved' ? `<button class="btn btn-sm btn-mint" data-complete="${Number(c.id)}">${icon('check')} คืนของแล้ว</button>` : ''}
          </div></div>`
      )
      .join('');
    return `<div class="panel">
      <div class="panel-title">${icon(d.access === 'admin' ? 'shield' : 'hand', 'i-lg')}<h3>${d.access === 'admin' ? 'มุมมองแอดมิน' : 'โพสต์นี้เธอเป็นคนเก็บได้'}</h3></div>
      <p class="small muted">ข้อมูลลับกับคำตอบที่ถูก (สีเขียว) มีแค่เธอกับแอดมินที่เห็น</p>
      <div class="secret-box"><strong>ข้อมูลลับ:</strong> ${esc(d.secretDetail || '-')}</div>
      <ul class="small">${qs}</ul>
      ${d.item.status === 'pending_claim' && !claims ? `<div class="note match mt">${icon('bell')}<div>มีคนส่งคำตอบมารอเธอตรวจ <a href="/dashboard.html#review">ไปตรวจคำตอบ</a></div></div>` : ''}
      ${claims ? `<h4 class="mt">คนที่ยืนยันผ่านแล้ว</h4>${claims}` : ''}
      ${d.access === 'finder' && d.item.status === 'available' ? `<button class="btn btn-sm btn-danger mt" id="delete-btn">${icon('trash')} ลบโพสต์นี้</button>` : ''}
    </div>`;
  }

  function shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function questionHtml(q, i) {
    const qid = Number(q.id);
    if (q.type === 'text' || !q.options || !q.options.length) {
      return `<div class="choice-q"><label class="q-label" for="ans-${qid}">${i + 1}. ${esc(q.question)}</label>
        <input type="text" id="ans-${qid}" data-qid="${qid}" data-kind="text" maxlength="300" autocomplete="off"></div>`;
    }
    const multi = q.type === 'multi';
    return `<fieldset class="choice-q" data-qid="${qid}" data-kind="${multi ? 'multi' : 'single'}">
      <legend class="q-label">${i + 1}. ${esc(q.question)}</legend>
      <p class="q-sub">${multi ? 'เลือกให้ครบทุกตัวที่ใช่ ขาดหรือเกินถือว่าผิด' : 'เลือก 1 ตัว'}</p>
      <div class="chips">${shuffle(q.options)
        .map((o) => `<label class="chip"><input type="${multi ? 'checkbox' : 'radio'}" name="q-${qid}" value="${esc(o)}"><span>${esc(o)}</span></label>`)
        .join('')}</div>
    </fieldset>`;
  }

  function quizForm(d, myLost) {
    const lostOptions = myLost.map((l) => `<option value="${Number(l.id)}">${esc(l.title)}</option>`).join('');
    return `<form class="panel hidden" id="quiz" novalidate>
      <div class="panel-title">${icon('lock', 'i-lg')}<h3>ตอบคำถามลับ</h3></div>
      <p class="small muted">แตะเลือกตามของจริง ระบบจะไม่บอกว่าข้อไหนผิด กันคนมั่วเดา ตอบผิดได้ไม่เกิน 3 ครั้ง</p>
      ${myLost.length ? `<div class="field"><label for="lost-link">นี่คือของที่เธอแจ้งหายอันไหน</label>
        <select id="lost-link"><option value="">ไม่ระบุ</option>${lostOptions}</select></div>` : ''}
      ${d.questions.map(questionHtml).join('')}
      <div class="note danger hidden" id="quiz-error" role="alert"></div>
      <button class="btn btn-grape btn-block mt" type="submit" id="quiz-submit">ส่งคำตอบ</button>
    </form>`;
  }

  function claimantPanel(d) {
    const c = d.claim;
    if (d.item.status === 'returned' && c.status === 'none') {
      return `<div class="note success">${icon('check')}<div><strong>ของชิ้นนี้คืนเจ้าของไปแล้ว</strong></div></div>`;
    }
    if (c.status === 'pending_review') {
      return `<div class="note match">${icon('clock')}<div><strong>ส่งคำตอบแล้ว รอคนเก็บได้ตรวจ</strong>
        <div class="small">ผลออกเมื่อไหร่ระบบจะเด้งแจ้งเตือน</div></div></div>`;
    }
    if (c.status === 'locked') {
      return `<div class="note danger">${icon('lock')}<div><strong>รายการนี้ล็อกไว้ก่อน เพราะตอบผิดครบ 3 ครั้ง</strong>
        <div class="small">${c.permanentLock
          ? 'ถ้าเป็นของเธอจริง ไปติดต่อแอดมินที่ One Stop Service พร้อมบัตรนักศึกษา'
          : `ลองใหม่ได้หลัง ${esc(UF.fmtDateTime(c.lockedUntil))} แอดมินได้รับแจ้งแล้ว`}</div></div></div>`;
    }
    return `<div class="panel lilac">
      <h3>ของเธอรึเปล่า?</h3>
      <p class="small">รูปชัด ๆ ชื่อ และช่องทางติดต่อคนเก็บได้ยังซ่อนอยู่ แตะตอบคำถามลับ ${d.questions.length} ข้อให้ผ่านก่อน</p>
      <p class="small">โอกาสที่เหลือ ${attempts(c.attemptsLeft, c.attempts + c.attemptsLeft)} <strong>${Number(c.attemptsLeft)} ครั้ง</strong></p>
      ${d.item.status === 'pending_claim' ? '<p class="small muted">มีอีกคนกำลังขอรับของชิ้นนี้อยู่</p>' : ''}
      <button class="btn btn-butter btn-block" id="start-quiz" type="button">${icon('unlock')} ยืนยันว่าเป็นของฉัน</button>
    </div>`;
  }

  function unlockedPanel(d) {
    const done = d.claim.status === 'completed';
    return `<div class="note success">${icon(done ? 'check' : 'unlock')}<div>
      <strong>${done ? 'รับของคืนเรียบร้อย' : 'ยืนยันผ่านแล้ว'}</strong>
      <div class="small">${done ? 'ดีใจด้วยนะ' : 'ทักคนเก็บได้ในแชตด้านล่างเพื่อนัดรับ ไปรับของอย่าลืมพกบัตรนักศึกษา'}</div>
    </div></div>`;
  }

  function mountChat(claimId, readOnly) {
    const section = document.getElementById('chat-section');
    if (stopChat) stopChat();
    section.innerHTML = '<div class="section-head"><h2>แชตนัดรับของ</h2></div><div id="chat-box"></div>';
    stopChat = UF.mountChat(document.getElementById('chat-box'), claimId, { readOnly });
  }

  /** ฉาก "แมตช์แล้ว!" หลังยืนยันผ่าน */
  function showItsAMatch(d) {
    const el = document.createElement('div');
    el.className = 'its-match';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'ยืนยันผ่านแล้ว');
    const mine = Array.from((UF.me && UF.me.firstName) || 'ฉ')[0];
    const theirs = Array.from(String(d.finder.name || 'ค'))[0];
    el.innerHTML = `<div class="box">
      <h2>แมตช์แล้ว!</h2>
      <p>${esc(d.item.title)} น่าจะเป็นของเธอจริง ๆ ตอนนี้เห็นช่องทางติดต่อ ${esc(d.finder.name)} แล้ว</p>
      <div class="pair"><span>${esc(mine)}</span><span>${esc(theirs)}</span></div>
      <div class="actions">
        <button class="btn btn-butter btn-lg" type="button" data-act="chat">${icon('chat')} ทักไปนัดรับของ</button>
        <button class="btn btn-plain" type="button" data-act="close">ไว้ก่อน</button>
      </div></div>`;
    document.body.appendChild(el);
    const close = () => el.remove();
    el.querySelector('[data-act="close"]').addEventListener('click', close);
    el.querySelector('[data-act="chat"]').addEventListener('click', () => {
      close();
      const chat = document.getElementById('chat-section');
      if (chat) {
        chat.scrollIntoView({ behavior: 'smooth' });
        const input = chat.querySelector('input');
        if (input) setTimeout(() => input.focus(), 400);
      }
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
    el.querySelector('[data-act="chat"]').focus();
  }

  async function render() {
    const d = await UF.api.get(`/found/${id}`);
    document.title = `${d.item.title} - UniFind DPU`;
    const isOwnerView = d.access === 'finder' || d.access === 'admin';

    banner.innerHTML =
      d.match && !isOwnerView && d.access === 'locked'
        ? `<div class="note match">${icon('sparkle')}<div><strong>ตรงกับ "${esc(d.match.lostTitle)}" ของเธอ ${Number(d.match.score)}%</strong></div></div>`
        : '';

    let actionHtml;
    if (isOwnerView) actionHtml = ownerPanel(d);
    else if (d.access === 'unlocked') actionHtml = unlockedPanel(d);
    else actionHtml = claimantPanel(d);

    let myLost = [];
    if (d.access === 'locked' && ['none', 'in_progress'].includes(d.claim.status)) {
      try {
        myLost = (await UF.api.get('/lost/mine')).items.filter((l) => ['searching', 'matched'].includes(l.status));
      } catch (_e) { myLost = []; }
    }

    page.innerHTML = `<div class="detail mt">
        <div>${UF.thumb(d.item, { locked: d.item.imageLocked })}
          ${d.item.imageLocked ? '<p class="small muted center mt">รูปถูกเบลอและใส่ลายน้ำจากเซิร์ฟเวอร์ กันคนเห็นรูปแล้วมาสวมรอย</p>' : ''}</div>
        <div class="stack">${detailPanel(d)}${actionHtml}${d.access === 'locked' ? quizForm(d, myLost) : ''}</div>
      </div>
      <div id="chat-section"></div>`;

    const start = document.getElementById('start-quiz');
    if (start) {
      const openQuiz = () => {
        const quiz = document.getElementById('quiz');
        quiz.classList.remove('hidden');
        start.closest('.panel').classList.add('hidden');
        const sel = document.getElementById('lost-link');
        const pre = lostParam || (d.match && d.match.lostItemId);
        if (sel && pre && sel.querySelector(`option[value="${Number(pre)}"]`)) sel.value = String(pre);
        quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const first = quiz.querySelector('.choice-q input');
        if (first) first.focus({ preventScroll: true });
      };
      start.addEventListener('click', openQuiz);
      document.getElementById('quiz').addEventListener('submit', submitQuiz);
      if (autoQuiz) openQuiz();
    }

    if (d.access === 'unlocked') mountChat(d.chatClaimId, d.claim.status === 'completed');

    page.querySelectorAll('[data-chat]').forEach((b) =>
      b.addEventListener('click', () => mountChat(Number(b.dataset.chat), d.access === 'admin' || b.dataset.done === '1'))
    );
    page.querySelectorAll('[data-complete]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!window.confirm('ยืนยันว่าคืนของให้เจ้าของแล้ว?')) return;
        try {
          const r = await UF.api.post(`/claims/${Number(b.dataset.complete)}/complete`);
          UF.toast(r.message, 'success');
          render();
        } catch (err) { UF.toast(err.message, 'error'); }
      })
    );
    const del = document.getElementById('delete-btn');
    if (del) {
      del.addEventListener('click', async () => {
        if (!window.confirm('ลบโพสต์นี้เลยไหม?')) return;
        try {
          await UF.api.del(`/found/${id}`);
          UF.toast('ลบโพสต์แล้ว', 'success');
          location.href = '/dashboard.html';
        } catch (err) { UF.toast(err.message, 'error'); }
      });
    }
    return d;
  }

  async function submitQuiz(e) {
    e.preventDefault();
    const quiz = e.currentTarget;
    const errBox = document.getElementById('quiz-error');
    const btn = document.getElementById('quiz-submit');
    errBox.classList.add('hidden');
    const answers = [];
    quiz.querySelectorAll('[data-kind]').forEach((el) => {
      const questionId = Number(el.dataset.qid);
      if (el.dataset.kind === 'text') {
        answers.push({ questionId, answer: el.value.trim() });
      } else {
        const picked = [...el.querySelectorAll('input:checked')].map((x) => x.value);
        answers.push({ questionId, answer: picked });
      }
    });
    if (answers.some((a) => (Array.isArray(a.answer) ? !a.answer.length : !a.answer))) {
      errBox.textContent = 'ตอบให้ครบทุกข้อก่อนนะ';
      errBox.classList.remove('hidden');
      return;
    }
    const sel = document.getElementById('lost-link');
    const body = { answers };
    if (sel && sel.value) body.lostItemId = Number(sel.value);
    UF.setBusy(btn, true, 'กำลังเช็กคำตอบ...');
    try {
      const r = await UF.api.post(`/claims/found/${id}/answers`, body);
      if (r.status === 'in_progress') {
        errBox.textContent = r.message;
        errBox.classList.remove('hidden');
        UF.setBusy(btn, false);
        return;
      }
      const d = await render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (r.status === 'approved') showItsAMatch(d);
      else UF.toast(r.message, r.status === 'locked' ? 'error' : 'success');
    } catch (err) {
      if (err.status === 423 || err.status === 409) {
        UF.toast(err.message, 'error');
        await render();
        return;
      }
      errBox.textContent = err.message;
      errBox.classList.remove('hidden');
      UF.setBusy(btn, false);
    }
  }

  (async function init() {
    if (!(await UF.requireAuth())) return;
    if (!Number.isInteger(id) || id < 1) {
      page.innerHTML = UF.empty('search', 'ไม่เจอรายการนี้', 'ลิงก์อาจผิด ลองกลับไปหน้าแรก');
      return;
    }
    try {
      await render();
    } catch (err) {
      page.innerHTML = UF.empty('info', 'เปิดรายการนี้ไม่ได้', err.message);
    }
  })();
})();
