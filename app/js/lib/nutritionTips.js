const TIPS = [
  {
    pre: 'Carboidrato leve 30–60min antes (banana, pão integral, aveia)',
    pos: 'Proteína + carboidrato até 1h depois (ovos, whey, arroz, batata-doce)',
    regra: 'Beba água ao longo de todo o dia, não só perto do treino',
  },
  {
    pre: 'Evite treinar em jejum prolongado — um lanche leve ajuda no rendimento',
    pos: 'Prioriza proteína de qualidade (frango, ovos, whey) na próxima refeição',
    regra: 'Durma bem — o sono também é parte da recuperação muscular',
  },
  {
    pre: 'Fruta + um punhado de castanhas é uma boa opção pré-treino',
    pos: 'Reponha líquidos: cada litro suado, mais um litro de água no dia',
    regra: 'Distribua proteína em todas as refeições, não só no pós-treino',
  },
  {
    pre: 'Se o treino for cedo, um café + banana já ajuda no gás',
    pos: 'Whey protein é prático, mas comida de verdade funciona igual bem',
    regra: 'Vegetais e fibras todo dia ajudam na digestão e na recuperação',
  },
  {
    pre: 'Corrida ou treino longo? Carboidrato de fácil digestão é o ideal antes',
    pos: 'Depois da corrida, foque em repor energia: carboidrato + um pouco de proteína',
    regra: 'Evite excesso de álcool e ultraprocessados nos dias de treino',
  },
  {
    pre: 'Pouca energia no treino? Pode ser falta de carboidrato nas refeições anteriores',
    pos: 'Não pule refeições após treinar — o corpo precisa de nutrientes pra recuperar',
    regra: 'Consistência importa mais que perfeição: coma bem na maior parte do tempo',
  },
];

export function getNutritionTip(seed) {
  const index = ((seed % TIPS.length) + TIPS.length) % TIPS.length;
  return TIPS[index];
}
