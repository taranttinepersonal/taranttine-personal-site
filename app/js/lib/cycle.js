import { supabase } from '../supabaseClient.js';

// Ciclo de acompanhamento da consultoria: 12 semanas, aviso de renovação a
// partir da semana 10, pausa de até 30 dias e 30 dias de plano visível
// depois do encerramento.
export const RENEW_FROM_WEEK = 10;
export const MAX_PAUSE_DAYS = 30;
export const PLAN_AFTER_END_DAYS = 30;

const DAY = 86400000;
const toDate = iso => new Date(String(iso).slice(0, 10) + 'T00:00:00');
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const addDays = (iso, n) => new Date(toDate(iso).getTime() + n * DAY + 12 * 3600000).toISOString().slice(0, 10);

export async function fetchCycle(clientId) {
  const { data, error } = await supabase.from('nutrition_cycles').select('*')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error('fetchCycle failed', error); return null; }
  return data;
}

export async function fetchCycles(clientIds) {
  if (!clientIds.length) return new Map();
  const { data, error } = await supabase.from('nutrition_cycles').select('*')
    .in('client_id', clientIds).order('created_at', { ascending: false });
  if (error) { console.error('fetchCycles failed', error); return new Map(); }
  const out = new Map();
  (data || []).forEach(c => { if (!out.has(c.client_id)) out.set(c.client_id, c); });
  return out;
}

// Situação do ciclo hoje: semana atual, fim previsto, dias de pausa e fase
// ('andamento' | 'renovar' | 'vencido' | 'pausado' | 'pausa_longa' | 'encerrado').
export function cycleState(c, today = todayISO()) {
  if (!c) return null;
  const pausaAtual = c.status === 'pausado' && c.pausa_inicio ? Math.round((toDate(today) - toDate(c.pausa_inicio)) / DAY) : 0;
  const ref = c.status === 'pausado' && c.pausa_inicio ? c.pausa_inicio : today;
  const dias = Math.round((toDate(ref) - toDate(c.inicio)) / DAY) - (c.pausa_dias || 0);
  const semana = Math.max(1, Math.floor(dias / 7) + 1);
  const fim = addDays(c.inicio, c.semanas * 7 + (c.pausa_dias || 0) + pausaAtual);
  let fase = 'andamento';
  if (c.status === 'encerrado') fase = 'encerrado';
  else if (c.status === 'pausado') fase = pausaAtual > MAX_PAUSE_DAYS ? 'pausa_longa' : 'pausado';
  else if (semana > c.semanas) fase = 'vencido';
  else if (semana >= c.semanas - (12 - RENEW_FROM_WEEK)) fase = 'renovar';
  return { semana, semanas: c.semanas, fim, pausaAtual, fase };
}

// Plano continua no app até 30 dias depois do encerramento.
export function planStillVisible(c, today = todayISO()) {
  if (!c || c.status !== 'encerrado' || !c.encerrado_em) return true;
  return toDate(today) <= toDate(addDays(c.encerrado_em, PLAN_AFTER_END_DAYS));
}

const fmtBR = iso => toDate(iso).toLocaleDateString('pt-BR');
const first = nome => String(nome || '').trim().split(/\s+/)[0] || '';

export function renewalMessage(nome, c) {
  const s = cycleState(c);
  return [
    `Oi, ${first(nome)}! 👊`,
    '',
    `Estamos na *semana ${Math.min(s.semana, s.semanas)} de ${s.semanas}* do seu ciclo${c.tipo === 'manutencao' ? ' de manutenção' : ''}. Hora de olhar o caminho até aqui:`,
    '',
    '✅ Vou te mandar o seu relatório de evolução',
    `✅ Até ${fmtBR(s.fim)} fazemos a reavaliação`,
    '✅ E decidimos juntos o próximo passo:',
    '',
    '1️⃣ *Novo ciclo de 12 semanas*, com uma meta nova',
    '2️⃣ *Manutenção*: plano mais leve, retorno mensal, para segurar o resultado',
    '3️⃣ *Encerrar*: você recebe o plano de manutenção e um guia para seguir sozinho(a)',
    '',
    'Me conta: como você está se sentindo com o plano?',
  ].join('\n');
}

export function closingMessage(nome) {
  return [
    `${first(nome)}, foi um prazer te acompanhar nesse ciclo! 🙌`,
    '',
    '✅ Seu plano de manutenção e o guia "Como seguir sozinho(a)" estão no PDF que te mandei',
    `✅ O plano continua no app por mais ${PLAN_AFTER_END_DAYS} dias`,
    '✅ Quando quiser voltar, é só me chamar aqui',
    '',
    'Conte comigo! 💪',
  ].join('\n');
}
