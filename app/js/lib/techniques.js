// Técnicas avançadas de treino (De Salles, "Métodos de Treinamento para Força e Hipertrofia", e o curso de
// treino feminino). Servem pra o treinador marcar, por exercício e por sessão, o que foi feito.
//  - level: nível mínimo em que o método costuma ser liberado (aviso suave, não bloqueia).
//  - when: momento da sessão em que o método rende mais (regra do livro).
//  - comparable: false = as reps/cargas da sessão não são comparáveis com a faixa da ficha; a próxima
//    carga sugerida fica "manter" em vez de "subir" (evita subir carga por causa de rest-pause, por exemplo).
export const TECHNIQUES = [
  { key: 'biset', group: 'Combinação', label: 'Bi-set', level: 'iniciante', comparable: true,
    how: 'Dois exercícios seguidos, sem descanso entre eles (agonista-antagonista ou alternado por segmento).', when: 'Fim da sessão' },
  { key: 'triset', group: 'Combinação', label: 'Tri-set', level: 'intermediario', comparable: true,
    how: 'Três exercícios seguidos, sem descanso entre eles.', when: 'Fim da sessão' },
  { key: 'pre_exaustao', group: 'Combinação', label: 'Pré-exaustão', level: 'intermediario', comparable: false,
    how: 'Isolado do músculo-alvo antes do composto, pra o alvo não ficar limitado por um músculo auxiliar. A carga do composto cai.', when: 'Início da sessão' },
  { key: 'exaustao', group: 'Falha e intensidade', label: 'Exaustão (até a falha)', level: 'intermediario', comparable: true,
    how: 'Série até a falha concêntrica.', when: 'Última série do exercício' },
  { key: 'rest_pause', group: 'Falha e intensidade', label: 'Rest-pause', level: 'avancado', comparable: false,
    how: 'Vai até a falha, descansa 10-30 s e faz mais reps até nova falha. Repete 2-3 vezes.', when: 'Meio pro fim da sessão' },
  { key: 'drop_set', group: 'Falha e intensidade', label: 'Drop set', level: 'intermediario', comparable: false,
    how: 'Na falha, reduz a carga (20-100%) sem descanso e continua. 1 a 3 reduções.', when: 'Meio/fim da sessão' },
  { key: 'stripset', group: 'Falha e intensidade', label: 'Stripset', level: 'avancado', comparable: false,
    how: 'Como o drop set, mas com reduções pequenas (5-10%) e várias seguidas.', when: 'Fim da sessão' },
  { key: 'sst', group: 'Falha e intensidade', label: 'SST', level: 'avancado', comparable: false,
    how: 'Mistura de drop set com rest-pause: 6-10 reps até a falha, 10-20 s de pausa, repete.', when: 'Fim da sessão' },
  { key: 'drop_mecanico', group: 'Falha e intensidade', label: 'Drop set mecânico', level: 'avancado', comparable: false,
    how: 'Em vez de reduzir carga, muda o ângulo/alavanca do movimento pra ficar mais fácil conforme cansa.', when: 'Fim da sessão' },
  { key: 'cluster', group: 'Intervalo', label: 'Cluster set', level: 'avancado', comparable: false,
    how: 'Série quebrada em blocos de 2-5 reps com pausas de 10-30 s entre os blocos (pausa programada, antes da falha).', when: 'Início da sessão' },
  { key: 'gvt', group: 'Intervalo', label: 'GVT (10×10)', level: 'avancado', comparable: false,
    how: '10 séries de 10 no mesmo exercício, ~60% de 1RM, descanso de 60-90 s.', when: '2-3 básicos por sessão' },
  { key: 'piramide_cresc', group: 'Carga', label: 'Pirâmide crescente', level: 'iniciante', comparable: false,
    how: 'A carga sobe e as reps descem a cada série.', when: 'Início da sessão' },
  { key: 'piramide_decresc', group: 'Carga', label: 'Pirâmide decrescente', level: 'iniciante', comparable: false,
    how: 'A carga desce e as reps sobem a cada série. Menor esforço percebido pro mesmo ganho.', when: 'Meio da sessão' },
  { key: 'parciais', group: 'Amplitude e tempo', label: 'Repetições parciais', level: 'avancado', comparable: false,
    how: 'Depois da falha, continua com amplitude reduzida, na parte de maior tensão.', when: 'Fim do exercício' },
  { key: 'forcadas', group: 'Amplitude e tempo', label: 'Repetições forçadas', level: 'avancado', comparable: false,
    how: 'Parceiro ajuda no mínimo necessário pra passar da falha. Exige treinador experiente.', when: 'Fim da sessão' },
  { key: 'roubada', group: 'Amplitude e tempo', label: 'Roubada', level: 'avancado', comparable: false,
    how: 'Usa impulso do corpo pra subir e controla a descida (ênfase no excêntrico).', when: 'Fim do exercício' },
  { key: 'excentrico', group: 'Amplitude e tempo', label: 'Excêntrico / negativo', level: 'avancado', comparable: false,
    how: 'Carga acima do 1RM concêntrico com ajuda pra subir; só a descida é controlada.', when: 'Fim da sessão' },
  { key: 'isometria', group: 'Amplitude e tempo', label: 'Isometria entre séries', level: 'avancado', comparable: true,
    how: 'Contração isométrica no ponto de maior tensão, até 30 s, entre as séries.', when: 'Fim da sessão' },
];

const BY_KEY = new Map(TECHNIQUES.map(t => [t.key, t]));
export const techniqueByKey = (k) => BY_KEY.get(k) || null;
export const techniqueLabel = (k) => BY_KEY.get(k)?.label || k || '';

const RANK = { iniciante: 0, intermediario: 1, avancado: 2, extremamente_avancado: 2 };
export const LEVEL_NAME = { iniciante: 'iniciante', intermediario: 'intermediário', avancado: 'avançado' };

// true quando o método costuma ser liberado só em nível acima do do cliente
export function aboveLevel(techKey, levelKey) {
  const t = BY_KEY.get(techKey);
  if (!t || !(levelKey in RANK)) return false;
  return RANK[t.level] > RANK[levelKey];
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const ALIASES = {
  biset: ['biset', 'bi set', 'superset agonista antagonista', 'superset por segmento'],
  triset: ['triset', 'tri set'],
  pre_exaustao: ['pre exaustao'],
  exaustao: ['falha concentrica', 'exaustao', 'ate a falha'],
  rest_pause: ['rest pause', 'restpause'],
  drop_set: ['dropset', 'drop set', 'metodo decrescente'],
  stripset: ['stripset', 'strip set'],
  sst: ['sst'],
  drop_mecanico: ['drop set mecanico', 'drop mecanico'],
  cluster: ['cluster set', 'cluster'],
  gvt: ['gvt', 'superbomba gvt', 'superbomba'],
  piramide_cresc: ['piramide crescente'],
  piramide_decresc: ['piramide decrescente'],
  parciais: ['repeticoes parciais', 'parciais'],
  forcadas: ['repeticoes forcadas', 'forcadas'],
  roubada: ['roubada'],
  excentrico: ['excentrico', 'negativo'],
  isometria: ['isometria entre as series', 'isometria'],
};
// "Rest-Pause", "Dropset", "Biset"... escritos no campo Método da ficha viram a técnica pré-selecionada
const PAIRS = Object.entries(ALIASES).flatMap(([key, list]) => list.map(a => [a, key])).sort((x, y) => y[0].length - x[0].length);
export function techniqueFromMethod(method) {
  const m = ` ${norm(method)} `;
  if (m.trim() === '') return null;
  for (const [alias, key] of PAIRS) if (m.includes(` ${alias} `)) return key; // palavras inteiras; a mais longa ganha
  return null;
}
