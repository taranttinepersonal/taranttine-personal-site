// Modelo de classificação do nível de treinamento (De Salles, 2025 — Manual para
// Avaliação Física e do Nível de Treinamento com Foco na Hipertrofia).
// 5 parâmetros pontuados de 1 a 4; a média final classifica o aluno:
// 1-1,9 iniciante · 2-2,9 intermediário · 3-3,9 avançado · 4 extremamente avançado.

export const FORCA_EXERCICIOS = [
  { key: 'supino', label: 'Supino Reto' },
  { key: 'agachamento', label: 'Agachamento' },
  { key: 'terra', label: 'Levantamento Terra' },
  { key: 'legpress', label: 'Leg Press' },
];

// % do peso corporal (carga ÷ peso corporal x 100) — limites superiores de cada faixa.
const FORCA_CUTOFFS = {
  M: {
    supino: [60, 100, 120],
    agachamento: [80, 120, 150],
    terra: [100, 150, 180],
    legpress: [135, 190, 200],
  },
  F: {
    supino: [40, 60, 80],
    agachamento: [60, 100, 130],
    terra: [80, 120, 160],
    legpress: [90, 140, 170],
  },
};

// Epley: 1RM estimado a partir de carga x repetições até a falha (repetições > 1).
export function estimateOneRM(cargaKg, reps) {
  const r = Number(reps) || 1;
  return r > 1 ? cargaKg * (1 + r / 30) : cargaKg;
}

export function scoreForcaRelativa({ exercicio, sexo, cargaKg, reps, pesoCorporalKg }) {
  if (!cargaKg || !pesoCorporalKg || !sexo) return null;
  const oneRM = estimateOneRM(Number(cargaKg), reps);
  const pct = (oneRM / Number(pesoCorporalKg)) * 100;
  const cutoffs = FORCA_CUTOFFS[sexo]?.[exercicio];
  if (!cutoffs) return null;
  let score = 4;
  if (pct <= cutoffs[0]) score = 1;
  else if (pct <= cutoffs[1]) score = 2;
  else if (pct <= cutoffs[2]) score = 3;
  return { oneRM, pct, score };
}

export function scoreTempoSemInterrupcao(meses) {
  if (meses == null || meses === '') return null;
  const m = Number(meses);
  if (m <= 2) return 1;
  if (m <= 12) return 2;
  if (m <= 36) return 3;
  return 4;
}

export function scoreDestreino(mesesParado) {
  if (mesesParado == null || mesesParado === '') return null;
  const m = Number(mesesParado);
  if (m >= 8) return 1;
  if (m >= 4) return 2;
  if (m >= 1) return 3;
  return 4;
}

export function scoreExperienciaPrevia(anos) {
  if (anos == null || anos === '') return null;
  const meses = Number(anos) * 12;
  if (meses <= 2) return 1;
  if (meses <= 12) return 2;
  if (meses <= 36) return 3;
  return 4;
}

// Regras do manual: se treinando agora, parâmetro 2 (destreino) é sempre 4 e o
// parâmetro 3 (experiência prévia) repete o parâmetro 1. Se parado, o parâmetro 1
// (tempo sem interrupção) é sempre 1.
export function computeTemporalScores({ currentlyTraining, mesesTreinoAtual, mesesDestreino, anosExperienciaPrevia }) {
  if (currentlyTraining) {
    const s1 = scoreTempoSemInterrupcao(mesesTreinoAtual);
    return { param1: s1, param2: s1 == null ? null : 4, param3: s1 };
  }
  const s2 = scoreDestreino(mesesDestreino);
  const s3 = scoreExperienciaPrevia(anosExperienciaPrevia);
  return { param1: s2 == null && s3 == null ? null : 1, param2: s2, param3: s3 };
}

export function average(scores) {
  const valid = scores.filter(s => typeof s === 'number' && !Number.isNaN(s));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function classificar(scoreFinal) {
  if (scoreFinal == null) return null;
  if (scoreFinal < 2) return { key: 'iniciante', label: 'Iniciante' };
  if (scoreFinal < 3) return { key: 'intermediario', label: 'Intermediário' };
  if (scoreFinal < 4) return { key: 'avancado', label: 'Avançado' };
  return { key: 'extremamente_avancado', label: 'Extremamente Avançado' };
}
