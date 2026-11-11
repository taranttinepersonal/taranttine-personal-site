// Rotação de exercícios e novo ciclo dos clientes presenciais. Funções puras (sem Supabase).
//
// Regras do FitPro (aba "Rotação de Exercícios"):
//  - trocar sempre DENTRO do mesmo padrão de movimento (linha do banco);
//  - manter a prescrição (séries, reps, descanso): só muda o exercício;
//  - bloco de 4 semanas (iniciante / foco em adaptação) ou 6 (intermediário / avançado);
//  - trocar no máximo 50% dos exercícios por vez, mantendo referência de progressão de carga.
// Carga de partida do novo ciclo: percentual do pico do ciclo anterior (padrão abaixo).
import { parseNum, roundHalf } from './progression.js';

// Banco de substituição por padrão de movimento (ids conferidos na biblioteca olhando os GIFs).
// `aliases` = outros ids da biblioteca que as fichas atuais usam pro mesmo exercício.
const o = (id, name, aliases = []) => ({ id, name, aliases });
export const ROTATION_BANK = [
  { key: 'empurrar_h', label: 'Empurrar horizontal (peito)', options: [o('EX415', 'Supino máquina'), o('EX2044', 'Supino reto barra'), o('EX386', 'Crucifixo máquina'), o('EX1044', 'Flexão de braço')] },
  { key: 'empurrar_v', label: 'Empurrar vertical (ombro)', options: [o('EX226', 'Desenvolvimento máquina'), o('EX225', 'Desenvolvimento com halteres'), o('EX2042', 'Elevação lateral', ['EX2022']), o('EX2016', 'Arnold press com halteres')] },
  { key: 'puxar_h', label: 'Puxar horizontal (costas)', options: [o('EX2035', 'Remada baixa (cabo)'), o('EX191', 'Remada máquina'), o('EX2041', 'Remada curvada barra', ['EX2064']), o('EX193', 'Remada serrote (unilateral)')] },
  { key: 'puxar_v', label: 'Puxar vertical (costas)', options: [o('EX2040', 'Puxada frente (pulley)', ['EX2051']), o('EX2032', 'Puxada supinada (pulley)'), o('EX513', 'Barra fixa assistida (máquina)'), o('EX170', 'Puxada unilateral no cabo')] },
  { key: 'agachamento', label: 'Agachamento (bilateral)', options: [o('EX2027', 'Leg press 45°', ['EX322']), o('EX488', 'Agachamento livre com barra'), o('EX2015', 'Agachamento no smith'), o('EX277', 'Agachamento hack')] },
  { key: 'dobradica', label: 'Dobradiça de quadril', options: [o('EX2038', 'Stiff na barra', ['EX579', 'EX334']), o('EX326', 'Mesa flexora'), o('EX301', 'Elevação pélvica', ['EX2026']), o('EX333', 'Stiff com halteres')] },
  { key: 'avanco', label: 'Avanço / unilateral de perna', options: [o('EX2012', 'Afundo com halteres', ['EX2070']), o('EX327', 'Passadas com halteres'), o('EX2019', 'Búlgaro com halteres', ['EX290']), o('EX285', 'Avanço')] },
  { key: 'panturrilha', label: 'Panturrilha', options: [o('EX2049', 'Panturrilha em pé na máquina', ['EX358']), o('EX2056', 'Panturrilha sentado'), o('EX360', 'Panturrilha no leg press'), o('EX359', 'Panturrilha em pé unilateral')] },
  { key: 'biceps', label: 'Bíceps', options: [o('EX2052', 'Rosca direta com barra', ['EX088']), o('EX2037', 'Rosca alternada com halteres', ['EX073']), o('EX112', 'Rosca scott barra reta'), o('EX079', 'Rosca no cabo')] },
  { key: 'triceps', label: 'Tríceps', options: [o('EX2046', 'Tríceps corda (cabo)'), o('EX2047', 'Tríceps testa'), o('EX459', 'Tríceps francês'), o('EX2048', 'Mergulho no banco')] },
  { key: 'core', label: 'Abdômen / core', options: [o('EX054', 'Prancha'), o('EX2043', 'Abdominal supra'), o('EX042', 'Elevação de pernas solo'), o('EX1158', 'Ab wheel (roda abdominal)')] },
];

const ALL = new Map();   // id (ou alias) -> { pattern, option }
for (const p of ROTATION_BANK) for (const opt of p.options) for (const id of [opt.id, ...opt.aliases]) ALL.set(id, { pattern: p, option: opt });

export function patternOf(exerciseId) { return ALL.get(exerciseId)?.pattern || null; }
export function canonicalId(exerciseId) { return ALL.get(exerciseId)?.option.id || exerciseId; }

// ---------- bloco de rotação ----------

export const MAX_SWAP_RATIO = 0.5;

// Duração padrão do bloco: 4 semanas (iniciante, foco em adaptação ou sem nível avaliado, como na
// tabela do FitPro) ou 6 (intermediário / avançado).
export function defaultBlockWeeks(levelKey, phaseKey) {
  if (['intermediario', 'avancado', 'extremamente_avancado'].includes(levelKey) && phaseKey !== 'adaptacao') return 6;
  return 4;
}

const DAY = 86400000;
function toMs(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00').getTime(); }

// start = início do bloco (ISO); retorna próxima troca, dias restantes e situação.
export function blockInfo({ start, blockWeeks, today }) {
  if (!start || !blockWeeks) return null;
  const next = new Date(toMs(start) + blockWeeks * 7 * DAY);
  const nextIso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
  const daysLeft = Math.round((toMs(nextIso) - toMs(today)) / DAY);
  const status = daysLeft < 0 ? 'atrasada' : daysLeft === 0 ? 'hoje' : daysLeft <= 7 ? 'proxima' : 'em_dia';
  return { start: String(start).slice(0, 10), blockWeeks, next: nextIso, daysLeft, status };
}

// ---------- sugestão de trocas ----------

// exercises: [{ rowId, exerciseId, name, last (log mais novo), notWorking, suggestion: {action} }]
// inProgram: ids (canônicos) já presentes na ficha; avoid: ids retirados recentemente (não voltam já).
// Devolve [{ rowId, from, to, alternatives, pattern, reason, priority }] — no máximo 50% dos elegíveis.
export function suggestRotation(exercises, { maxRatio = MAX_SWAP_RATIO, avoid = new Set() } = {}) {
  const eligible = exercises.filter(e => patternOf(e.exerciseId));
  const limit = eligible.length >= 2 ? Math.floor(eligible.length * maxRatio) : 0;
  const inProgram = new Set(exercises.map(e => canonicalId(e.exerciseId)));
  const scored = eligible.map((e, i) => {
    let priority = 0, reason = 'Renovar o estímulo mantendo o padrão de movimento.';
    if (e.last?.feeling === 'dor') { priority = 4; reason = 'Dor ou incômodo relatado: vale trocar por uma variação mais confortável.'; }
    else if (e.notWorking >= 2) { priority = 3; reason = `Não pegou em ${e.notWorking} sessões seguidas.`; }
    else if (e.suggestion?.action === 'plato') { priority = 2; reason = 'Sem progresso: uma variação nova pode destravar.'; }
    return { e, i, priority, reason };
  }).sort((a, b) => b.priority - a.priority || a.i - b.i);

  const out = [];
  const taken = new Set();
  for (const s of scored) {
    if (out.length >= limit) break;
    const p = patternOf(s.e.exerciseId);
    const cur = canonicalId(s.e.exerciseId);
    const alts = p.options.filter(opt => opt.id !== cur && !inProgram.has(opt.id) && !taken.has(opt.id));
    if (!alts.length) continue;
    const pick = alts.find(a => !avoid.has(a.id)) || alts[0];
    taken.add(pick.id);
    out.push({ rowId: s.e.rowId, from: { id: cur, name: s.e.name }, to: { id: pick.id, name: pick.name }, alternatives: alts.map(a => ({ id: a.id, name: a.name })), pattern: p.label, reason: s.reason, priority: s.priority });
  }
  return { suggestions: out, limit, eligible: eligible.length };
}

// ---------- novo ciclo: carga de partida ----------

// Pico do ciclo anterior: maior carga numérica de trabalho (fora das semanas de deload aplicado).
export function peakLoad(history = [], deloadWeeks = new Set()) {
  let peak = null;
  for (const h of history) {
    if (h.week_no != null && deloadWeeks.has(h.week_no)) continue;
    const v = parseNum(h.load_value);
    if (typeof v === 'number' && v > 0 && (peak == null || v > peak)) peak = v;
  }
  return peak;
}

// Padrão de 80%: na fase Adaptação a faixa de reps sobe +5 em relação à ficha, e o fim do ciclo
// (Intensificação) trabalhou 3 reps abaixo; pela equivalência de repetições isso dá algo perto de 80%.
export const DEFAULT_START_PCT = 80;
export function startLoad(peak, pct = DEFAULT_START_PCT) {
  if (peak == null) return null;
  return Math.max(0.5, roundHalf(peak * (pct / 100)));
}
