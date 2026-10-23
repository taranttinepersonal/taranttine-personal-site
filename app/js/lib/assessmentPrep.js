// Protocolo de preparo para a bioimpedância. A medida depende muito da água
// corporal, então jejum, treino recente, álcool, bexiga, cafeína, horário e
// fase do ciclo mudam o resultado. Duas avaliações só são comparáveis se o
// preparo for parecido.

export const PREP = [
  { key: 'jejum', texto: 'Jejum de 3 a 4 horas antes (sem comer)' },
  { key: 'treino', texto: 'Não treinar nas 12 horas antes (o ideal são 24 h)' },
  { key: 'alcool', texto: 'Nada de bebida alcoólica nas 24 horas antes' },
  { key: 'cafeina', texto: 'Sem café, chá preto ou energético nas 4 horas antes' },
  { key: 'agua', texto: 'Beber água normalmente no dia anterior, sem exagerar nas 2 horas antes' },
  { key: 'bexiga', texto: 'Ir ao banheiro antes de subir na balança' },
  { key: 'horario', texto: 'Manter o mesmo horário das avaliações anteriores (de preferência de manhã)' },
  { key: 'roupa', texto: 'Roupa leve, sem relógio, brincos ou acessórios de metal' },
  { key: 'ciclo', texto: 'Mulheres: se possível, evitar a semana antes da menstruação e os dias de menstruação', soMulher: true },
];

// O que o treinador marca na hora da avaliação. true = preparo seguido.
export const CONDITIONS = [
  { key: 'jejum', label: 'Fez jejum de 3–4 h', falha: 'sem jejum' },
  { key: 'treino', label: 'Não treinou nas últimas 12 h', falha: 'treinou nas últimas 12 h' },
  { key: 'alcool', label: 'Sem álcool nas últimas 24 h', falha: 'bebeu álcool nas últimas 24 h' },
  { key: 'cafeina', label: 'Sem cafeína nas últimas 4 h', falha: 'tomou cafeína nas últimas 4 h' },
  { key: 'bexiga', label: 'Esvaziou a bexiga', falha: 'bexiga cheia' },
];

export const CYCLE_PHASES = ['Não se aplica', 'Fase folicular (após a menstruação)', 'Perto da ovulação', 'Semana antes da menstruação', 'Menstruada'];

// Avaliação comparável com a anterior? Lista o que pode distorcer.
export function comparability(cond, prevCond) {
  if (!cond) return { ok: null, reasons: ['preparo não registrado'] };
  const reasons = CONDITIONS.filter(c => cond[c.key] === false).map(c => c.falha);
  if (['Semana antes da menstruação', 'Menstruada'].includes(cond.ciclo)) reasons.push('fase do ciclo com retenção de líquido');
  if (prevCond?.hora && cond.hora) {
    const toMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0); };
    if (Math.abs(toMin(cond.hora) - toMin(prevCond.hora)) > 120) reasons.push(`horário diferente da anterior (${prevCond.hora} → ${cond.hora})`);
  }
  return { ok: reasons.length === 0, reasons };
}

export function prepMessage(nome, whenISO, sexo) {
  const d = whenISO ? new Date(whenISO) : null;
  const when = d ? `${d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '';
  const lines = [`*Avaliação física${nome ? ` · ${nome}` : ''}*`];
  if (when) lines.push(`📅 ${when}`);
  lines.push('', 'Para a medida sair certa e comparável com as próximas, siga o preparo:');
  PREP.filter(p => !p.soMulher || String(sexo || '').toLowerCase().startsWith('f')).forEach(p => lines.push(`✅ ${p.texto}`));
  lines.push('', 'Qualquer dúvida, me chama por aqui.');
  return lines.join('\n');
}

export async function fetchNextAssessment(supabase, clientId) {
  const { data, error } = await supabase.from('profiles').select('next_assessment_at, sexo').eq('id', clientId).maybeSingle();
  if (error || !data?.next_assessment_at) return null;
  const at = new Date(data.next_assessment_at);
  if (at.getTime() < Date.now() - 6 * 3600 * 1000) return null;
  return { at, sexo: data.sexo };
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Cartão do app com data e preparo. compact = só o aviso, com link para Evolução.
export function prepCardHtml(next, { compact = false } = {}) {
  if (!next) return '';
  const when = next.at.toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const days = Math.ceil((next.at.getTime() - Date.now()) / 86400000);
  if (compact) {
    if (days > 3) return '';
    return `<div class="ex-card" style="border-color:var(--green);"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
      <div><div class="ex-name">📅 Avaliação ${days <= 1 ? 'amanhã' : `em ${days} dias`}</div><div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(when)} · veja o preparo</div></div>
      <button class="logout-link" onclick="window.location.hash='/progresso'" style="font-weight:700;color:var(--green);">Ver</button></div></div>`;
  }
  const items = PREP.filter(p => !p.soMulher || String(next.sexo || '').toLowerCase().startsWith('f'));
  return `<div class="ex-card" style="border-color:var(--green);">
    <div class="ex-name">📅 Sua próxima avaliação</div>
    <div style="font-size:13px;color:var(--text);margin:4px 0 10px;text-transform:capitalize;">${esc(when)}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Para a medida sair certa e dar pra comparar com as próximas:</div>
    ${items.map(p => `<div style="font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--border);">✅ ${esc(p.texto)}</div>`).join('')}
    <div style="font-size:11.5px;color:var(--faint);margin-top:8px;line-height:1.45;">Mesmo com tudo certo, a bioimpedância varia um pouco de uma medida para outra (1 a 2 pontos de % de gordura). Por isso olhamos a tendência ao longo dos meses, não uma medida isolada.</div>
  </div>`;
}
