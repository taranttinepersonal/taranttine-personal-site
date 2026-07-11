import { supabase } from '../../../app/js/supabaseClient.js';

export async function renderClientData(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, phone, email, birth_date, show_cycle_mode')
    .eq('id', clientId)
    .single();

  if (error) {
    main.innerHTML = `<div class="admin-empty">Erro ao carregar cliente.</div>`;
    return;
  }

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile.full_name)} · Dados Básicos</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>

    <div class="admin-card admin-form">
      <label>Nome completo</label>
      <input type="text" id="data-name" value="${escapeHtml(profile.full_name || '')}">
      <label>Telefone</label>
      <input type="text" id="data-phone" value="${escapeHtml(profile.phone || '')}" placeholder="Ex: 67999999999">
      <label>Data de nascimento</label>
      <input type="date" id="data-birth" value="${profile.birth_date || ''}">
      <label>E-mail de login</label>
      <input type="text" value="${escapeHtml(profile.email || 'não informado')}" disabled style="opacity:.6;">
      <div class="admin-row-sub" style="margin-top:4px;">
        Pra trocar o e-mail de login (o que o cliente usa pra entrar), peça ao desenvolvedor — mudar aqui não afeta o login.
      </div>
      <label style="margin-top:12px;display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="data-cycle" ${profile.show_cycle_mode ? 'checked' : ''} style="width:auto;">
        🌸 Mostrar Modo Ciclo na ficha de treino
      </label>
      <button class="admin-btn primary" id="data-save" style="margin-top:12px;">Salvar</button>
      <div class="admin-msg" id="data-msg"></div>
    </div>
  `;

  document.getElementById('data-save').addEventListener('click', async () => {
    const msg = document.getElementById('data-msg');
    const payload = {
      full_name: document.getElementById('data-name').value.trim(),
      phone: document.getElementById('data-phone').value.trim() || null,
      birth_date: document.getElementById('data-birth').value || null,
      show_cycle_mode: document.getElementById('data-cycle').checked,
    };
    const { error: saveError } = await supabase.from('profiles').update(payload).eq('id', clientId);
    msg.textContent = saveError ? 'Erro ao salvar: ' + saveError.message : 'Salvo.';
    msg.classList.toggle('error', !!saveError);
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
