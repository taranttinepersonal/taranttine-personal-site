import { supabase } from '../../../app/js/supabaseClient.js';

const STATUS_OPTIONS = ['pendente', 'contatado', 'convertido', 'recompensado'];
const STATUS_LABELS = {
  pendente: '⏳ Pendente',
  contatado: '📞 Contatado',
  convertido: '✅ Convertido',
  recompensado: '🎁 Recompensado',
};

export async function renderReferrals(main) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const { data: clients } = await supabase
    .from('profiles').select('id, full_name, referral_code').eq('role', 'client').order('full_name');

  const { data: referrals, error } = await supabase
    .from('referrals')
    .select('id, referrer_id, referred_name, referred_phone, status, notes, created_at')
    .order('created_at', { ascending: false });

  const clientById = Object.fromEntries((clients || []).map(c => [c.id, c]));

  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Indicações</div></div>

    <div class="admin-card admin-form">
      <label>Cliente que indicou</label>
      <select id="ref-referrer">
        ${(clients || []).map(c => `<option value="${c.id}">${escapeHtml(c.full_name)} (${escapeHtml(c.referral_code || '—')})</option>`).join('')}
      </select>
      <label>Nome de quem foi indicado</label>
      <input type="text" id="ref-name" placeholder="Ex: Maria Silva">
      <label>Telefone (opcional)</label>
      <input type="text" id="ref-phone" placeholder="Ex: 67999999999">
      <button class="admin-btn primary" id="ref-add" style="margin-top:12px;">Adicionar indicação</button>
      <div class="admin-msg" id="ref-msg"></div>
    </div>

    <div class="admin-section-title">Todas as indicações</div>
    ${error ? '<div class="admin-empty">Erro ao carregar.</div>' : ''}
    ${referrals && referrals.length ? `
      <div class="admin-card">
        ${referrals.map(r => `
          <div class="admin-row">
            <div>
              <div class="admin-row-name">${escapeHtml(r.referred_name)}</div>
              <div class="admin-row-sub">
                Indicado por: ${escapeHtml(clientById[r.referrer_id]?.full_name || '—')}
                ${r.referred_phone ? ' · ' + escapeHtml(r.referred_phone) : ''}
                · ${new Date(r.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
            <select data-status-for="${r.id}" class="admin-btn">
              ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    ` : `<div class="admin-empty">Nenhuma indicação registrada ainda.</div>`}
  `;

  document.getElementById('ref-add').addEventListener('click', async () => {
    const msg = document.getElementById('ref-msg');
    const referredName = document.getElementById('ref-name').value.trim();
    if (!referredName) {
      msg.textContent = 'Preencha o nome de quem foi indicado.';
      msg.classList.add('error');
      return;
    }
    const { error: insertError } = await supabase.from('referrals').insert({
      referrer_id: document.getElementById('ref-referrer').value,
      referred_name: referredName,
      referred_phone: document.getElementById('ref-phone').value.trim() || null,
    });
    if (insertError) {
      msg.textContent = 'Erro ao adicionar: ' + insertError.message;
      msg.classList.add('error');
      return;
    }
    renderReferrals(main);
  });

  main.querySelectorAll('[data-status-for]').forEach(select => {
    select.addEventListener('change', async () => {
      const id = select.dataset.statusFor;
      select.disabled = true;
      const { error: updateError } = await supabase
        .from('referrals')
        .update({ status: select.value, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateError) console.error('update referral status failed', updateError);
      select.disabled = false;
    });
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
