// Regras de progressão de carga, posição no mesociclo e volume semanal dos
// clientes presenciais. Funções puras (sem Supabase) pra poder testar sozinhas.
//
// Fonte das regras: manuais do Belmiro de Salles (pasta de referências):
//  - dupla progressão: sobe as reps até o teto da faixa, aí sobe 5-10% da carga
//    e volta pro piso da faixa; ficar ABAIXO da faixa pesa mais contra do que parar
//    uns reps antes da falha dentro dela;
//  - séries semanais por grupamento: iniciante 1-5 · intermediário 6-10 ·
//    avançado 10-30 (até ~45 no quadríceps);
//  - mesociclo curto com semana de deload no fim.
// O QUE NÃO VEM DO LIVRO (padrões meus, ajustáveis aqui): o deload (-10% de carga
// e metade das séries) e o passo mínimo de 1 kg no arredondamento.

export const PROGRESSION = {
  increasePct: 0.05,     // piso do "5-10%" do método; o teto (10%) aparece na explicação
  increaseMaxPct: 0.10,
  minStepKg: 1,
  reducePct: 0.05,       // quando ficou abaixo do piso da faixa
  plateauSessions: 3,    // sessões seguidas sem evoluir = alerta de platô
};

export const DELOAD = { loadFactor: 0.9, setsFactor: 0.5 };

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

// "RIR 2" → 2 · "RIR 1-2" → 1 (o mais exigente) · sem RIR → null
export function parseTargetRir(method) {
  if (method == null) return null;
  const m = String(method).match(/RIR\s*[:=]?\s*(\d+)/i);
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

// ---------- mesociclo ----------

// Semana corrente (1..total) → posição dentro do bloco curto. Com deload ligado,
// a última semana do bloco é o deload. Sem semana definida → null.
export function mesoPosition(currentWeek, length = 4, deload = true) {
  const week = Number(currentWeek);
  if (!week || week < 1) return null;
  const len = Math.max(2, Number(length) || 4);
  const pos = ((week - 1) % len) + 1;
  return {
    week,
    pos,
    length: len,
    cycle: Math.floor((week - 1) / len) + 1,
    isDeload: !!deload && pos === len,
    weeksToDeload: deload ? len - pos : null,
  };
}

// ---------- progressão de carga ----------

// history: registros do MESMO exercício, do mais novo pro mais antigo
// ({load_value, reps_done, rir_done, logged_on}); latest = history[0].
// Devolve { action, nextLoad, reason } com action em:
//   subir · manter · reduzir · plato · deload · registrar · sem-dado
export function suggestNext({ history = [], repsRange, targetRir, isDeload = false }) {
  const latest = history[0];
  const load = latest ? parseNum(latest.load_value) : null;
  if (load == null) return { action: 'sem-dado', nextLoad: null, reason: 'Ainda sem carga registrada.' };

  if (isDeload) {
    return {
      action: 'deload',
      nextLoad: roundHalf(load * DELOAD.loadFactor),
      reason: `Carga −${Math.round((1 - DELOAD.loadFactor) * 100)}% e metade das séries nesta semana.`,
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
      reason: `Fez ${reps} reps, abaixo da faixa (${repsRange.min}-${repsRange.max}): carga pesada demais.`,
    };
  }

  const rir = latest.rir_done;
  if (reps >= repsRange.max) {
    if (targetRir != null && rir != null && rir < targetRir) {
      return {
        action: 'manter',
        nextLoad: load,
        reason: `Bateu o teto (${reps} reps), mas com RIR ${rir} (alvo ${targetRir}): sustente a carga.`,
      };
    }
    const up = Math.max(load * PROGRESSION.increasePct, PROGRESSION.minStepKg);
    const next = roundHalf(load + up);
    const top = roundHalf(load * (1 + PROGRESSION.increaseMaxPct));
    return {
      action: 'subir',
      nextLoad: next,
      reason: `Bateu o teto da faixa (${reps}/${repsRange.max})${rir == null ? '' : ` com RIR ${rir}`}: sobe 5% (até 10% = ${fmt(top)} kg) e volta pro piso (${repsRange.min}).`,
    };
  }

  // dentro da faixa: platô se as últimas sessões ficaram iguais
  const recent = history.slice(0, PROGRESSION.plateauSessions);
  if (recent.length >= PROGRESSION.plateauSessions) {
    const sameLoad = recent.every(h => parseNum(h.load_value) === load);
    const repsFlat = recent.every(h => h.reps_done != null) && recent[0].reps_done <= recent[recent.length - 1].reps_done;
    if (sameLoad && repsFlat) {
      return {
        action: 'plato',
        nextLoad: load,
        reason: `${PROGRESSION.plateauSessions} sessões sem evoluir (carga e reps iguais): revise sono, volume ou o exercício.`,
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
