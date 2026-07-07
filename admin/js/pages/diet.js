import { supabase } from '../../../app/js/supabaseClient.js';

export async function renderDiet(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();
  const { data: diet } = await supabase.from('diet_plans').select('*').eq('client_id', clientId).maybeSingle();

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Dieta</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>

    <div class="admin-card">
      <p style="color:var(--muted);font-size:12px;line-height:1.6;">
        Por padrão, nenhum cliente vê aba de nutrição — isso só aparece pra ele se você
        ativar explicitamente abaixo. Deixe desligado até estar pronto para vender esse serviço.
      </p>
    </div>

    <div class="admin-card admin-form">
      <div class="toggle-row">
        <input type="checkbox" id="diet-visible" ${diet?.is_visible ? 'checked' : ''} style="width:auto;">
        <label style="margin:0;">Mostrar aba de dieta para este cliente</label>
      </div>
      <label>Título</label>
      <input type="text" id="diet-title" value="${escapeHtml(diet?.title || '')}" placeholder="Ex: Plano Alimentar — Fase 1">
      <label>Conteúdo</label>
      <textarea id="diet-content" placeholder="Escreva o plano alimentar aqui...">${escapeHtml(diet?.content_text || '')}</textarea>
      <button class="admin-btn primary" id="diet-save" style="margin-top:12px;">Salvar</button>
      <div class="admin-msg" id="diet-msg"></div>
    </div>
  `;

  document.getElementById('diet-save').addEventListener('click', async () => {
    const msg = document.getElementById('diet-msg');
    const payload = {
      client_id: clientId,
      title: document.getElementById('diet-title').value.trim() || null,
      content_text: document.getElementById('diet-content').value.trim() || null,
      is_visible: document.getElementById('diet-visible').checked,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('diet_plans').upsert(payload, { onConflict: 'client_id' });
    msg.textContent = error ? 'Erro ao salvar: ' + error.message : 'Salvo.';
    msg.classList.toggle('error', !!error);
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
