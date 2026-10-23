import { supabase } from '../../../app/js/supabaseClient.js';
import {
  fetchCycle, cycleState, renewalMessage, closingMessage, addDays, MAX_PAUSE_DAYS, PLAN_AFTER_END_DAYS,
} from '../../../app/js/lib/cycle.js';
import { planPrintHtml } from '../../../app/js/lib/planDoc.js';

// Card "Ciclo de acompanhamento" da aba Nutrição do aluno: inicia, pausa,
// renova, passa para manutenção ou encerra (com PDF final e mensagem).
const FASE = {
  andamento: ['', 'Em andamento'],
  renovar: ['amber', '🔔 Hora de conversar sobre a renovação'],
  vencido: ['red', '⚠️ Ciclo terminou: reavaliar e decidir o próximo passo'],
  pausado: ['amber', '⏸ Pausado'],
  pausa_longa: ['red', `⚠️ Pausado há mais de ${MAX_PAUSE_DAYS} dias`],
  encerrado: ['', 'Encerrado'],
};
const DESFECHO = { renovou: 'renovou', manutencao: 'foi para manutenção', encerrou: 'encerrou' };

export async function mountCycleCard(el, clientId) {
  const [cycle, { data: profile }] = await Promise.all([
    fetchCycle(clientId),
    supabase.from('profiles').select('full_name, phone').eq('id', clientId).single(),
  ]);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const s = cycleState(cycle);
  const fmt = iso => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
  const label = cycle?.tipo === 'manutencao' ? 'Manutenção' : 'Ciclo';

  let body;
  if (!cycle || cycle.status === 'encerrado') {
    body = `
      ${cycle ? `<div class="admin-row-sub" style="margin-bottom:10px;">Último ${label.toLowerCase()} de ${fmt(cycle.inicio)} a ${fmt(cycle.encerrado_em)} · ${DESFECHO[cycle.desfecho] || 'encerrado'}.
        ${cycle.desfecho === 'encerrou' ? ` Plano visível no app até <b>${fmt(addDays(cycle.encerrado_em, PLAN_AFTER_END_DAYS))}</b>.` : ''}</div>
        ${cycle.desfecho === 'encerrou' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
          <button class="admin-btn" data-cy="pdf-final">📄 PDF final (manutenção + como seguir sozinho)</button>
          <button class="admin-btn" data-cy="wa-fim">💬 Mensagem de encerramento</button></div>` : ''}` : '<div class="admin-row-sub" style="margin-bottom:10px;">Nenhum ciclo iniciado. Comece no dia da consulta inicial.</div>'}
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="cy-inicio" value="${today}">
        <button class="admin-btn primary" data-cy="iniciar" data-tipo="ciclo">▶️ Iniciar ciclo de 12 semanas</button>
        <button class="admin-btn" data-cy="iniciar" data-tipo="manutencao">Iniciar manutenção</button>
      </div>`;
  } else {
    const [cls, txt] = FASE[s.fase];
    const pct = Math.min(100, Math.round((Math.min(s.semana, s.semanas) / s.semanas) * 100));
    body = `
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;">
        <div><b style="font-family:'Barlow Condensed',sans-serif;font-size:26px;color:var(--white);">Semana ${Math.min(s.semana, s.semanas)}<span style="color:var(--muted);font-size:16px;"> de ${s.semanas}</span></b>
          <div class="admin-row-sub">${label} desde ${fmt(cycle.inicio)} · fim previsto ${fmt(s.fim)}${cycle.pausa_dias ? ` · ${cycle.pausa_dias} dia(s) de pausa já descontados` : ''}</div></div>
        <span class="rx-status ${cls === 'red' ? 'faltou' : cls === 'amber' ? 'passou' : 'ok'}">${txt}${s.fase.startsWith('pausa') ? ` · ${s.pausaAtual} dia(s)` : ''}</span>
      </div>
      <div class="cy-bar"><i style="width:${pct}%"></i><span style="left:${(10 / 12) * 100}%"></span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        ${cycle.status === 'pausado'
          ? '<button class="admin-btn primary" data-cy="retomar">▶️ Retomar</button>'
          : '<button class="admin-btn" data-cy="pausar">⏸ Pausar</button>'}
        <button class="admin-btn ${['renovar', 'vencido'].includes(s.fase) ? 'primary' : ''}" data-cy="wa-renovar">💬 Mensagem de renovação</button>
        <a class="admin-btn" href="#/cliente/${clientId}/relatorio">📊 Relatório de evolução</a>
      </div>
      <div class="admin-section-title" style="margin:16px 0 6px;font-size:13px;">Fim do ciclo: o que o aluno decidiu?</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="admin-btn" data-cy="renovou">1️⃣ Renovar (novo ciclo de 12 semanas)</button>
        <button class="admin-btn" data-cy="manutencao">2️⃣ Manutenção</button>
        <button class="admin-btn" data-cy="encerrou">3️⃣ Encerrar</button>
      </div>`;
  }

  el.innerHTML = `
    <div class="admin-card">
      <div class="admin-section-title" style="margin-top:0;">🔄 Ciclo de acompanhamento</div>
      ${body}
      <div class="admin-msg" id="cy-msg" style="margin-top:8px;"></div>
    </div>`;

  const msg = el.querySelector('#cy-msg');
  const fail = (e, what) => {
    console.error(what, e);
    msg.className = 'admin-msg error';
    msg.textContent = /nutrition_cycles/.test(e?.message || '') ? 'Rode o comando do banco 0032 no Supabase primeiro.' : 'Não consegui salvar. Tente de novo.';
  };
  const openWa = text => {
    const digits = String(profile?.phone || '').replace(/\D/g, '');
    const phone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };
  const reload = () => mountCycleCard(el, clientId);
  const syncConsult = on => { const t = document.getElementById('nutri-consult'); if (t) t.checked = on; };

  el.querySelector('.admin-card').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cy]');
    if (!b) return;
    const act = b.dataset.cy;
    try {
      if (act === 'iniciar') {
        const inicio = el.querySelector('#cy-inicio').value || today;
        const { error } = await supabase.from('nutrition_cycles').insert({ client_id: clientId, tipo: b.dataset.tipo, inicio });
        if (error) throw error;
        await supabase.from('profiles').update({ nutrition_consult: true }).eq('id', clientId);
        syncConsult(true);
        return reload();
      }
      if (act === 'pausar') {
        const { error } = await supabase.from('nutrition_cycles').update({ status: 'pausado', pausa_inicio: today }).eq('id', cycle.id);
        if (error) throw error;
        return reload();
      }
      if (act === 'retomar') {
        const { error } = await supabase.from('nutrition_cycles').update({ status: 'ativo', pausa_inicio: null, pausa_dias: (cycle.pausa_dias || 0) + s.pausaAtual }).eq('id', cycle.id);
        if (error) throw error;
        return reload();
      }
      if (act === 'wa-renovar') return openWa(renewalMessage(profile?.full_name, cycle));
      if (act === 'wa-fim') return openWa(closingMessage(profile?.full_name));
      if (act === 'pdf-final') {
        const { data: np } = await supabase.from('nutrition_plans').select('plan').eq('client_id', clientId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!np?.plan) { msg.className = 'admin-msg error'; msg.textContent = 'Este aluno não tem plano entregue pela Prescrição.'; return; }
        const w = window.open('', '_blank');
        w.document.write(planPrintHtml({ ...np.plan, entregue_em: today }, `${location.origin}/app/icons/icon-512.png`, { final: true }));
        w.document.close();
        setTimeout(() => w.print(), 600);
        return;
      }
      if (['renovou', 'manutencao', 'encerrou'].includes(act)) {
        const ask = { renovou: 'Fechar este ciclo e começar um novo de 12 semanas hoje?', manutencao: 'Fechar este ciclo e começar a manutenção hoje?', encerrou: `Encerrar o acompanhamento? A consultoria sai do app do aluno e o plano fica visível por mais ${PLAN_AFTER_END_DAYS} dias.` }[act];
        if (!window.confirm(ask)) return;
        const { error } = await supabase.from('nutrition_cycles').update({
          status: 'encerrado', desfecho: act, encerrado_em: today,
          ...(cycle.status === 'pausado' ? { pausa_inicio: null, pausa_dias: (cycle.pausa_dias || 0) + s.pausaAtual } : {}),
        }).eq('id', cycle.id);
        if (error) throw error;
        if (act === 'encerrou') { await supabase.from('profiles').update({ nutrition_consult: false }).eq('id', clientId); syncConsult(false); }
        else {
          const { error: e2 } = await supabase.from('nutrition_cycles').insert({ client_id: clientId, tipo: act === 'manutencao' ? 'manutencao' : 'ciclo', inicio: today });
          if (e2) throw e2;
        }
        return reload();
      }
    } catch (err) { fail(err, `cycle ${act} failed`); }
  });
}
