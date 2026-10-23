import { supabase } from '../supabaseClient.js';

// Check-in semanal: perguntas de 1 minuto, com nota de 1 a 5 onde faz
// sentido, para o painel apontar quem precisa de ajuste antes do retorno.

export const QUESTIONS = [
  { key: 'adesao', label: 'Quanto você seguiu o plano esta semana?', type: 'scale', options: ['Quase nada', 'Pouco', 'Metade', 'A maior parte', 'Quase tudo'] },
  { key: 'fome', label: 'Como foi a sua fome, no geral?', type: 'scale', options: ['Quase sem fome', 'Pouca', 'Normal', 'Bastante', 'Fome o tempo todo'] },
  { key: 'sono_h', label: 'Quantas horas você dormiu por noite, em média?', type: 'number', placeholder: 'Ex: 7' },
  { key: 'sono_q', label: 'Qualidade do sono', type: 'scale', options: ['Muito ruim', 'Ruim', 'Ok', 'Boa', 'Ótima'] },
  { key: 'agua', label: 'Água por dia, em média', type: 'choice', options: ['Menos de 1 L', '1 a 2 L', '2 a 3 L', 'Mais de 3 L'] },
  { key: 'energia', label: 'Energia nos treinos', type: 'scale', options: ['Muito baixa', 'Baixa', 'Normal', 'Boa', 'Muito boa'] },
  { key: 'intestino', label: 'Intestino', type: 'choice', options: ['Normal', 'Preso', 'Solto'] },
  { key: 'peso', label: 'Peso desta semana (opcional — mesma balança, de manhã)', type: 'number', placeholder: 'Ex: 70,5', optional: true },
  { key: 'dificuldade', label: 'Qual foi a maior dificuldade da semana?', type: 'text', optional: true },
  { key: 'duvida', label: 'Quer ajustar algo ou tirar alguma dúvida?', type: 'text', optional: true },
];

export const REQUIRED = QUESTIONS.filter(q => !q.optional).map(q => q.key);

// Semana começa na segunda-feira, no horário do aparelho.
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function answerText(q, v) {
  if (v == null || v === '') return '—';
  if (q.type === 'scale') return q.options[Number(v) - 1] || String(v);
  if (q.key === 'sono_h') return `${String(v).replace('.', ',')} h`;
  if (q.key === 'peso') return `${String(v).replace('.', ',')} kg`;
  return String(v);
}

// Sinais de atenção para o treinador.
export function flagsOf(r = {}) {
  const f = [];
  if (Number(r.adesao) && Number(r.adesao) <= 2) f.push('aderência baixa');
  if (Number(r.fome) >= 4) f.push('muita fome');
  if ((Number(r.sono_h) && Number(r.sono_h) < 6) || (Number(r.sono_q) && Number(r.sono_q) <= 2)) f.push('sono ruim');
  if (Number(r.energia) && Number(r.energia) <= 2) f.push('energia baixa');
  if (r.intestino === 'Preso') f.push('intestino preso');
  if (r.agua === 'Menos de 1 L') f.push('pouca água');
  if ((r.dificuldade && String(r.dificuldade).trim()) || (r.duvida && String(r.duvida).trim())) f.push('deixou mensagem');
  return f;
}

export async function fetchCheckins(clientId, limit = 12) {
  const { data, error } = await supabase.from('weekly_checkins')
    .select('week_start, respostas, updated_at').eq('client_id', clientId)
    .order('week_start', { ascending: false }).limit(limit);
  if (error) { console.error('fetchCheckins failed', error); return []; }
  return data;
}

export async function saveCheckin(clientId, respostas) {
  const { error } = await supabase.from('weekly_checkins').upsert(
    { client_id: clientId, week_start: weekStart(), respostas, updated_at: new Date().toISOString() },
    { onConflict: 'client_id,week_start' },
  );
  if (error) throw error;
}
