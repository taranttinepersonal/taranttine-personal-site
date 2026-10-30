import { supabase } from '../../../app/js/supabaseClient.js';

const SLOTS = 50;
const INVITE_DAYS = 10; // convite a partir de 10 dias antes do fim

// Ordem na lista: o que pede ação primeiro.
const STATUS = {
  triagem:    { label: 'Triagem de saúde', color: '#e05252', order: 0 },
  vencendo:   { label: 'Vencendo',         color: '#F0A500', order: 1 },
  semquest:   { label: 'Sem questionário', color: '#F0A500', order: 2 },
  ativo:      { label: 'Ativo',            color: '#00B894', order: 3 },
  vencido:    { label: 'Vencido',          color: '#888888', order: 4 },
  reembolsado:{ label: 'Reembolsado',      color: '#888888', order: 5 },
};

export function daysLeft(expiresAt, now = new Date()) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt) - now) / 86400000);
}

export function classify(p, order, hasProgram, now = new Date()) {
  if (order && (order.status === 'refunded' || order.status === 'chargedback')) return 'reembolsado';
  const left = daysLeft(p.access_expires_at, now);
  if (!p.active || (left !== null && left <= 0)) return 'vencido';
  if (p.plan_hold) return 'triagem';
  if (!hasProgram) return 'semquest';
  if (left !== null && left <= INVITE_DAYS) return 'vencendo';
  return 'ativo';
}

export function whatsappUrl(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = '55' + d; // celular sem DDI
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export function messageFor(status, name, left) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'tudo bem';
  switch (status) {
    case 'triagem':
      return `Oi, ${first}! Aqui é o Taranttine. Vi as suas respostas de saúde no Plano 50 Dias e queria conversar rapidinho antes de liberar o seu treino, pra montar tudo com segurança. Pode ser agora?`;
    case 'semquest':
      return `Oi, ${first}! Aqui é o Taranttine. Vi que você comprou o Plano 50 Dias, mas ainda não respondeu o questionário do app. Posso te ajudar a entrar? É só abrir https://taranttinepersonal.netlify.app/app/ e digitar o e-mail da compra: chega um código de 8 dígitos.`;
    case 'vencendo':
      return `Oi, ${first}! Aqui é o Taranttine. O seu Plano 50 Dias termina em ${left} dia${left === 1 ? '' : 's'}. Queria saber como foram os treinos e te contar como funciona o acompanhamento de aluno: treino pensado pra você, ajustes e devolutiva a cada 4 semanas. Quer que eu te explique?`;
    case 'vencido':
      return `Oi, ${first}! Aqui é o Taranttine. O seu Plano 50 Dias terminou. Obrigado por treinar comigo! Quer continuar como aluno, com acompanhamento? Te explico como funciona.`;
    default:
      return `Oi, ${first}! Aqui é o Taranttine. Como estão indo os treinos do Plano 50 Dias?`;
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

export function buildRows(profiles, orders, programClientIds, now = new Date()) {
  const lastOrder = {};
  (orders || []).forEach((o) => { if (o.client_id && !lastOrder[o.client_id]) lastOrder[o.client_id] = o; });
  return (profiles || []).map((p) => {
    const order = lastOrder[p.id] || null;
    const status = classify(p, order, programClientIds.has(p.id), now);
    return { p, order, status, left: daysLeft(p.access_expires_at, now) };
  }).sort((a, b) => {
    if (STATUS[a.status].order !== STATUS[b.status].order) return STATUS[a.status].order - STATUS[b.status].order;
    return (a.left ?? 9999) - (b.left ?? 9999);
  });
}

export function summarize(orders, rows) {
  const paid = (orders || []).filter(o => o.status === 'paid');
  const refunded = (orders || []).filter(o => o.status !== 'paid');
  return {
    sold: paid.length,
    remaining: Math.max(0, SLOTS - paid.length),
    gross: paid.reduce((s, o) => s + (Number(o.amount) || 0), 0),
    refunded: refunded.length,
    converted: (orders || []).filter(o => o.converted_at).length,
    toInvite: rows.filter(r => r.status === 'vencendo' && !r.p.plan_invited_at).length,
    needsAction: rows.filter(r => r.status === 'triagem').length,
  };
}

export async function renderPlano50Admin(main) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profiles, error: pErr }, { data: orders, error: oErr }] = await Promise.all([
    supabase.from('profiles')
      .select('id, full_name, email, phone, active, access_expires_at, plan_started_at, plan_hold, plan_template, plan_invited_at')
      .eq('plan', 'plano50'),
    supabase.from('plan50_orders')
      .select('id, client_id, status, amount, converted_at, paid_at, note')
      .order('paid_at', { ascending: false }),
  ]);
  if (pErr || oErr) {
    console.error(pErr || oErr);
    main.innerHTML = `<div class="admin-empty">Erro ao carregar. Se for a primeira vez, rode as migrações 0035 e 0036 no Supabase.</div>`;
    return;
  }

  const ids = (profiles || []).map(p => p.id);
  let withProgram = new Set();
  if (ids.length) {
    const { data: progs } = await supabase.from('workout_programs').select('client_id').in('client_id', ids).eq('is_active', true);
    withProgram = new Set((progs || []).map(x => x.client_id));
  }

  const rows = buildRows(profiles, orders, withProgram);
  const sum = summarize(orders, rows);

  const stat = (label, value, sub) => `
    <div class="admin-card" style="margin:0;text-align:center;padding:12px 8px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;">${label}</div>
      <div style="font-size:24px;font-weight:700;color:var(--text);margin-top:2px;">${value}</div>
      ${sub ? `<div style="font-size:11px;color:var(--faint);">${sub}</div>` : ''}
    </div>`;

  main.innerHTML = `
    <div class="admin-header"><div class="admin-title">Plano 50 Dias</div></div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px;">
      ${stat('Vendas', sum.sold, `${sum.remaining} vagas restantes`)}
      ${stat('Receita bruta', 'R$ ' + sum.gross.toFixed(2).replace('.', ','), 'antes da taxa da Greenn')}
      ${stat('Reembolsos', sum.refunded)}
      ${stat('Viraram aluno', sum.converted, sum.sold ? Math.round((sum.converted / sum.sold) * 100) + '% das vendas' : '')}
    </div>

    ${sum.needsAction ? `<div class="admin-card" style="border-color:#e05252;">⚠️ <b>${sum.needsAction}</b> pessoa(s) com triagem de saúde positiva: o treino só é liberado depois da sua conversa.</div>` : ''}
    ${sum.toInvite ? `<div class="admin-card" style="border-color:#F0A500;">📨 <b>${sum.toInvite}</b> pessoa(s) vencendo em até ${INVITE_DAYS} dias e ainda sem convite.</div>` : ''}

    <div class="admin-section-title">Compradores</div>
    <div class="admin-card" id="p50-list">
      ${rows.length ? rows.map(r => rowHtml(r)).join('') : '<div class="admin-empty">Nenhuma venda ainda.</div>'}
    </div>
  `;

  main.querySelectorAll('[data-invited]').forEach(btn => btn.addEventListener('click', async () => {
    btn.disabled = true;
    const { error } = await supabase.from('profiles').update({ plan_invited_at: new Date().toISOString() }).eq('id', btn.dataset.invited);
    if (error) { console.error(error); btn.disabled = false; alert('Não consegui salvar. Rode a migração 0036 no Supabase.'); return; }
    renderPlano50Admin(main);
  }));

  main.querySelectorAll('[data-extend]').forEach(btn => btn.addEventListener('click', async () => {
    const row = rows.find(r => r.p.id === btn.dataset.extend);
    if (!row) return;
    if (!confirm('Somar 7 dias ao acesso desta pessoa?')) return;
    btn.disabled = true;
    // se já venceu, os 7 dias contam a partir de hoje; se não, a partir do vencimento atual
    const base = row.p.access_expires_at && new Date(row.p.access_expires_at) > new Date() ? new Date(row.p.access_expires_at) : new Date();
    const next = new Date(base.getTime() + 7 * 86400000).toISOString();
    const { error } = await supabase.from('profiles').update({ access_expires_at: next, active: true }).eq('id', row.p.id);
    if (error) { console.error(error); btn.disabled = false; alert('Não consegui salvar.'); return; }
    renderPlano50Admin(main);
  }));

  main.querySelectorAll('[data-converted]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Marcar como aluno efetivo? O acesso deixa de vencer e a pessoa sai desta lista (a ficha atual continua; ajuste na aba Treino).')) return;
    btn.disabled = true;
    const id = btn.dataset.converted;
    const { error } = await supabase.from('profiles')
      .update({ plan: null, access_expires_at: null, plan_hold: false, active: true }).eq('id', id);
    if (error) { console.error(error); btn.disabled = false; alert('Não consegui salvar.'); return; }
    await supabase.from('plan50_orders').update({ converted_at: new Date().toISOString() }).eq('client_id', id);
    renderPlano50Admin(main);
  }));
}

export function rowHtml({ p, order, status, left }) {
  const st = STATUS[status];
  const wa = whatsappUrl(p.phone, messageFor(status, p.full_name, left));
  const leftTxt = left === null ? '—' : left <= 0 ? 'encerrado' : `${left} dia${left === 1 ? '' : 's'}`;
  const canInvite = status === 'vencendo' || status === 'vencido';
  return `
    <div class="admin-row">
      <div>
        <div class="admin-row-name">${escapeHtml(p.full_name)}
          <span class="admin-badge" style="color:${st.color};background:${st.color}1a;margin-left:6px;">${st.label}</span>
          ${p.plan_invited_at ? `<span class="admin-badge" style="color:#00B894;background:rgba(0,184,148,.1);margin-left:4px;">convidado ${fmtDate(p.plan_invited_at)}</span>` : ''}
        </div>
        <div class="admin-row-sub">${escapeHtml(p.email || '')} · ${escapeHtml(p.phone || 'sem telefone')}</div>
        <div class="admin-row-sub">Comprou em ${fmtDate(p.plan_started_at)} · acesso até ${fmtDate(p.access_expires_at)} (${leftTxt})${p.plan_template ? ' · ' + escapeHtml(p.plan_template.replace('_', ' · ')) : ''}${order && order.note ? ' · ⚠ ' + escapeHtml(order.note) : ''}</div>
      </div>
      <div class="admin-row-actions">
        ${wa ? `<a class="admin-btn primary" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${canInvite && !p.plan_invited_at ? `<button class="admin-btn" data-invited="${p.id}">Marcar convidado</button>` : ''}
        ${status !== 'reembolsado' ? `<button class="admin-btn" data-extend="${p.id}" title="Soma 7 dias ao acesso (ex.: espera da triagem)">+7 dias</button>` : ''}
        ${status !== 'reembolsado' ? `<button class="admin-btn" data-converted="${p.id}">Virou aluno</button>` : ''}
        <a class="admin-btn" href="#/cliente/${p.id}/treino">Treino</a>
      </div>
    </div>`;
}
