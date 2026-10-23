import { supabase } from '../../../app/js/supabaseClient.js';
import { QUESTIONS, flagsOf, weekStart, answerText } from '../../../app/js/lib/checkin.js';

// Visão geral dos check-ins semanais de quem tem a consultoria liberada:
// quem precisa de atenção aparece primeiro.
export async function renderCheckins(main) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando os check-ins...</div>`;

  const since = new Date(); since.setDate(since.getDate() - 70);
  const sinceISO = since.toISOString().slice(0, 10);
  const [{ data: clients, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('role', 'client').eq('active', true).eq('nutrition_consult', true).order('full_name'),
    supabase.from('weekly_checkins').select('client_id, week_start, respostas').gte('week_start', sinceISO).order('week_start', { ascending: false }),
  ]);
  if (e1 || e2) {
    main.innerHTML = `<div class="admin-msg error">Não consegui carregar. Confira se o comando do banco 0028 já foi rodado no Supabase.</div>`;
    return;
  }

  const thisWeek = weekStart();
  const byClient = new Map((clients || []).map(c => [c.id, []]));
  (rows || []).forEach(r => { if (byClient.has(r.client_id)) byClient.get(r.client_id).push(r); });
  const Q = Object.fromEntries(QUESTIONS.map(q => [q.key, q]));

  const list = (clients || []).map(c => {
    const hist = byClient.get(c.id);
    const last = hist[0] || null;
    const flags = last ? flagsOf(last.respostas) : [];
    const days = last ? Math.round((Date.now() - new Date(last.week_start + 'T00:00:00').getTime()) / 86400000) : null;
    const missing = !last || last.week_start !== thisWeek;
    const score = (missing ? 10 : 0) + flags.length + (days == null || days > 10 ? 5 : 0);
    const prevW = hist[1]?.respostas?.peso, curW = last?.respostas?.peso;
    return { c, hist, last, flags, days, missing, score, pesoDelta: prevW && curW ? Number(curW) - Number(prevW) : null };
  }).sort((a, b) => b.score - a.score || String(a.c.full_name).localeCompare(String(b.c.full_name)));

  const done = list.filter(x => !x.missing).length;
  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Check-ins da semana</div></div>
    <div class="rx-daybar" style="position:static;">
      <div class="rx-day-cell ok"><span>Responderam</span><b>${done}</b><small>de ${list.length} na consultoria</small></div>
      <div class="rx-day-cell ${list.length - done ? 'faltou' : 'ok'}"><span>Faltam</span><b>${list.length - done}</b><small>semana de ${fmt(thisWeek)}</small></div>
      <div class="rx-day-cell ${list.some(x => x.flags.length) ? 'faltou' : 'ok'}"><span>Com sinal de atenção</span><b>${list.filter(x => !x.missing && x.flags.length).length}</b><small>no último check-in</small></div>
      <div class="rx-day-cell"><span>Lembrete automático</span><b>Dom</b><small>19h para quem não respondeu</small></div>
    </div>
    ${list.length ? `
    <div class="admin-card"><div class="rx-scroll"><table class="rx-table">
      <thead><tr><th>Aluno</th><th>Último check-in</th><th>Aderência</th><th>Fome</th><th>Sono</th><th>Energia</th><th>Peso</th><th>Atenção</th></tr></thead>
      <tbody>${list.map(x => {
        const r = x.last?.respostas || {};
        return `<tr>
          <td><a href="#/cliente/${x.c.id}/nutricao" class="rx-food" style="text-decoration:none;">${esc(x.c.full_name)}</a></td>
          <td>${x.last ? `${fmt(x.last.week_start)}${x.missing ? ' <span class="rx-status faltou">⚠️ sem check-in nesta semana</span>' : ' <span class="rx-status ok">✅</span>'}` : '<span class="rx-status faltou">nunca respondeu</span>'}</td>
          <td>${x.last ? esc(answerText(Q.adesao, r.adesao)) : '—'}</td>
          <td>${x.last ? esc(answerText(Q.fome, r.fome)) : '—'}</td>
          <td>${x.last ? `${esc(answerText(Q.sono_h, r.sono_h))} · ${esc(answerText(Q.sono_q, r.sono_q))}` : '—'}</td>
          <td>${x.last ? esc(answerText(Q.energia, r.energia)) : '—'}</td>
          <td>${r.peso ? `${esc(answerText(Q.peso, r.peso))}${x.pesoDelta != null ? ` <span class="admin-row-sub">(${x.pesoDelta > 0 ? '+' : ''}${x.pesoDelta.toFixed(1).replace('.', ',')})</span>` : ''}` : '—'}${r.ciclo && /antes|menstruada/i.test(r.ciclo) ? '<div class="admin-row-sub">fase do ciclo: retenção provável</div>' : ''}</td>
          <td>${x.flags.map(f => `<span class="rx-supp-alert" style="display:inline-block;margin-right:6px;">⚠️ ${esc(f)}</span>`).join('') || (x.last ? '<span class="admin-row-sub">nenhum</span>' : '')}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div></div>` : '<div class="admin-card admin-empty">Nenhum aluno com a consultoria nutricional liberada ainda. Libere em Aluno → Nutrição.</div>'}
  `;
}

function fmt(iso) { const [y, m, d] = String(iso).split('-'); return `${d}/${m}`; }
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
