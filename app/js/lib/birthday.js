const QUOTES = [
  'Mais um ano de vida — e de garra pra continuar evoluindo. Bora com tudo! 💪',
  'Que esse novo ano venha cheio de força, saúde e conquistas. Parabéns! 🎉',
  'Você já provou que constância vence. Feliz aniversário, continue assim!',
  'Cada treino é um passo. Hoje é dia de comemorar quantos passos você já deu. Parabéns!',
  'Que a disciplina de hoje construa a versão mais forte de você amanhã. Feliz aniversário!',
];

export function isBirthdayToday(birthDate) {
  if (!birthDate) return false;
  const today = new Date();
  const [, month, day] = birthDate.split('-').map(Number);
  return month === today.getMonth() + 1 && day === today.getDate();
}

export function getMotivationalQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}
