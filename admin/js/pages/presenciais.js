import { supabase } from '../../../app/js/supabaseClient.js';
import { LEVEL_BANDS } from '../../../app/js/lib/progression.js';
import { loadPresencialOverview, isMissingColumn } from '../lib/presencialData.js';

const STATUS = {
  parado:  { label: 'Parado',   cls: 'down', order: 0 },
  atencao: { label: 'Atenção',  cls: 'warn', order: 1 },
  semlog:  { label: 'Sem lançamentos', cls: 'muted', order: 2 },
  semficha: { label: 'Sem ficha', cls: 'muted', order: 3 },
  emdia:   { label: 'Em dia',   cls: 'up',   order: 4 },
};

export async function renderPresenciais(main) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  let overview;
  try {
    overview = await loadPresencialOverview();
  } catch (e) {
    console.error(e);
    main.innerHTML = isMissingColumn(e)
      ? `<div class="admin-empty">Falta rodar as migrações <b>0037</b> a <b>0041</b> no Supabase (SQL Editor) pra liberar o painel dos presenciais.</div>`
      : `<div class="admin-empty">Erro ao carregar os presenciais.</div>`;
    return;
  }

  const items = overview.cards.map(({ client, data }) => summarize(client, data))
    .sort((a, b) => (STATUS[a.status].order - STATUS[b.status].order) || a.client.full_name.localeCompare(b.client.full_name));

  const total = items.length;
  const sum = (k) => items.reduce((n, i) => n + (i[k] || 0), 0);
  const flag = (k) => items.filter(i => i[k]).length;

  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Presenciais</div></div>

    <div class="pc-summary pc-summary-top">
      <div><b>${total}</b><span>clientes</span></div>
      <div class="up"><b>${sum('subir')}</b><span>cargas p/ subir</span></div>
      <div class="warn"><b>${sum('plato')}</b><span>sem progresso</span></div>
      <div class="deload"><b>${flag('change')}</b><span>troca de fase</span></div>
      <div class="warn"><b>${flag('deloadSuggested')}</b><span>sinais p/ deload</span></div>
      <div class="deload"><b>${flag('rotate')}</b><span>trocas de exercício</span></div>
      <div class="down"><b>${items.filter(i => i.status === 'parado').length}</b><span>parados</span></div>
    </div>

    ${total ? `<div class="pc-cards">${items.map(cardHtml).join('')}</div>`
            : `<div class="admin-card"><div class="admin-empty">Nenhum cliente marcado como presencial ainda.<br>Marque abaixo quem treina com você na academia.</div></div>`}

    <details class="admin-card pc-mark" ${total ? '' : 'open'}>
      <summary>Marcar clientes como presenciais</summary>
      ${overview.others.length ? overview.others.map(c => `
        <div class="admin-row">
          <div><div class="admin-row-name">${esc(c.full_name)}</div><div class="admin-row-sub">${c.modalidade === 'online' ? 'online' : 'sem modalidade definida'}</div></div>
          <button class="admin-btn" data-mark="${c.id}">Marcar como presencial</button>
        </div>`).join('') : `<div class="admin-row-sub" style="padding-top:10px;">Todos os clientes ativos já são presenciais.</div>`}
    </details>
  `;

  main.addEventListener('click', async (ev) => {
    const mark = ev.target.closest('[data-mark]');
    const unmark = ev.target.closest('[data-unmark]');
    if (!mark && !unmark) return;
    const btn = mark || unmark;
    if (unmark && !confirm('Tirar este cliente dos presenciais? Os lançamentos de carga continuam guardados.')) return;
    btn.disabled = true;
    const { error } = await supabase.from('profiles')
      .update({ modalidade: mark ? 'presencial' : 'online' }).eq('id', mark ? mark.dataset.mark : unmark.dataset.unmark);
    if (error) { console.error(error); alert('Erro ao salvar: ' + error.message); btn.disabled = false; return; }
    renderPresenciais(main);
  });
}

function summarize(client, data) {
  if (!data || !data.program) return { client, data, status: 'semficha' };
  const all = data.days.flatMap(day => day.exercises);
  // cargas importadas da planilha têm data estimada: não contam como treino lançado
  const lastDate = data.logs.find(l => !l.estimated)?.logged_on || null;
  const days = lastDate ? Math.floor((Date.now() - new Date(lastDate + 'T00:00:00').getTime()) / 86400000) : null;
  const status = days == null ? 'semlog' : days > 14 ? 'parado' : days > 7 ? 'atencao' : 'emdia';
  const ref = data.program.last_adjusted_at || data.program.created_at;
  return {
    client, data, status, lastDate, days,
    subir: all.filter(e => e.suggestion.action === 'subir').length,
    plato: all.filter(e => e.suggestion.action === 'plato').length,
    dor: all.filter(e => e.last?.feeling === 'dor').length,
    change: !!data.info?.isChange,
    deloadApplied: !!data.deloadApplied,
    deloadSuggested: !!data.deloadSuggested && !data.deloadApplied,
    rotate: data.block && ['hoje', 'atrasada', 'proxima'].includes(data.block.status) ? data.block : null,
    cycleEnd: data.program.current_week && data.program.total_weeks - data.program.current_week <= 3 ? data.program.total_weeks - data.program.current_week : null,
    reajuste: ref ? (Date.now() - new Date(ref).getTime()) / 86400000 >= 28 : false,
  };
}

function cardHtml(i) {
  const { client, data, status } = i;
  const st = STATUS[status];
  const info = data?.info;
  const level = data?.level?.nivel_final && LEVEL_BANDS[data.level.nivel_final] ? LEVEL_BANDS[data.level.nivel_final].label : null;
  return `
    <div class="pc-card">
      <div class="pc-card-head">
        <div class="pc-card-name">${esc(client.full_name)}</div>
        <span class="pc-status ${st.cls}">${st.label}</span>
      </div>
      <div class="pc-badges">
        ${info ? `<span class="pc-badge">Semana ${info.week}/${data.program.total_weeks}</span><span class="pc-badge ${info.phase.isDeload ? 'deload' : 'phase'}">${esc(info.phase.label)}</span>`
               : (data?.program ? `<span class="pc-badge warn">Semana não definida</span>` : '')}
        ${i.change ? `<span class="pc-badge warn">Troca de fase</span>` : ''}
        ${i.deloadApplied ? `<span class="pc-badge deload">Deload aplicado</span>` : ''}
        ${i.deloadSuggested ? `<span class="pc-badge warn">Sinais pedem deload</span>` : ''}
        ${level ? `<span class="pc-badge">${esc(level)}</span>` : ''}
        ${i.rotate ? `<span class="pc-badge ${i.rotate.daysLeft <= 0 ? 'warn' : 'deload'}">Trocar exercícios ${i.rotate.daysLeft === 0 ? 'hoje' : i.rotate.daysLeft > 0 ? `em ${i.rotate.daysLeft}d` : `(atrasada ${-i.rotate.daysLeft}d)`}</span>` : ''}
        ${i.cycleEnd != null ? `<span class="pc-badge warn">${i.cycleEnd > 0 ? `Novo ciclo em ${i.cycleEnd} sem` : 'Última semana do ciclo'}</span>` : ''}
        ${i.reajuste ? `<span class="pc-badge warn">Reajustar ficha</span>` : ''}
      </div>
      <div class="pc-card-body">
        ${data?.program ? `
          <div>${i.lastDate ? `Último treino lançado: <b>${fmtDate(i.lastDate)}</b> (${i.days === 0 ? 'hoje' : `há ${i.days} dia${i.days === 1 ? '' : 's'}`})` : 'Nenhum treino lançado no painel ainda.'}</div>
          <div>${i.subir ? `<span class="pc-ok">↑ ${i.subir} carga${i.subir === 1 ? '' : 's'} p/ subir</span>` : ''}${i.plato ? ` <span class="pc-warn">⚠ ${i.plato} sem progresso</span>` : ''}${i.dor ? ` <span class="pc-warn">⚠ ${i.dor} com dor/incômodo</span>` : ''}${!i.subir && !i.plato && !i.dor ? '<span class="pc-dim">Sem alertas de progressão.</span>' : ''}</div>`
        : `<div>Sem ficha ativa. Monte em <a href="#/cliente/${client.id}/treino">Treino</a>.</div>`}
      </div>
      <div class="pc-card-actions">
        <a class="admin-btn primary" href="#/presencial/${client.id}">Abrir painel</a>
        <button class="admin-btn" data-unmark="${client.id}">Remover</button>
      </div>
    </div>`;
}

function fmtDate(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
