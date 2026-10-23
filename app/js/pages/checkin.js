import { signOut } from '../auth.js';
import { QUESTIONS, REQUIRED, weekStart, fetchCheckins, saveCheckin } from '../lib/checkin.js';

export async function renderCheckin(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando...</div>`;
  const clientId = session.user.id;
  const history = await fetchCheckins(clientId, 1);
  const current = history[0]?.week_start === weekStart() ? history[0] : null;
  const ans = { ...(current?.respostas || {}) };

  function render() {
    root.innerHTML = `<div class="ck-wrap">
      <div class="hero">
        <div class="brand-name font-display">Taranttine</div>
        <div class="brand-sub">Personal</div>
        <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">✅ Check-in da semana</h1>
      </div>
      <div class="top-bar">
        <button class="logout-link" id="nav-back">← Voltar</button>
        <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
      </div>
      <div class="main">
        <div class="ex-card"><div style="font-size:13px;color:var(--muted);line-height:1.5;">
          Leva 1 minuto. Responda com sinceridade: é isso que me mostra o que ajustar no seu plano.
          ${current ? '<br><br>Você já respondeu nesta semana. Pode corrigir e enviar de novo.' : ''}
        </div></div>
        ${QUESTIONS.map(q => `
          <div class="ex-card ck-q">
            <div class="ex-name ck-label">${esc(q.label)}</div>
            ${q.type === 'scale' || q.type === 'choice' ? `<div class="ck-opts">${q.options.map((o, i) => {
              const val = q.type === 'scale' ? String(i + 1) : o;
              return `<button class="ck-opt ${String(ans[q.key]) === val ? 'sel' : ''}" data-q="${q.key}" data-v="${esc(val)}">${esc(o)}</button>`;
            }).join('')}</div>` : ''}
            ${q.type === 'number' ? `<input class="nf-input" type="number" step="0.1" inputmode="decimal" data-in="${q.key}" value="${esc(ans[q.key] ?? '')}" placeholder="${esc(q.placeholder || '')}">` : ''}
            ${q.type === 'text' ? `<textarea class="nf-input" rows="2" data-in="${q.key}">${esc(ans[q.key] ?? '')}</textarea>` : ''}
          </div>`).join('')}
        <button class="send-btn" id="ck-send">Enviar check-in</button>
        <div class="login-message" id="ck-msg"></div>
      </div>
    </div>`;
  }

  render();
  // Ouvinte preso ao conteúdo desta página (e não ao #app-root, que é
  // reaproveitado por todas as telas), para não acumular entre visitas.
  root.querySelector('.ck-wrap').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'nav-back') { window.location.hash = '/nutricao'; return; }
    if (b.id === 'logout-btn') { signOut(); return; }
    if (b.dataset.q) {
      ans[b.dataset.q] = b.dataset.v;
      b.parentElement.querySelectorAll('.ck-opt').forEach(x => x.classList.toggle('sel', x === b));
      return;
    }
    if (b.id === 'ck-send') {
      root.querySelectorAll('[data-in]').forEach(el => { ans[el.dataset.in] = el.value.trim(); });
      const msg = document.getElementById('ck-msg');
      const missing = REQUIRED.filter(k => ans[k] == null || ans[k] === '');
      if (missing.length) { msg.textContent = 'Responda todas as perguntas (peso e mensagens são opcionais).'; return; }
      b.disabled = true; b.textContent = 'Enviando...';
      try {
        await saveCheckin(clientId, ans);
        msg.textContent = '✅ Check-in enviado! Obrigado.';
        b.textContent = 'Enviado';
        setTimeout(() => { window.location.hash = '/nutricao'; }, 1200);
      } catch (err) {
        console.error('saveCheckin failed', err);
        msg.textContent = 'Não consegui enviar. Confira a internet e tente de novo.';
        b.disabled = false; b.textContent = 'Enviar check-in';
      }
    }
  });
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
