(function () {
  'use strict';
  const { esc, icon } = UF;
  const form = document.getElementById('found-form');
  const qWrap = document.getElementById('questions');
  const addBtn = document.getElementById('add-q');
  const errorBox = document.getElementById('error');
  const btn = document.getElementById('submit');
  const meter = document.getElementById('guess-meter');
  const fileInput = document.getElementById('image');
  const preview = document.getElementById('preview');
  const MAX_FILE = 5 * 1024 * 1024;
  const MIN_GUESS = 150; // ต้องตรงกับฝั่งเซิร์ฟเวอร์

  const COLORS = ['ดำ', 'น้ำตาล', 'ขาว/ครีม', 'เทา', 'แดง', 'ชมพู', 'ม่วง', 'น้ำเงิน/ฟ้า', 'เขียว', 'ลวดลาย'];
  // คำถามสำเร็จรูปตามหมวด: คนเก็บได้แค่แตะเลือกว่าตัวไหนถูก
  const TEMPLATES = {
    wallet: [
      { type: 'multi', question: 'ในกระเป๋ามีบัตรอะไรบ้าง (เลือกให้ครบทุกใบ)', options: ['บัตรนักศึกษา', 'บัตรประชาชน', 'บัตร ATM/เดบิต', 'บัตรเครดิต', 'ใบขับขี่', 'บัตรรถไฟฟ้า BTS/MRT', 'บัตรสะสมแต้ม', 'ไม่มีบัตร'] },
      { type: 'multi', question: 'ข้างในมีของอะไรอีกบ้าง (เลือกให้ครบ)', options: ['ธนบัตร', 'เหรียญ', 'รูปถ่าย', 'สติกเกอร์', 'ใบเสร็จ', 'นามบัตร', 'กุญแจ', 'ไม่มีอย่างอื่น'] },
      { type: 'single', question: 'ซับในกระเป๋าเป็นสีอะไร', options: COLORS },
    ],
    it: [
      { type: 'single', question: 'ยี่ห้ออะไร', options: ['Apple', 'Samsung', 'Xiaomi', 'OPPO/realme', 'vivo', 'Huawei', 'Sony', 'JBL', 'Lenovo/ASUS/Acer', 'อื่น ๆ'] },
      { type: 'single', question: 'ตัวเครื่องหรือเคสสีอะไร', options: COLORS },
      { type: 'multi', question: 'มีอะไรติดอยู่บนเครื่องหรือเคส (เลือกให้ครบ)', options: ['สติกเกอร์', 'ฟิล์มกันรอย', 'ที่ห้อย/พวงกุญแจ', 'เคสลายการ์ตูน', 'ชื่อเขียนไว้', 'รอยแตก/รอยถลอก', 'ไม่มีอะไรเลย'] },
    ],
    card_doc: [
      { type: 'single', question: 'รหัสบนบัตรขึ้นต้นด้วยเลขอะไร', options: ['63', '64', '65', '66', '67', '68', '69', 'อื่น ๆ'] },
      { type: 'multi', question: 'มีอะไรติดมาด้วย (เลือกให้ครบ)', options: ['สายคล้องคอ', 'ซองใส่บัตร', 'สติกเกอร์', 'ลายเซ็นด้านหลัง', 'บัตรอื่นซ้อนอยู่', 'ไม่มีอะไรเลย'] },
    ],
    key: [
      { type: 'single', question: 'มีกุญแจทั้งหมดกี่ดอก', options: ['1', '2', '3', '4', '5', '6 ขึ้นไป'] },
      { type: 'multi', question: 'บนพวงกุญแจมีอะไรห้อยอยู่ (เลือกให้ครบ)', options: ['ตุ๊กตา', 'ห่วงโลหะเปล่า', 'รีโมต/คีย์การ์ด', 'ป้ายชื่อ', 'ที่เปิดขวด', 'สายคล้อง', 'ไม่มีอะไรห้อย'] },
    ],
    personal: [
      { type: 'single', question: 'สีหลักคือสีอะไร', options: COLORS },
      { type: 'multi', question: 'มีจุดสังเกตอะไรบ้าง (เลือกให้ครบ)', options: ['มีชื่อเขียนไว้', 'สติกเกอร์', 'ลายการ์ตูน', 'รอยขาด/รอยเปื้อน', 'มีที่ห้อย', 'ไม่มีจุดสังเกต'] },
    ],
  };

  /** state: [{ type, question, options: [], correct: Set }] */
  let questions = [];
  let touched = false;

  const fromTemplate = (t) => ({ type: t.type, question: t.question, options: [...t.options], correct: new Set() });

  function guessSpace() {
    return questions.reduce((acc, q) => acc * (q.type === 'multi' ? 2 ** q.options.length - 1 : q.options.length), 1);
  }

  function chanceText(g) {
    const pct = Math.min(1, 3 / Math.max(g, 1)) * 100;
    if (pct < 0.01) return 'คนมั่วมีโอกาสเดาถูกใน 3 ครั้ง น้อยกว่า 0.01%';
    return `คนมั่วมีโอกาสเดาถูกใน 3 ครั้งราว ${pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}%`;
  }

  function updateMeter() {
    const g = guessSpace();
    let level = 'low';
    let text = 'เดาง่ายไป เพิ่มตัวเลือก หรือเปลี่ยนสักข้อเป็นแบบเลือกได้หลายข้อ';
    if (g >= 1000) { level = 'high'; text = 'เดายากมาก กันคนมั่วได้ดี'; } else if (g >= MIN_GUESS) { level = 'mid'; text = 'เดายากพอใช้'; }
    meter.className = `guess-meter ${level}`;
    meter.innerHTML = `${icon('shield')}<span><strong>${esc(text)}</strong>
      <span class="small"> ${esc(chanceText(g))}</span></span>`;
    addBtn.disabled = questions.length >= 3;
  }

  function blockHtml(q, i) {
    const opts = q.options
      .map(
        (o, oi) => `<span class="opt ${q.correct.has(o) ? 'correct' : ''}">
          <button type="button" class="opt-toggle" data-q="${i}" data-o="${oi}" aria-pressed="${q.correct.has(o)}">${q.correct.has(o) ? icon('check') : ''}${esc(o)}</button>
          <button type="button" class="opt-del" data-q="${i}" data-o="${oi}" aria-label="ลบตัวเลือก ${esc(o)}">${icon('x')}</button>
        </span>`
      )
      .join('');
    return `<div class="q-block" data-q="${i}">
      <div class="q-head"><strong>ข้อ ${i + 1}</strong>
        <div class="row">
          <div class="mini-seg" role="group" aria-label="ชนิดคำถามข้อ ${i + 1}">
            <button type="button" data-type="single" data-q="${i}" aria-pressed="${q.type === 'single'}">เลือกข้อเดียว</button>
            <button type="button" data-type="multi" data-q="${i}" aria-pressed="${q.type === 'multi'}">เลือกได้หลายข้อ</button>
          </div>
          ${questions.length > 2 ? `<button type="button" class="btn btn-plain btn-sm q-del" data-q="${i}" aria-label="ลบข้อ ${i + 1}">${icon('trash')}</button>` : ''}
        </div></div>
      <div class="field"><label class="sr-only" for="qt-${i}">คำถามข้อ ${i + 1}</label>
        <input type="text" id="qt-${i}" class="q-text" data-q="${i}" maxlength="200" placeholder="พิมพ์คำถาม"></div>
      <p class="small muted">${q.type === 'multi' ? 'แตะทุกตัวที่ถูก' : 'แตะตัวที่ถูก 1 ตัว'} (เจ้าของจะเห็นตัวเลือกแบบสลับลำดับ)</p>
      <div class="opt-list">${opts}</div>
      <div class="add-opt">
        <label class="sr-only" for="ao-${i}">เพิ่มตัวเลือก</label>
        <input type="text" id="ao-${i}" class="add-opt-input" data-q="${i}" maxlength="60" placeholder="เพิ่มตัวเลือกเอง">
        <button type="button" class="btn btn-sm add-opt-btn" data-q="${i}">${icon('plus')} เพิ่ม</button>
      </div>
    </div>`;
  }

  function render() {
    qWrap.innerHTML = questions.map(blockHtml).join('');
    qWrap.querySelectorAll('.q-text').forEach((inp) => { inp.value = questions[Number(inp.dataset.q)].question; });
    updateMeter();
  }

  function addOption(i) {
    const inp = qWrap.querySelector(`.add-opt-input[data-q="${i}"]`);
    const v = inp.value.trim();
    if (!v) return;
    const q = questions[i];
    if (q.options.some((o) => o.toLowerCase() === v.toLowerCase())) { UF.toast('มีตัวเลือกนี้แล้ว', 'error'); return; }
    if (q.options.length >= 12) { UF.toast('ใส่ได้สูงสุด 12 ตัวเลือก', 'error'); return; }
    q.options.push(v);
    touched = true;
    render();
    qWrap.querySelector(`.add-opt-input[data-q="${i}"]`).focus();
  }

  qWrap.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    const i = Number(t.dataset.q);
    const q = questions[i];
    if (t.classList.contains('opt-toggle')) {
      const o = q.options[Number(t.dataset.o)];
      if (q.type === 'single') q.correct = new Set(q.correct.has(o) ? [] : [o]);
      else if (q.correct.has(o)) q.correct.delete(o); else q.correct.add(o);
    } else if (t.classList.contains('opt-del')) {
      const o = q.options[Number(t.dataset.o)];
      q.options.splice(Number(t.dataset.o), 1);
      q.correct.delete(o);
    } else if (t.dataset.type) {
      q.type = t.dataset.type;
      if (q.type === 'single' && q.correct.size > 1) q.correct = new Set([...q.correct].slice(0, 1));
    } else if (t.classList.contains('q-del')) {
      questions.splice(i, 1);
    } else if (t.classList.contains('add-opt-btn')) {
      addOption(i);
      return;
    } else return;
    touched = true;
    render();
  });
  qWrap.addEventListener('input', (e) => {
    if (e.target.classList.contains('q-text')) { questions[Number(e.target.dataset.q)].question = e.target.value; touched = true; }
  });
  qWrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('add-opt-input')) { e.preventDefault(); addOption(Number(e.target.dataset.q)); }
  });

  addBtn.addEventListener('click', () => {
    if (questions.length >= 3) return;
    questions.push({ type: 'single', question: '', options: [], correct: new Set() });
    touched = true;
    render();
    qWrap.querySelector(`#qt-${questions.length - 1}`).focus();
  });

  function applyTemplate(category) {
    if (touched && !window.confirm('เปลี่ยนหมวดแล้วจะได้ชุดคำถามใหม่ ที่ตั้งไว้จะหาย โอเคไหม?')) return;
    questions = (TEMPLATES[category] || TEMPLATES.personal).map(fromTemplate);
    touched = false;
    render();
  }

  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      UF.toast('รองรับเฉพาะไฟล์ .jpg .png .webp', 'error');
      fileInput.value = '';
      return;
    }
    if (f.size > MAX_FILE) {
      UF.toast('ไฟล์ภาพต้องมีขนาดไม่เกิน 5MB', 'error');
      fileInput.value = '';
      return;
    }
    preview.src = URL.createObjectURL(f);
    preview.classList.remove('hidden');
    document.getElementById('upload-text').textContent = f.name;
  });

  function validateQuestions() {
    if (questions.length < 2) return 'ต้องมีคำถามอย่างน้อย 2 ข้อ';
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (!q.question.trim()) return `ใส่คำถามข้อ ${i + 1} ด้วย`;
      if (q.options.length < 4) return `ข้อ ${i + 1} ต้องมีตัวเลือกอย่างน้อย 4 ตัว`;
      if (!q.correct.size) return `ข้อ ${i + 1} ยังไม่ได้แตะเลือกตัวที่ถูก`;
      if (q.type === 'multi' && q.correct.size === q.options.length) return `ข้อ ${i + 1} ห้ามเลือกถูกทุกตัว`;
    }
    if (guessSpace() < MIN_GUESS) return 'ชุดคำถามนี้เดาง่ายไป เพิ่มตัวเลือก หรือเปลี่ยนสักข้อเป็นแบบเลือกได้หลายข้อ';
    return null;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    const fail = (m) => {
      errorBox.textContent = m;
      errorBox.classList.remove('hidden');
    };
    if (form.title.value.trim().length < 2) return fail('ใส่ชื่อของก่อนนะ');
    if (!form.locationId.value || !form.foundAt.value) return fail('เลือกสถานที่และเวลาที่เจอด้วย');
    if (form.secretDetail.value.trim().length < 5) return fail('ใส่จุดสังเกตลับอย่างน้อย 5 ตัวอักษร');
    if (!form.meetingPoint.value.trim()) return fail('บอกจุดนัดคืนของด้วย');
    const qErr = validateQuestions();
    if (qErr) return fail(qErr);

    const fd = new FormData();
    fd.append('title', form.title.value.trim());
    fd.append('category', form.querySelector('input[name="category"]:checked').value);
    fd.append('locationId', form.locationId.value);
    fd.append('foundAt', form.foundAt.value);
    fd.append('publicDescription', form.publicDescription.value.trim());
    fd.append('secretDetail', form.secretDetail.value.trim());
    fd.append('meetingPoint', form.meetingPoint.value.trim());
    fd.append('autoApprove', document.getElementById('autoApprove').checked ? '1' : '0');
    fd.append(
      'questions',
      JSON.stringify(questions.map((q) => ({ type: q.type, question: q.question.trim(), options: q.options, correct: [...q.correct] })))
    );
    if (fileInput.files[0]) fd.append('image', fileInput.files[0]);

    UF.setBusy(btn, true, 'กำลังอัปโหลด...');
    try {
      const res = await UF.api.upload('/found', fd);
      form.classList.add('hidden');
      document.querySelectorAll('main > h1, main > p.muted').forEach((x) => x.classList.add('hidden'));
      document.getElementById('done').innerHTML = `<div class="panel butter center">
        ${icon('sparkle', 'i-lg')}
        <h2 class="mt">โพสต์แล้ว ขอบคุณที่ช่วยเพื่อนนะ</h2>
        <p>${res.notifiedOwners > 0
          ? `มีคนแจ้งหายของที่คล้ายกัน ${Number(res.notifiedOwners)} คน ระบบส่งแจ้งเตือนไปให้แล้ว`
          : 'ถ้ามีคนแจ้งหายของที่คล้ายกัน ระบบจะเด้งไปบอกเจ้าของทันที'}</p>
        <div class="row center-row"><a class="btn btn-ink" href="/match-verify.html?id=${Number(res.id)}">ดูโพสต์ของฉัน</a>
        <a class="btn" href="/dashboard.html">ไปหน้าของฉัน</a></div></div>`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      fail(err.message);
    } finally {
      UF.setBusy(btn, false);
    }
    return undefined;
  });

  (async function init() {
    if (!(await UF.requireAuth())) return;
    const chips = document.getElementById('category-chips');
    UF.categoryChips(chips, 'category');
    chips.addEventListener('change', (e) => applyTemplate(e.target.value));
    await UF.fillLocations(form.locationId, 'เลือกสถานที่ใน DPU');
    form.foundAt.max = UF.nowLocal();
    form.foundAt.value = UF.nowLocal();
    applyTemplate('wallet');
  })();
})();
