(function () {
  'use strict';
  const { esc, icon } = UF;
  const form = document.getElementById('lost-form');
  const errorBox = document.getElementById('error');
  const btn = document.getElementById('submit');
  const result = document.getElementById('result');

  function showResult(res, title) {
    const best = res.matches[0];
    form.classList.add('hidden');
    result.innerHTML = best
      ? `<div class="panel butter center">
          ${icon('sparkle', 'i-lg')}
          <h2 class="mt">เจอ ${res.matches.length} ใบที่อาจเป็น "${esc(title)}"</h2>
          <p>ใบที่ใกล้สุดตรงกัน ${Number(best.score)}% ไปปัดดูทีละใบได้เลย</p>
          <a class="btn btn-ink btn-lg" href="/match.html?lost=${Number(res.id)}">${icon('cards')} เริ่มปัด</a>
        </div>`
      : `<div class="panel center">
          ${icon('bell', 'i-lg')}
          <h2 class="mt">บันทึกแล้ว ตอนนี้ยังไม่มีใบที่ใกล้เคียง</h2>
          <p class="muted">พอมีคนแจ้งเจอของที่คล้าย "${esc(title)}" ระบบจะเด้งแจ้งเตือนทันที</p>
          <div class="row center-row"><a class="btn" href="/dashboard.html">ไปหน้าของฉัน</a>
          <a class="btn btn-plain" href="/report-lost.html">แจ้งอีกชิ้น</a></div>
        </div>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    const body = {
      title: form.title.value.trim(),
      category: form.querySelector('input[name="category"]:checked').value,
      locationId: Number(form.locationId.value),
      lostAt: form.lostAt.value,
      description: form.description.value.trim(),
      privateNote: form.privateNote.value.trim(),
    };
    if (body.title.length < 2 || !body.locationId || !body.lostAt) {
      errorBox.textContent = 'ใส่ชื่อของ สถานที่ และเวลาก่อนนะ';
      errorBox.classList.remove('hidden');
      return;
    }
    UF.setBusy(btn, true, 'กำลังหาให้...');
    try {
      const res = await UF.api.post('/lost', body);
      showResult(res, body.title);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    } finally {
      UF.setBusy(btn, false);
    }
  });

  (async function init() {
    if (!(await UF.requireAuth())) return;
    UF.categoryChips(document.getElementById('category-chips'), 'category');
    await UF.fillLocations(form.locationId, 'เลือกสถานที่ใน DPU');
    form.lostAt.max = UF.nowLocal();
    form.lostAt.value = UF.nowLocal();
  })();
})();
