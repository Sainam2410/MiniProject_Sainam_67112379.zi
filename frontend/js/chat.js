/* กล่องข้อความนัดรับคืน (polling ทุก 5 วินาที) */
(function () {
  'use strict';

  /**
   * @param {HTMLElement} container
   * @param {number} claimId
   * @param {{readOnly?: boolean}} opts
   */
  UF.mountChat = function (container, claimId, opts) {
    const o = opts || {};
    container.innerHTML = `<div class="chat">
      <div class="chat-log" aria-live="polite"></div>
      ${o.readOnly ? '<div class="chat-form small muted">ดูได้อย่างเดียว</div>' : `<form class="chat-form">
        <label class="hidden" for="chat-input-${claimId}">ข้อความ</label>
        <input id="chat-input-${claimId}" type="text" maxlength="1000" placeholder="เช่น ว่างไปรับตอนเที่ยงไหม" autocomplete="off">
        <button class="round sm" type="submit" aria-label="ส่งข้อความ">${UF.icon('send')}</button></form>`}
    </div>`;
    const log = container.querySelector('.chat-log');
    const form = container.querySelector('form');
    let lastId = 0;
    let timer = null;

    function append(m) {
      const div = document.createElement('div');
      div.className = `msg ${m.mine ? 'mine' : ''}`;
      const body = document.createElement('div');
      body.textContent = m.body; // textContent = ปลอดภัยจาก XSS
      const time = document.createElement('time');
      time.textContent = `${m.mine ? 'เธอ' : m.senderName}, ${UF.timeAgo(m.createdAt)}`;
      div.append(body, time);
      log.appendChild(div);
    }

    async function poll() {
      try {
        const data = await UF.api.get(`/claims/${claimId}/messages?after=${lastId}`);
        if (data.messages.length) {
          if (!lastId) log.innerHTML = '';
          data.messages.forEach(append);
          lastId = data.messages[data.messages.length - 1].id;
          log.scrollTop = log.scrollHeight;
        } else if (!lastId && !log.childElementCount) {
          log.innerHTML = UF.empty('chat', 'ยังไม่มีข้อความ', 'ทักไปนัดเวลากับจุดรับของได้เลย');
        }
      } catch (err) {
        if (err.status === 403 || err.status === 404) clearInterval(timer);
      }
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        input.disabled = true;
        try {
          await UF.api.post(`/claims/${claimId}/messages`, { body: text });
          input.value = '';
          if (!lastId) log.innerHTML = '';
          await poll();
        } catch (err) {
          UF.toast(err.message, 'error');
        } finally {
          input.disabled = false;
          input.focus();
        }
      });
    }

    poll();
    timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  };
})();
