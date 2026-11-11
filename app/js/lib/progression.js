// Periodização, progressão de carga e volume dos clientes presenciais.
// Funções puras (sem Supabase) pra poder testar sozinhas.
//
// MACROCICLO: reproduz a "Periodização 16 Semanas" do FitPro (4 mesociclos).
// Cada fase define o RIR alvo, o volume relativo, quantas reps somar/subtrair da
// faixa base da ficha (que é a faixa do Desenvolvimento) e o multiplicador da carga.
// Tudo editável por cliente (workout_programs.periodization); estes são os padrões.
//
// PRÓXIMA CARGA (regra "híbrida", escolhida em 2026-11-08): usa o multiplicador
// da fase da planilha, mas só sugere subir quando o cliente bateu o teto da faixa
// de reps da fase (e o RIR não ficou abaixo do alvo). Abaixo do piso da faixa:
// reduz (o livro do De Salles pesa isso mais do que parar uns reps antes da falha).
//
// DELOAD é por sinal, não por calendário (guia do FitPro): o app só recomenda; o
// treinador decide marcando "Aplicar deload" nos Sinais do cliente da semana.
//
// Volume semanal por grupo (De Salles): iniciante 1-5 · intermediário 6-10 ·
// avançado 10-30 (até ~45 no quadríceps).

import { techniqueByKey } from './techniques.js';
export const DEFAULT_PHASES = [
  { key: 'adaptacao', label: 'Adaptação', mesociclo: 1, from: 1, to: 4, rir: 'RIR 3-4', volume: 'MEV (base)', repsDelta: 5, loadFactor: 1.02 },
  { key: 'desenvolvimento', label: 'Desenvolvimento', mesociclo: 2, from: 5, to: 10, rir: 'RIR 2', volume: 'MAV (zona boa)', repsDelta: 0, loadFactor: 1.05 },
  { key: 'intensificacao', label: 'Intensificação', mesociclo: 3, from: 11, to: 15, rir: 'RIR 0-1', volume: 'MAV alto / MRV pontual', repsDelta: -3, loadFactor: 1.07 },
  { key: 'deload', label: 'Consolidação / Deload', mesociclo: 4, from: 16, to: 16, rir: 'RIR 4+ (leve)', volume: 'Deload: reduzir 30-40%', repsDelta: 4, loadFactor: 0.65, isDeload: true },
];

export const ACTION_TEXT = {
  normal: 'Sem evolução? Revise técnica → progressão de carga → só então volume (Pirâmide De Salles-Muzy).',
  deload: 'Deload é por sinal real, não calendário: só aplique se houver queda de performance ou fadiga.',
};

export const PROGRESSION = {
  reducePct: 0.05,       // quando ficou abaixo do piso da faixa de reps
  plateauSessions: 3,    // sessões seguidas sem evoluir = alerta de platô
  fallbackFactor: 1.05,  // semana não definida: usa o passo do Desenvolvimento
  fallbackDeloadFactor: 0.65,
};

// Sensação do exercício na sessão (marcada pelo treinador junto da carga)
export const FEELINGS = [
  { key: 'pegou_bem', label: 'Pegou bem' },
  { key: 'regular', label: 'Regular' },
  { key: 'nao_pegou', label: 'Não pegou' },
  { key: 'dor', label: 'Dor / incômodo' },
];
export function feelingLabel(key) { return FEELINGS.find(f => f.key === key)?.label || ''; }

// quantas sessões seguidas (só as que têm sensação marcada) o exercício "não pegou"
export function notWorkingStreak(history = []) {
  let n = 0;
  for (const h of history) {
    if (!h.feeling) continue;
    if (h.feeling === 'nao_pegou') n++; else break;
  }
  return n;
}

export const LEVEL_BANDS = {
  iniciante: { min: 1, max: 5, label: 'Iniciante' },
  intermediario: { min: 6, max: 10, label: 'Intermediário' },
  avancado: { min: 10, max: 30, label: 'Avançado' },
  extremamente_avancado: { min: 10, max: 30, label: 'Extremamente avançado' },
};
export const QUADRICEPS_MAX = 45;

// ---------- leitura dos campos de texto da ficha ----------

export function parseNum(str) {
  if (str == null) return null;
  const match = String(str).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

// "8-10" → {min:8,max:10} · "12" → {12,12} · "10/lado" → {10,10}
// "30s/lado", "20-30s" (tempo) e "até a falha" → null (sem faixa de reps pra progredir)
export function parseRepsRange(reps) {
  if (reps == null) return null;
  const s = String(reps).toLowerCase();
  if (/\d\s*(s|seg|min)\b/.test(s)) return null;
  const nums = s.match(/\d+/g);
  if (!nums) return null;
  const a = Number(nums[0]);
  const b = nums.length > 1 ? Number(nums[1]) : a;
  if (b < a) return null;
  return { min: a, max: b };
}

// "RIR 3-4" → 3 · "RIR 2" → 2 · "RIR 0-1" → 0 · "RIR 4+ (leve)" → 4 · sem RIR → null
export function parseRirFloor(text) {
  if (text == null) return null;
  const m = String(text).match(/RIR\s*[:=]?\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

// "3" → 3 · "3-4" → 3 (o piso conta) · vazio → 0
export function parseSets(sets) {
  const n = parseNum(sets);
  return n && n > 0 ? Math.floor(n) : 0;
}

// número no formato brasileiro (82,5)
export function fmt(n) {
  return String(n).replace('.', ',');
}

export function roundHalf(x) {
  return Math.round(x * 2) / 2;
}

// ---------- macrociclo ----------

// Fases do programa: as personalizadas (jsonb) se válidas, senão as padrão.
export function getPhases(program) {
  const p = program?.periodization;
  if (!Array.isArray(p) || !p.length) return DEFAULT_PHASES;
  const ok = p.every(x => x && Number.isFinite(Number(x.from)) && Number.isFinite(Number(x.to)) && Number(x.from) <= Number(x.to) && x.label);
  return ok ? p.map(x => ({ ...x, from: Number(x.from), to: Number(x.to), repsDelta: Number(x.repsDelta) || 0, loadFactor: Number(x.loadFactor) || 1 })) : DEFAULT_PHASES;
}

// Valida uma tabela de fases editada à mão. Devolve texto de erro ou null.
export function validatePhases(phases) {
  if (!phases.length) return 'Defina pelo menos uma fase.';
  let prevTo = 0;
  for (const p of phases) {
    if (!Number.isInteger(p.from) || !Number.isInteger(p.to) || p.from < 1 || p.to < p.from) return `Semanas inválidas em "${p.label}".`;
    if (p.from <= prevTo) return `As semanas de "${p.label}" se sobrepõem à fase anterior.`;
    if (!(p.loadFactor > 0 && p.loadFactor < 2)) return `Multiplicador de carga inválido em "${p.label}".`;
    prevTo = p.to;
  }
  return null;
}

// Semana corrente → fase, mesociclo e alertas. Fora de qualquer fase / sem semana → null.
// "Troca de fase" acende na 1ª semana de cada fase depois da primeira (5, 11 e 16 no padrão).
export function weekInfo(week, phases = DEFAULT_PHASES) {
  const w = Number(week);
  if (!w || w < 1) return null;
  const index = phases.findIndex(p => w >= p.from && w <= p.to);
  if (index < 0) return null;
  const phase = phases[index];
  return {
    week: w,
    phase,
    index,
    mesociclo: phase.mesociclo ?? index + 1,
    isChange: index > 0 && w === phase.from,
    weeksLeft: phase.to - w,
    action: phase.isDeload ? ACTION_TEXT.deload : ACTION_TEXT.normal,
  };
}

// Faixa de reps da fase: a faixa da ficha (base = Desenvolvimento) deslocada pelo delta.
export function phaseRange(reps, repsDelta = 0) {
  const base = parseRepsRange(reps);
  if (!base) return null;
  return { min: Math.max(1, base.min + repsDelta), max: Math.max(1, base.max + repsDelta) };
}

export function phaseRepsLabel(reps, repsDelta = 0) {
  const r = phaseRange(reps, repsDelta);
  if (!r) return '—';
  const suffix = /\/\s*lado/i.test(String(reps)) ? '/lado' : '';
  return (r.min === r.max ? String(r.min) : `${r.min}-${r.max}`) + suffix;
}

// ---------- sinais do cliente (decisão de deload é do treinador) ----------

// signals: do mais novo pro mais antigo. Recomenda deload se a recuperação foi ruim
// numa das 2 últimas semanas registradas, ou se não evoluiu nas 2 últimas.
export function deloadRecommended(signals = []) {
  const recent = signals.slice(0, 2);
  if (!recent.length) return false;
  return recent.some(s => s.recuperacao === 'ruim') || (recent.length >= 2 && recent.every(s => s.evoluiu === false));
}

// ---------- progressão de carga ----------

// history: registros do MESMO exercício (sem os de semana de deload aplicado), do mais
// novo pro mais antigo ({load_value, reps_done, rir_done}). repsRange já é o da fase.
// Devolve { action, nextLoad, reason } com action em:
//   subir · manter · reduzir · plato · deload · registrar · sem-dado
export function suggestNext({ history = [], repsRange, rirFloor = null, phase = null, deloadApplied = false, deloadFactor = PROGRESSION.fallbackDeloadFactor }) {
  const latest = history[0];
  const load = latest ? parseNum(latest.load_value) : null;
  if (load == null) return { action: 'sem-dado', nextLoad: null, reason: 'Ainda sem carga registrada.' };

  if (deloadApplied) {
    return {
      action: 'deload',
      nextLoad: roundHalf(load * deloadFactor),
      reason: `Carga ×${fmt(deloadFactor)} e menos volume nesta semana (aplicado por você).`,
    };
  }
  if (phase?.isDeload) {
    return {
      action: 'manter',
      nextLoad: load,
      reason: 'Semana de consolidação: mantenha as cargas. Deload só se os sinais do cliente indicarem.',
    };
  }

  if (latest.feeling === 'dor') {   // dor ou incômodo na última sessão: não sobe carga até o treinador avaliar
    return {
      action: 'manter',
      nextLoad: load,
      reason: 'Dor ou incômodo relatado na última sessão: não suba a carga até avaliar o exercício.',
    };
  }

  const tech = techniqueByKey(latest.technique);
  if (tech && !tech.comparable) {   // rest-pause, drop set etc.: reps e carga não são comparáveis com a faixa da ficha
    return {
      action: 'manter',
      nextLoad: load,
      reason: `Última sessão com ${tech.label}: as reps não são comparáveis com a faixa da fase. Mantenha a carga e registre a próxima sessão sem a técnica pra decidir.`,
    };
  }

  const reps = latest.reps_done;
  if (reps == null || !repsRange) {
    return { action: 'registrar', nextLoad: load, reason: 'Sem reps registradas (ou sem faixa de reps na ficha): não dá pra sugerir.' };
  }

  if (reps < repsRange.min) {
    return {
      action: 'reduzir',
      nextLoad: roundHalf(load * (1 - PROGRESSION.reducePct)),
      reason: `Fez ${reps} reps, abaixo da faixa da fase (${repsRange.min}-${repsRange.max}): carga pesada demais.`,
    };
  }

  const rir = latest.rir_done;
  const factor = phase?.loadFactor ?? PROGRESSION.fallbackFactor;
  if (reps >= repsRange.max) {
    if (rirFloor != null && rir != null && rir < rirFloor) {
      return {
        action: 'manter',
        nextLoad: load,
        reason: `Bateu o teto (${reps} reps), mas com RIR ${rir} (alvo da fase ${rirFloor}+): sustente a carga.`,
      };
    }
    const next = Math.max(roundHalf(load * factor), load + 0.5);
    return {
      action: 'subir',
      nextLoad: next,
      reason: `Bateu o teto da faixa (${reps}/${repsRange.max})${rir == null ? '' : ` com RIR ${rir}`}: passo da fase ×${fmt(factor)}.`,
    };
  }

  // dentro da faixa: platô = nem a carga nem as reps subiram nas últimas sessões
  // (subir reps com a mesma carga é progressão, não platô)
  const win = history.slice(0, PROGRESSION.plateauSessions);
  if (win.length >= PROGRESSION.plateauSessions) {
    const oldest = win[win.length - 1];
    const loadUp = load > (parseNum(oldest.load_value) ?? Infinity);
    const repsKnown = win.every(h => h.reps_done != null);
    const repsUp = repsKnown && reps > oldest.reps_done;
    if (!loadUp && !repsUp) {
      return {
        action: 'plato',
        nextLoad: load,
        reason: 'Revise técnica → progressão de carga → só depois volume (Pirâmide).',
      };
    }
  }

  return { action: 'manter', nextLoad: load, reason: `Dentro da faixa (${repsRange.min}-${repsRange.max}): busque ${reps + 1} reps com a mesma carga.` };
}

// ---------- volume semanal ----------

// rows: [{ sets, muscle }] de todos os dias da ficha (cada dia conta 1x por semana)
export function weeklyVolume(rows, { ignore = /cardio|mobil|alongam/i } = {}) {
  const byMuscle = {};
  for (const r of rows) {
    if (!r.muscle || ignore.test(r.muscle)) continue;
    byMuscle[r.muscle] = (byMuscle[r.muscle] || 0) + parseSets(r.sets);
  }
  return Object.entries(byMuscle)
    .map(([muscle, sets]) => ({ muscle, sets }))
    .filter(x => x.sets > 0)
    .sort((a, b) => b.sets - a.sets);
}

// faixa-alvo de um grupamento pro nível (quadríceps tem teto maior)
export function bandFor(level, muscle) {
  const base = LEVEL_BANDS[level] || null;
  if (!base) return null;
  const isQuad = /quadr[ií]ceps/i.test(muscle || '');
  return { min: base.min, max: isQuad && base.max >= 30 ? QUADRICEPS_MAX : base.max };
}

// abaixo / dentro / acima da faixa
export function volumeStatus(sets, band) {
  if (!band) return 'sem-nivel';
  if (sets < band.min) return 'abaixo';
  if (sets > band.max) return 'acima';
  return 'dentro';
}
