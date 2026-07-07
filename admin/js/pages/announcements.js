import { supabase } from '../../../app/js/supabaseClient.js';
import { getSession } from '../../../app/js/auth.js';

export async function renderAnnouncements(main) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const { data: clients } = await supabase
    .from('profiles').select('id, full_name').eq('role', 'client').eq('active', true).order('full_name');

  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Avisos</div></div>

    <div class="admin-card admin-form">
      <label>Destinatário</label>
      <select id="ann-target">
        <option value="">Todos os clientes ativos</option>
        ${(clients || []).map(c => `<option value="${c.id}">${escapeHtml(c.full_name)}</option>`).join('')}
      </select>
      <label>Título</label>
      <input type="text" id="ann-title" placeholder="Ex: Ajuste de treino">
      <label>Mensagem</label>
      <textarea id="ann-body" placeholder="Escreva o aviso..."></textarea>
      <button class="admin-btn primary" id="ann-send" style="margin-top:12px;">Enviar aviso</button>
      <div class="admin-msg" id="ann-msg"></div>
    </div>

    <div class="admin-section-title">Últimos avisos</div>
    <div id="ann-list" class="admin-empty">Carregando...</div>
  `;

  document.getElementById('ann-send').addEventListener('click', async () => {
    const msg = document.getElementById('ann-msg');
    const title = document.getElementById('ann-title').value.trim();
    const body = document.getElementById('ann-body').value.trim();
    if (!title || !body) {
      msg.textContent = 'Preencha título e mensagem.';
      msg.classList.add('error');
      return;
    }
    const session = await getSession();
    const target = document.getElementById('ann-target').value || null;
    const { error } = await supabase.from('announcements').insert({
      author_id: session.user.id, title, body, target_client_id: target,
    });
    if (error) {
      msg.textContent = 'Erro ao enviar: ' + error.message;
      msg.classList.add('error');
      return;
    }
    msg.textContent = 'Aviso enviado.';
    msg.classList.remove('error');

    try {
      const pushRes = await fetch('/.netlify/functions/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ title, body, target_client_id: target }),
      });
      if (pushRes.ok) {
        const { sent } = await pushRes.json();
        msg.textContent += ` Notificação push enviada para ${sent} dispositivo(s).`;
      }
    } catch (err) {
      // push is best-effort — the announcement itself was already saved successfully
      console.error('send-push failed', err);
    }
    document.getElementById('ann-title').value = '';
    document.getElementById('ann-body').value = '';
    loadRecent();
  });

  async function loadRecent() {
    const list = document.getElementById('ann-list');
    const { data: recent, error } = await supabase
      .from('announcements')
      .select('id, title, body, target_client_id, sent_at')
      .order('sent_at', { ascending: false })
      .limit(20);
    if (error) { list.textContent = 'Erro ao carregar avisos.'; return; }
    if (!recent.length) { list.innerHTML = '<div class="admin-empty">Nenhum aviso enviado ainda.</div>'; return; }
    const clientNameById = Object.fromEntries((clients || []).map(c => [c.id, c.full_name]));
    list.className = '';
    list.innerHTML = `<div class="admin-card">
      ${recent.map(a => `
        <div class="admin-row">
          <div>
            <div class="admin-row-name">${escapeHtml(a.title)}</div>
            <div class="admin-row-sub">${escapeHtml(a.body)}</div>
            <div class="admin-row-sub" style="margin-top:4px;">
              ${a.target_client_id ? 'Para: ' + escapeHtml(clientNameById[a.target_client_id] || 'cliente') : 'Para: todos'}
              · ${new Date(a.sent_at).toLocaleString('pt-BR')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  loadRecent();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
