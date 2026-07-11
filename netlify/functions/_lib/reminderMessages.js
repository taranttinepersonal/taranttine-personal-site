// Rotated round-robin per client (see check-inactive-clients.js) so nobody
// gets the same nudge twice in a row, however many times they skip.
module.exports = [
  { title: 'Ei, cadê você? 👀', body: 'To de olho na sua ausência! Bora treinar, vai que hoje é o dia.' },
  { title: 'Sentimos sua falta! 💪', body: 'Já faz uns dias que você não aparece. Bora retomar hoje?' },
  { title: 'Alerta de sumiço 🚨', body: 'Você desapareceu! O treino tá com saudade (eu também 😄).' },
  { title: 'Psiu! 👋', body: 'Reparei sua ausência por aqui... Bora resolver isso hoje?' },
  { title: 'Foi sequestrado(a) pelo sofá? 🛋️', body: 'Vem resgatar seu treino, ele tá te esperando!' },
  { title: 'Sumiço detectado 🕵️', body: 'Essa já não é a primeira vez, hein! Bora voltar com tudo?' },
  { title: 'Partiu treinar? 🔥', body: 'Um dia sem treino é um dia sem gás. Bora recuperar o ritmo?' },
  { title: 'To de olho em você! 👀💪', body: 'Chega de matar aula, vem treinar que eu preparei tudo certinho.' },
  { title: 'Oxe, sumiu! 😤', body: 'Seu treino não anda sozinho não! Bora aparecer hoje?' },
  { title: 'Notificação de saudade 💌', body: 'O treino perguntou de você. Bora não deixar ele esperando?' },
];
