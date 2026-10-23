// Dicas gerais de suplementação mostradas no Treino, uma por dia. Conteúdo
// do Guia de Bolso revisado (out/2026), só dos suplementos com evidência
// forte ou moderada — educação, não prescrição individual.
const TIPS = [
  { nome: 'Creatina', dica: '3 a 5 g por dia, todos os dias (inclusive no descanso). A saturação é opcional, não obrigatória.' },
  { nome: 'Creatina', dica: 'O efeito é cumulativo: o resultado aparece em semanas de uso constante, não numa dose só.' },
  { nome: 'Creatina', dica: 'Não precisa beber água extra por causa dela: manter a hidratação normal do dia já basta.' },
  { nome: 'Whey protein', dica: 'É conveniência, não mágica: o que importa é bater a proteína do dia, com ou sem whey.' },
  { nome: 'Whey protein', dica: 'Tem intolerância à lactose? O isolado ou o hidrolisado costumam cair melhor que o concentrado.' },
  { nome: 'Cafeína', dica: 'A dose que funciona fica entre 3 e 6 mg por kg, cerca de 60 minutos antes do treino.' },
  { nome: 'Cafeína', dica: 'Evite no fim da tarde e à noite: atrapalha o sono, que também é parte da recuperação.' },
  { nome: 'Cafeína', dica: 'Um café coado tem por volta de 95 mg. Às vezes 1 ou 2 xícaras antes do treino já resolvem.' },
  { nome: 'Magnésio', dica: 'Não é ergogênico direto: o benefício estudado é no sono. Bisglicinato ou citrato, à noite.' },
  { nome: 'Vitamina D', dica: 'Pouco sol e treino em lugar fechado? Vale medir a vitamina D no exame antes de suplementar.' },
  { nome: 'Suplementos', dica: 'Comida de verdade vem primeiro. Suplemento ajuda a fechar lacunas, não substitui a base.' },
  { nome: 'Suplementos', dica: 'Usa remédio contínuo? Fale comigo antes de começar qualquer suplemento novo.' },
];

export function getSupplementTip(seed) {
  const index = ((seed % TIPS.length) + TIPS.length) % TIPS.length;
  return TIPS[index];
}
