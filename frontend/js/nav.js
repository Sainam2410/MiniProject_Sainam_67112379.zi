/* แถบบน (เดสก์ท็อป) + แถบล่างแบบแอป (มือถือ) + กระดิ่งแจ้งเตือน */
(function () {
  'use strict';
  const { esc, icon } = UF;

  function current(href) {
    const p = location.pathname === '/' ? '/index.html' : location.pathname;
    return p === href ? ' aria-current="page"' : '';
  }

  function render(me) {
    const header = document.getElementById('site-header');
    if (!header) return;
    header.className = 'topbar';
    const adminLink = me && me.role === 'admin' ? `<a href="/admin.html"${current('/admin.html')}>แอดมิน</a>` : '';
    const actions = me
      ? `<div class="notif-wrap">
           <button class="icon-btn" id="bell" type="button" aria-label="การแจ้งเตือน" aria-expanded="false">${icon('bell')}<span class="dot-count hidden" id="bell-count"></span></button>
           <div class="notif-panel hidden" id="notif-panel"></div>
         </div>
         <a class="avatar" href="/dashboard.html" title="ของฉัน">${esc(Array.from(me.firstName || 'U')[0])}</a>
         <button class="icon-btn desk-only" id="logout-btn" type="button" aria-label="ออกจากระบบ" title="ออกจากระบบ">${icon('logout')}</button>`
      : `<a class="btn btn-sm desk-only" href="/login.html">เข้าสู่ระบบ</a>
         <a class="btn btn-sm btn-grape" href="/register.html">สมัคร</a>`;

    header.innerHTML = `<div class="topbar-inner">
      <a class="logo" href="/"><img src="/assets/logo.svg" alt="">unifind<span class="tag-dpu">DPU</span></a>
      <nav class="topnav" aria-label="เมนูหลัก">
        <a href="/match.html"${current('/match.html')}>ปัดหาของ</a>
        <a href="/report-lost.html"${current('/report-lost.html')}>แจ้งของหาย</a>
        <a href="/report-found.html"${current('/report-found.html')}>เจอของคนอื่น</a>
        ${me ? `<a href="/dashboard.html"${current('/dashboard.html')}>ของฉัน</a>` : ''}
        ${adminLink}
      </nav>
      <div class="top-actions">${actions}</div>
    </div>`;

    const tab = document.createElement('nav');
    tab.className = 'tabbar';
    tab.setAttribute('aria-label', 'เมนูด่วน');
    tab.innerHTML = `
      <a href="/"${current('/index.html')}>${icon('home')}หน้าแรก</a>
      <a href="/report-lost.html"${current('/report-lost.html')}>${icon('search')}แจ้งหาย</a>
      <a href="/match.html" class="tab-match"${current('/match.html')}><span class="bubble">${icon('cards')}</span>ปัดหา</a>
      <a href="/report-found.html"${current('/report-found.html')}>${icon('hand')}เจอของ</a>
      <a href="${me ? (me.role === 'admin' ? '/admin.html' : '/dashboard.html') : '/login.html'}"${current(me && me.role === 'admin' ? '/admin.html' : '/dashboard.html')}>${icon('user')}${me ? 'ของฉัน' : 'เข้าระบบ'}</a>`;
    document.body.appendChild(tab);

    const footer = document.getElementById('site-footer');
    if (footer) {
      footer.className = 'footer';
      footer.innerHTML = `<div class="inner"><span>UniFind DPU โปรเจกต์วิชา CE306 มหาวิทยาลัยธุรกิจบัณฑิตย์</span>
        <span>ของหายแล้วหาไม่เจอจริง ๆ ติดต่อ One Stop Service ได้นะ</span></div>`;
    }

    if (me) {
      document.getElementById('logout-btn').addEventListener('click', logout);
      setupBell();
    }
  }

  async function logout() {
    try { await UF.api.post('/auth/logout'); } catch (_e) { /* ignore */ }
    location.href = '/login.html';
  }
  UF.logout = logout;

  async function loadNotifications() {
    const data = await UF.api.get('/notifications');
    const count = document.getElementById('bell-count');
    if (data.unread > 0) {
      count.textContent = data.unread > 99 ? '99+' : String(data.unread);
      count.classList.remove('hidden');
    } else {
      count.classList.add('hidden');
    }
    return data;
  }

  function setupBell() {
    const bell = document.getElementById('bell');
    const panel = document.getElementById('notif-panel');
    loadNotifications().catch(() => {});
    setInterval(() => loadNotifications().catch(() => {}), 60000);

    bell.addEventListener('click', async (e) => {
      e.stopPropagation();
      const open = panel.classList.toggle('hidden') === false;
      bell.setAttribute('aria-expanded', String(open));
      if (!open) return;
      panel.innerHTML = '<div class="spinner"></div>';
      try {
        const data = await loadNotifications();
        panel.innerHTML = data.notifications.length
          ? `<div class="notif-head"><strong>แจ้งเตือน</strong>
               <button class="btn-plain btn btn-sm" id="read-all" type="button">อ่านหมดแล้ว</button></div>` +
            data.notifications
              .map(
                (n) => `<a class="notif-item ${n.isRead ? '' : 'unread'}" href="${esc(n.link || '#')}" data-id="${Number(n.id)}">
                  ${esc(n.message)}<time>${esc(UF.timeAgo(n.createdAt))}</time></a>`
              )
              .join('')
          : UF.empty('bell', 'ยังเงียบอยู่', 'มีอะไรใหม่เดี๋ยวเด้งบอกตรงนี้');
        const readAll = document.getElementById('read-all');
        if (readAll) {
          readAll.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await UF.api.post('/notifications/read');
            panel.querySelectorAll('.unread').forEach((x) => x.classList.remove('unread'));
            loadNotifications().catch(() => {});
          });
        }
        panel.querySelectorAll('.notif-item').forEach((a) => {
          a.addEventListener('click', () => {
            UF.api.post('/notifications/read', { id: Number(a.dataset.id) }).catch(() => {});
          });
        });
      } catch (err) {
        panel.innerHTML = UF.empty('info', 'โหลดไม่ได้', err.message);
      }
    });
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target)) panel.classList.add('hidden');
    });
  }

  UF.ready = UF.loadMe().then((me) => {
    render(me);
    return me;
  });
})();
