(function () {
  'use strict';
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('error');
  const btn = document.getElementById('submit');

  function nextUrl(role) {
    const n = UF.param('next');
    // ป้องกัน Open Redirect: อนุญาตเฉพาะ path ภายในเว็บไซต์
    if (n && /^\/(?!\/)[A-Za-z0-9_\-./?=&]*$/.test(n)) return n;
    return role === 'admin' ? '/admin.html' : '/dashboard.html';
  }

  UF.ready.then((me) => { if (me) location.replace(nextUrl(me.role)); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      errorBox.textContent = 'กรุณากรอกอีเมลและรหัสผ่าน';
      errorBox.classList.remove('hidden');
      return;
    }
    UF.setBusy(btn, true, 'กำลังเข้า...');
    try {
      const res = await UF.api.post('/auth/login', { email, password });
      UF.toast(res.message, 'success');
      location.href = nextUrl(res.role);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
      form.password.value = '';
    } finally {
      UF.setBusy(btn, false);
    }
  });
})();
