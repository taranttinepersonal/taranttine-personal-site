import { supabase } from '../../../app/js/supabaseClient.js';

export async function renderClients(main) {
  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Clientes</div></div>
    <div id="clients-list" class="admin-empty">Carregando...</div>
  `;

  const { data: clients, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, active, birth_date')
    .eq('role', 'client')
    .order('full_name');

  const { data: programs } = await supabase
    .from('workout_programs')
    .select('client_id, created_at, last_adjusted_at')
    .eq('is_active', true);

  const programByClient = {};
  (programs || []).forEach(p => { programByClient[p.client_id] = p; });

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

  const birthdaysToday = clients.filter(c => isBirthdayToday(c.birth_date));
  const birthdayBanner = birthdaysToday.length ? `
    <div class="admin-card" style="border-color:var(--green);margin-bottom:16px;">
      🎂 <b>Aniversário hoje:</b> ${birthdaysToday.map(c => escapeHtml(c.full_name)).join(', ')} — que tal mandar uma mensagem no WhatsApp?
    </div>
  ` : '';

  const dueForAdjustment = clients.filter(c => isDueForAdjustment(programByClient[c.id]));
  const adjustmentBanner = dueForAdjustment.length ? `
    <div class="admin-card" style="border-color:#F0A500;margin-bottom:16px;">
      🔁 <b>Hora de reajustar (4+ semanas):</b> ${dueForAdjustment.map(c => escapeHtml(c.full_name)).join(', ')}
    </div>
  ` : '';

  const banner = birthdayBanner + adjustmentBanner;

  list.className = '';
  list.innerHTML = banner + `<div class="admin-card">
    ${clients.map(c => `
      <div class="admin-row">
        <div>
          <div class="admin-row-name">${escapeHtml(c.full_name)}${isBirthdayToday(c.birth_date) ? ' 🎂' : ''}${isDueForAdjustment(programByClient[c.id]) ? ' 🔁' : ''}</div>
          <div class="admin-row-sub">${escapeHtml(c.phone || 'sem telefone cadastrado')}</div>
        </div>
        <div class="admin-row-actions">
          <span class="admin-badge ${c.active ? 'active' : 'inactive'}">${c.active ? 'Ativo' : 'Inativo'}</span>
          <a class="admin-btn" href="#/cliente/${c.id}/dados">Dados</a>
          <a class="admin-btn" href="#/cliente/${c.id}/treino">Treino</a>
          <a class="admin-btn" href="#/cliente/${c.id}/dieta">Dieta</a>
          <a class="admin-btn" href="#/cliente/${c.id}/evolucao">Evolução</a>
          <a class="admin-btn" href="#/cliente/${c.id}/avaliacao">Avaliação</a>
          <a class="admin-btn" href="#/cliente/${c.id}/relatorio">Relatório</a>
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

function isDueForAdjustment(program) {
  if (!program) return false;
  const reference = program.last_adjusted_at || program.created_at;
  if (!reference) return false;
  const days = (Date.now() - new Date(reference).getTime()) / (1000 * 60 * 60 * 24);
  return days >= 28;
}

function isBirthdayToday(birthDate) {
  if (!birthDate) return false;
  const today = new Date();
  const [, month, day] = birthDate.split('-').map(Number);
  return month === today.getMonth() + 1 && day === today.getDate();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
