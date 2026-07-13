// Protocolo de 7 dobras (Jackson & Pollock, 1978/1980) + equação de Siri.
// Fórmula pública, padrão em avaliação física — sem depender de nenhum
// software externo.

export const SKINFOLD_SITES = [
  { key: 'peitoral', label: 'Peitoral' },
  { key: 'axilar_media', label: 'Axilar Média' },
  { key: 'triceps', label: 'Tríceps' },
  { key: 'subescapular', label: 'Subescapular' },
  { key: 'abdominal', label: 'Abdominal' },
  { key: 'suprailiaca', label: 'Supra-ilíaca' },
  { key: 'coxa', label: 'Coxa' },
];

export function sumSkinfolds(values) {
  return SKINFOLD_SITES.reduce((sum, site) => sum + (Number(values[site.key]) || 0), 0);
}

export function calcBodyFat({ sexo, age, sum }) {
  if (!sexo || !age || !sum) return null;
  const density = sexo === 'M'
    ? 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * age
    : 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * age;
  const bodyFatPct = (495 / density) - 450;
  return { density, bodyFatPct };
}
