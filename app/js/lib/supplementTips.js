// Dicas gerais sobre os suplementos com respaldo científico mais sólido
// (creatina, whey protein, cafeína) — não é prescrição individual.
const TIPS = [
  { nome: 'Creatina', dica: '3-5g por dia, todos os dias (inclusive no descanso) — não precisa de fase de saturação' },
  { nome: 'Whey Protein', dica: 'Proteína de rápida absorção — útil quando é difícil bater a meta diária só com comida' },
  { nome: 'Cafeína', dica: '150-300mg (1-2 xícaras de café) 30-60min antes do treino pode melhorar o desempenho' },
  { nome: 'Creatina', dica: 'O efeito é cumulativo — resultado aparece em semanas de uso constante, não numa dose só' },
  { nome: 'Whey Protein', dica: 'Não substitui refeição — é um complemento, comida de verdade vem sempre primeiro' },
  { nome: 'Cafeína', dica: 'Evite no fim da tarde/noite — pode atrapalhar o sono, que também é parte da recuperação' },
];

export function getSupplementTip(seed) {
  const index = ((seed % TIPS.length) + TIPS.length) % TIPS.length;
  return TIPS[index];
}
