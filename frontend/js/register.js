(function () {
  'use strict';
  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('error');
  const btn = document.getElementById('submit');
  const bar = document.getElementById('pw-bar');

  UF.ready.then((me) => { if (me) location.replace('/dashboard.html'); });

  function strength(pw) {
    let s = 0;
    if (pw.length >= 8) s += 1;
    if (pw.length >= 12) s += 1;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s += 1;
    if (/\d/.test(pw)) s += 1;
    if (/[^A-Za-z0-9]/.test(pw)) s += 1;
    return s;
  }
  form.password.addEventListener('input', () => {
    const s = strength(form.password.value);
    bar.style.width = `${(s / 5) * 100}%`;
    bar.style.background = s <= 2 ? '#e11d48' : s <= 3 ? '#fde047' : '#10b981';
  });

  function validate(d) {
    if (!/^[a-z0-9._%+-]+@([a-z0-9-]+\.)*dpu\.ac\.th$/i.test(d.email)) return 'กรุณาใช้อีเมลมหาวิทยาลัย @dpu.ac.th';
    if (!/^[A-Za-z0-9]{5,12}$/.test(d.studentId)) return 'รหัสนักศึกษา/บุคลากรไม่ถูกต้อง';
    if (!d.firstName.trim() || !d.lastName.trim()) return 'กรุณากรอกชื่อและนามสกุล';
    if (!/^0[689]\d{8}$|^0[2-7]\d{7}$/.test(d.phone)) return 'เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0891234567)';
    if (d.lineId && !/^[A-Za-z0-9._-]{2,40}$/.test(d.lineId)) return 'Line ID ไม่ถูกต้อง';
    const pw = d.password;
    if (!(pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw))) {
      return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัว ประกอบด้วยพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ';
    }
    if (pw !== d.confirmPassword) return 'ยืนยันรหัสผ่านไม่ตรงกัน';
    if (!document.getElementById('consent').checked) return 'กรุณายอมรับเงื่อนไขการใช้ข้อมูลส่วนบุคคล';
    return null;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    const d = {
      studentId: form.studentId.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      firstName: form.firstName.value.trim(),
      lastName: form.lastName.value.trim(),
      phone: form.phone.value.replace(/[\s-]/g, ''),
      lineId: form.lineId.value.trim(),
      password: form.password.value,
      confirmPassword: form.confirmPassword.value,
    };
    const msg = validate(d);
    if (msg) {
      errorBox.textContent = msg;
      errorBox.classList.remove('hidden');
      return;
    }
    UF.setBusy(btn, true, 'กำลังสร้างบัญชี...');
    try {
      const res = await UF.api.post('/auth/register', d);
      UF.toast(res.message, 'success');
      setTimeout(() => { location.href = '/dashboard.html'; }, 700);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
      UF.setBusy(btn, false);
    }
  });
})();
