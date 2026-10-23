import { supabase } from '../../../app/js/supabaseClient.js';

const STATUS = [['novo', 'Novo'], ['contatado', 'Contatado'], ['convertido', 'Virou cliente'], ['desistiu', 'Desistiu']];

export async function renderWaitlist(main) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;
  const { data, error } = await supabase.from('waitlist').select('*').order('created_at', { ascending: false });
  if (error) {
    main.innerHTML = `<div class="admin-msg error">Não consegui carregar. Confira se o comando do banco 0030 já foi rodado no Supabase.</div>`;
    return;
  }
  const rows = data || [];
  const count = k => rows.filter(r => r.status === k).length;
  const link = `${location.origin}/lista-espera.html`;

  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Lista de espera · junho 2027</div></div>
    <div class="rx-daybar" style="position:static;">
      <div class="rx-day-cell ok"><span>Na lista</span><b>${rows.length}</b><small>inscrições</small></div>
      <div class="rx-day-cell ${count('novo') ? 'faltou' : 'ok'}"><span>Novos</span><b>${count('novo')}</b><small>ainda sem contato</small></div>
      <div class="rx-day-cell"><span>Contatados</span><b>${count('contatado')}</b><small>&nbsp;</small></div>
      <div class="rx-day-cell ok"><span>Viraram cliente</span><b>${count('convertido')}</b><small>&nbsp;</small></div>
    </div>
    <div class="admin-card">
      <div class="admin-row-sub">Link da página (ainda não divulgado em nenhum lugar do site):</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px;">
        <code style="background:var(--black3);padding:6px 10px;border-radius:6px;font-size:12.5px;">${link}</code>
        <button class="admin-btn" id="wl-copy">Copiar link</button>
        <a class="admin-btn" href="/lista-espera.html" target="_blank" rel="noopener">Abrir</a>
      </div>
      <div class="admin-row-sub" style="margin-top:6px;">Dica: some <code>?origem=instagram</code> (ou bio, stories, anuncio) ao link para saber de onde veio cada inscrição.</div>
      <div class="admin-msg" id="wl-msg"></div>
    </div>
    <div class="admin-card">${rows.length ? `
      <div class="rx-scroll"><table class="rx-table">
        <thead><tr><th>Nome</th><th>Objetivo</th><th>Formato</th><th>Aluno?</th><th>Origem</th><th>Entrou em</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td><div class="rx-food">${esc(r.nome)}</div><div class="admin-row-sub">${esc(r.whatsapp)}${r.email ? ` · ${esc(r.email)}` : ''}</div>${r.mensagem ? `<div class="admin-row-sub">💬 ${esc(r.mensagem)}</div>` : ''}</td>
            <td>${esc(r.objetivo || '—')}</td><td>${esc(r.modalidade || '—')}</td><td>${esc(r.ja_aluno || '—')}</td>
            <td class="admin-row-sub">${esc(shortOrigin(r.origem))}</td>
            <td>${new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
            <td><select data-status="${r.id}">${STATUS.map(([k, l]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
            <td><a class="admin-btn" target="_blank" rel="noopener" href="https://wa.me/${waDigits(r.whatsapp)}?text=${encodeURIComponent(`Oi, ${String(r.nome).split(' ')[0]}! Aqui é o Taranttine. Vi que você entrou na lista de espera da consultoria de treino e nutrição.`)}">💬</a></td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : '<div class="admin-empty">Ninguém na lista ainda.</div>'}
    </div>
  `;

  document.getElementById('wl-copy').addEventListener('click', async () => {
    const msg = document.getElementById('wl-msg');
    try { await navigator.clipboard.writeText(link); msg.textContent = 'Link copiado.'; } catch { msg.textContent = link; }
  });
  main.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', async () => {
    const { error: e } = await supabase.from('waitlist').update({ status: sel.value }).eq('id', sel.dataset.status);
    const msg = document.getElementById('wl-msg');
    msg.className = e ? 'admin-msg error' : 'admin-msg';
    msg.textContent = e ? 'Não consegui salvar o status.' : 'Status atualizado.';
  }));
}

function waDigits(p) { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('55') ? d : `55${d}`; }
function shortOrigin(o) { if (!o) return '—'; try { return new URL(o).hostname.replace('www.', ''); } catch { return o; } }
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
