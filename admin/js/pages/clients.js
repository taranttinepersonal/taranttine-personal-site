import { supabase } from '../../../app/js/supabaseClient.js';

export async function renderClients(main) {
  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Clientes</div></div>
    <div id="clients-list" class="admin-empty">Carregando...</div>
  `;

  const { data: clients, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, active')
    .eq('role', 'client')
    .order('full_name');

  const list = document.getElementById('clients-list');

  if (error) {
    list.textContent = 'Erro ao carregar clientes.';
    list.classList.add('error');
    console.error(error);
    return;
  }

  if (!clients.length) {
    list.innerHTML = `<div class="admin-empty">Nenhum cliente cadastrado ainda.<br>Peça para eu criar o acesso de um cliente novo.</div>`;
    return;
  }

  list.className = '';
  list.innerHTML = `<div class="admin-card">
    ${clients.map(c => `
      <div class="admin-row">
        <div>
          <div class="admin-row-name">${escapeHtml(c.full_name)}</div>
          <div class="admin-row-sub">${escapeHtml(c.phone || 'sem telefone cadastrado')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="admin-badge ${c.active ? 'active' : 'inactive'}">${c.active ? 'Ativo' : 'Inativo'}</span>
          <a class="admin-btn" href="#/cliente/${c.id}/treino">Treino</a>
          <a class="admin-btn" href="#/cliente/${c.id}/dieta">Dieta</a>
          <button class="admin-btn ${c.active ? 'danger' : ''}" data-toggle-active="${c.id}" data-active="${c.active}">
            ${c.active ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </div>
    `).join('')}
  </div>`;

  list.querySelectorAll('[data-toggle-active]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.toggleActive;
      const nowActive = btn.dataset.active !== 'true';
      btn.disabled = true;
      const { error } = await supabase.from('profiles').update({ active: nowActive }).eq('id', id);
      if (error) {
        console.error(error);
        btn.disabled = false;
        return;
      }
      renderClients(main);
    });
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
