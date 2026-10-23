// Motor de prescrição: mesma lógica da planilha "Prescrição Taranttine"
// (Numbers), agora na plataforma. Tudo aqui é puro (sem DOM, sem Supabase),
// para poder ser testado e reaproveitado no PDF e no app do aluno.
//
// Cada alimento de uma refeição-modelo tem um papel:
//   P = fonte de proteína, C = carboidrato, G = gordura, L = livre (verduras),
//   X = porção fixa (ex: 1 pote de iogurte; conta nos macros mas não escala)
// e é ajustado para bater o macro do seu papel, na ordem C → P → G,
// descontando o que os outros papéis já trazem. L fica na quantidade-base.

let tacoCache = null;

export async function loadTaco() {
  if (tacoCache) return tacoCache;
  const res = await fetch('/app/data/taco.json');
  const json = await res.json();
  const map = new Map();
  json.alimentos.forEach(([id, nome, grupo, kcal, prot, carb, gord, fibra]) => {
    map.set(id, { id, nome, grupo, kcal, prot: prot || 0, carb: carb || 0, gord: gord || 0, fibra });
  });
  tacoCache = map;
  return map;
}

// Nomes curtos para o plano (a TACO usa nomes técnicos longos).
export const FRIENDLY = {
  1: 'Arroz integral cozido', 3: 'Arroz branco cozido', 7: 'Aveia em flocos', 52: 'Pão de forma integral',
  53: 'Pão francês', 70: 'Abobrinha cozida', 78: 'Alface', 88: 'Batata-doce cozida', 91: 'Batata inglesa cozida',
  100: 'Brócolis cozido', 109: 'Cenoura cozida', 129: 'Mandioca cozida', 142: 'Pepino', 149: 'Repolho',
  157: 'Tomate', 163: 'Abacate', 182: 'Banana prata', 214: 'Laranja pera', 222: 'Maçã fuji', 225: 'Mamão formosa',
  226: 'Mamão papaia', 235: 'Melancia', 239: 'Morango', 256: 'Uva itália', 260: 'Azeite de oliva extra virgem',
  301: 'Merluza assada', 377: 'Patinho grelhado', 410: 'Peito de frango grelhado', 439: 'Presunto magro',
  448: 'Iogurte natural', 456: 'Leite em pó desnatado', 461: 'Queijo minas frescal', 488: 'Ovo cozido', 507: 'Mel de abelha', 533: 'Cuscuz de milho',
  557: 'Amendoim', 561: 'Feijão carioca cozido', 567: 'Feijão preto cozido', 589: 'Castanha-do-pará', 594: 'Linhaça',
};

export function foodName(food) {
  return FRIENDLY[food.id] || food.nome;
}

// Alimentos próprios (custom_foods) entram no mesmo mapa da TACO com a
// chave "c:<id>" e, se tiverem grupo, nas listas de substituição.
let groups = null;
function currentGroups() { return groups || SUB_GROUPS; }

export function registerCustomFoods(taco, rows) {
  groups = SUB_GROUPS.map(g => ({ ...g, ids: [...g.ids] }));
  (rows || []).forEach(r => {
    const key = `c:${r.id}`;
    taco.set(key, {
      id: key, nome: r.nome, grupo: r.grupo || 'Alimentos próprios', kcal: Number(r.kcal), prot: Number(r.prot) || 0,
      carb: Number(r.carb) || 0, gord: Number(r.gord) || 0, fibra: r.fibra, custom: true,
      unidadeNome: r.unidade_nome || null, unidadeG: Number(r.unidade_g) || null, soUnidade: !!r.so_unidade,
    });
    if (r.grupo) {
      let g = groups.find(x => x.nome === r.grupo);
      if (!g) { g = { nome: r.grupo, ids: [] }; groups.push(g); }
      g.ids.push(key);
    }
  });
}

// Modelos do banco substituem os padrão de mesmo código; inativos somem.
export function mergeModels(rows) {
  const byCode = new Map(MODELS.map(m => [m.code, { ...m, padrao: true }]));
  (rows || []).forEach(r => {
    if (r.ativo === false) { byCode.delete(r.code); return; }
    byCode.set(r.code, { code: r.code, tipo: r.tipo, nome: r.nome, items: r.items, padrao: false, dbId: r.id });
  });
  return [...byCode.values()];
}

// Grupos de substituição: alimentos que se trocam entre si.
export const SUB_GROUPS = [
  { nome: 'Cereais e tubérculos', ids: [3, 1, 88, 129, 91, 533] },
  { nome: 'Pães e aveia', ids: [53, 52, 533, 7] },
  { nome: 'Feijões', ids: [561, 567] },
  { nome: 'Frutas', ids: [182, 222, 226, 225, 214, 239, 235, 256] },
  { nome: 'Carnes e peixes', ids: [410, 377, 301] },
  { nome: 'Proteínas do café e lanche', ids: [488, 461, 456, 439] },
  { nome: 'Gorduras boas', ids: [260, 589, 557, 163, 594] },
  { nome: 'Verduras e legumes', ids: [78, 157, 100, 70, 109, 149, 142] },
  { nome: 'Doces', ids: [507] },
];

export const MODELS = [
  { code: 'CAF-A', tipo: 'CAF', nome: 'Café tradicional', items: [[53, 50, 'C'], [488, 100, 'P'], [461, 30, 'P'], [226, 150, 'C']] },
  { code: 'CAF-B', tipo: 'CAF', nome: 'Café prático', items: [[448, 170, 'X'], [456, 20, 'P'], [7, 30, 'C'], [182, 90, 'C'], [594, 10, 'G']] },
  { code: 'CAF-C', tipo: 'CAF', nome: 'Café low carb', items: [[488, 150, 'P'], [461, 40, 'P'], [163, 80, 'G']] },
  { code: 'CAF-D', tipo: 'CAF', nome: 'Café com cuscuz', items: [[533, 120, 'C'], [488, 100, 'P'], [225, 150, 'C']] },
  { code: 'LAN-A', tipo: 'LAN', nome: 'Fruta + castanha', items: [[182, 90, 'C'], [589, 15, 'G']] },
  { code: 'LAN-B', tipo: 'LAN', nome: 'Iogurte + fruta', items: [[448, 170, 'X'], [456, 15, 'P'], [239, 100, 'C'], [7, 20, 'C']] },
  { code: 'LAN-C', tipo: 'LAN', nome: 'Sanduíche', items: [[52, 50, 'C'], [461, 30, 'P'], [439, 30, 'P'], [157, 40, 'L']] },
  { code: 'LAN-D', tipo: 'LAN', nome: 'Lanche low carb', items: [[488, 100, 'P'], [557, 20, 'G']] },
  { code: 'PRA-A', tipo: 'PRA', nome: 'Prato brasileiro com frango', items: [[3, 150, 'C'], [561, 100, 'C'], [410, 120, 'P'], [78, 40, 'L'], [157, 60, 'L'], [260, 5, 'G']] },
  { code: 'PRA-B', tipo: 'PRA', nome: 'Batata-doce com patinho', items: [[88, 200, 'C'], [377, 120, 'P'], [100, 80, 'L'], [260, 5, 'G']] },
  { code: 'PRA-C', tipo: 'PRA', nome: 'Prato low carb', items: [[377, 150, 'P'], [100, 100, 'L'], [70, 100, 'L'], [260, 10, 'G']] },
  { code: 'PRA-D', tipo: 'PRA', nome: 'Peixe com arroz integral', items: [[1, 150, 'C'], [567, 100, 'C'], [301, 150, 'P'], [109, 60, 'L'], [260, 5, 'G']] },
  { code: 'PRA-E', tipo: 'PRA', nome: 'Mandioca com frango', items: [[129, 150, 'C'], [410, 130, 'P'], [149, 50, 'L'], [157, 50, 'L'], [260, 5, 'G']] },
  { code: 'CEI-A', tipo: 'CEI', nome: 'Iogurte com aveia', items: [[448, 170, 'X'], [456, 10, 'P'], [7, 15, 'C']] },
  { code: 'CEI-B', tipo: 'CEI', nome: 'Ovos', items: [[488, 100, 'P'], [157, 50, 'L']] },
  { code: 'CEI-C', tipo: 'CEI', nome: 'Fruta + castanha', items: [[214, 150, 'C'], [589, 10, 'G']] },
];

export const DEFAULT_SLOTS = [
  { key: 'cafe', nome: 'Café da manhã', tipo: 'CAF', hora: '07:00', pctKcal: 20, pctProt: 20, ativo: true },
  { key: 'lanche1', nome: 'Lanche da manhã', tipo: 'LAN', hora: '10:00', pctKcal: 10, pctProt: 10, ativo: true },
  { key: 'almoco', nome: 'Almoço', tipo: 'PRA', hora: '12:30', pctKcal: 30, pctProt: 25, ativo: true },
  { key: 'lanche2', nome: 'Lanche da tarde', tipo: 'LAN', hora: '16:00', pctKcal: 10, pctProt: 10, ativo: true },
  { key: 'jantar', nome: 'Jantar', tipo: 'PRA', hora: '20:00', pctKcal: 25, pctProt: 25, ativo: true },
  { key: 'ceia', nome: 'Ceia', tipo: 'CEI', hora: '22:30', pctKcal: 5, pctProt: 10, ativo: true },
];

const MACRO_OF_ROLE = { P: 'prot', C: 'carb', G: 'gord' };
const MEAT = [410, 377, 301, 439];
const ANIMAL = [...MEAT, 488, 461, 448, 456, 507];

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const SYNONYMS = {
  peixe: [301], carne: [377, 439], 'carne vermelha': [377], frango: [410], ovo: [488], ovos: [488],
  leite: [448, 461, 456], lactose: [448, 461, 456], queijo: [461], iogurte: [448], feijao: [561, 567],
  pao: [53, 52], gluten: [53, 52, 7], presunto: [439], mel: [507], castanha: [589], amendoim: [557],
};

// Alimentos que este cliente não pode ou não quer comer, a partir da
// anamnese (restrição por escolha + "não come de jeito nenhum").
export function excludedFoods(etapa1, taco, models = MODELS) {
  const r = etapa1?.respostas || {};
  const out = new Set();
  const restr = norm(r['Restrição por escolha']);
  if (restr.includes('vegano')) ANIMAL.forEach(id => out.add(id));
  else if (restr.includes('vegetariano')) MEAT.forEach(id => out.add(id));
  if (restr.includes('lactose')) [448, 461, 456].forEach(id => out.add(id));
  if (restr.includes('gluten')) [53, 52, 7].forEach(id => out.add(id));
  const dislikes = norm(r['Alimentos que não come de jeito nenhum']);
  if (dislikes) {
    const words = dislikes.split(/[^a-z]+/).filter(w => w.length >= 3 && !['nao', 'come', 'nem', 'com', 'sem', 'que', 'tipo'].includes(w));
    words.forEach(w => (SYNONYMS[w] || []).forEach(id => out.add(id)));
    const usedIds = new Set(models.flatMap(m => m.items.map(i => i[0])).concat(currentGroups().flatMap(g => g.ids)));
    usedIds.forEach(id => {
      const f = taco.get(id);
      if (!f) return;
      const first = norm(foodName(f)).split(' ')[0];
      if (words.some(w => w.length >= 4 && (first.startsWith(w) || w.startsWith(first)))) out.add(id);
    });
  }
  return out;
}

export function guessGoal(text) {
  const t = norm(text);
  if (/emagre|perder|gordura|secar|definir/.test(t)) return 'emagrecimento';
  if (/massa|hipertrof|ganhar|crescer|volume/.test(t)) return 'ganho_de_massa';
  return 'manutencao';
}

// Metas de cada refeição: calorias e proteína pelas suas %; gordura
// proporcional às calorias; carboidrato completa as calorias da refeição.
export function mealTargets(target, slots) {
  return slots.map(s => {
    if (!s.ativo) return { kcal: 0, prot: 0, carb: 0, gord: 0 };
    const kcal = Math.round(target.calories * s.pctKcal / 100);
    const prot = Math.round(target.protein_g * s.pctProt / 100);
    const gord = Math.round(target.fat_g * s.pctKcal / 100);
    const carb = Math.max(0, Math.round((kcal - prot * 4 - gord * 9) / 4));
    return { kcal, prot, carb, gord };
  });
}

// Escolhe automaticamente um modelo por refeição, evitando alimentos
// excluídos e repetindo o mínimo possível (almoço ≠ jantar).
export function autoSelectModels(slots, excluded, models = MODELS) {
  const used = new Set();
  return slots.map(s => {
    const candidates = models.filter(m => m.tipo === s.tipo);
    const clean = candidates.filter(m => !m.items.some(([id]) => excluded.has(id)));
    const pool = clean.length ? clean : candidates;
    const pick = pool.find(m => !used.has(m.code)) || pool[0];
    used.add(pick.code);
    return pick.code;
  });
}

function groupOf(id) {
  return currentGroups().find(g => g.ids.includes(id)) || null;
}

function firstAllowed(id, excluded) {
  const g = groupOf(id);
  return g ? g.ids.find(x => x !== id && !excluded.has(x)) : undefined;
}

function round5(x) {
  return Math.max(0, Math.round(x / 5) * 5);
}

// Monta uma refeição: aplica fatores por papel, trocas e ajustes manuais.
// edits = { swaps: {idx: tacoId}, grams: {idx: g} }
// plantCredit: quanto da proteína de carboidratos e verduras (arroz,
// feijão, pão...) conta ao dimensionar a fonte de proteína principal.
// 0,5 = metade, para a refeição não ficar com 30 g de frango e 350 g de arroz.
export function buildMeal(model, mt, taco, excluded, edits = {}, { plantCredit = 0.5 } = {}) {
  const swaps = edits.swaps || {};
  const grams = edits.grams || {};
  const base = model.items.filter(([id]) => taco.has(id)).map(([id, g, role]) => {
    const f = taco.get(id);
    return { id, g, role, f, prot: f.prot * g / 100, carb: f.carb * g / 100, gord: f.gord * g / 100 };
  });
  const S = { P: { prot: 0, carb: 0, gord: 0 }, C: { prot: 0, carb: 0, gord: 0 }, G: { prot: 0, carb: 0, gord: 0 }, L: { prot: 0, carb: 0, gord: 0 }, X: { prot: 0, carb: 0, gord: 0 } };
  base.forEach(b => { ['prot', 'carb', 'gord'].forEach(m => { S[b.role][m] += b[m]; }); });
  const fC = S.C.carb > 0 ? Math.max(0, mt.carb - S.X.carb) / S.C.carb : 1;
  const fP = S.P.prot > 0 ? Math.max(0, (mt.prot - S.X.prot - (S.C.prot * fC + S.L.prot) * plantCredit) / S.P.prot) : 1;
  const fG = S.G.gord > 0 ? Math.max(0, (mt.gord - S.C.gord * fC - S.P.gord * fP - S.L.gord - S.X.gord) / S.G.gord) : 1;
  const factor = { C: fC, P: fP, G: fG, L: 1, X: 1 };

  const items = base.map((b, idx) => {
    let id = swaps[idx] ?? b.id;
    let autoSwapped = false;
    if (swaps[idx] == null && excluded.has(b.id)) {
      const alt = firstAllowed(b.id, excluded);
      if (alt) { id = alt; autoSwapped = true; }
    }
    const f = taco.get(id);
    let suggested;
    if (b.role === 'L' || b.role === 'X') suggested = b.g;
    else if (id === b.id) suggested = round5(b.g * factor[b.role]);
    else {
      const m = MACRO_OF_ROLE[b.role];
      suggested = f[m] > 0 ? round5(b[m] * factor[b.role] / f[m] * 100) : round5(b.g * factor[b.role]);
    }
    const g = grams[idx] != null ? Number(grams[idx]) : suggested;
    return {
      idx, id, role: b.role, food: f, nome: foodName(f), suggested, g, manual: grams[idx] != null, autoSwapped,
      kcal: (f.kcal || 0) * g / 100, prot: f.prot * g / 100, carb: f.carb * g / 100, gord: f.gord * g / 100,
      livre: b.role === 'L',
    };
  });
  const tot = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, prot: a.prot + i.prot, carb: a.carb + i.carb, gord: a.gord + i.gord }), { kcal: 0, prot: 0, carb: 0, gord: 0 });
  return { items, tot, factors: factor };
}

// Opções de troca para um item, já na quantidade equivalente ao macro do
// papel dele (verduras trocam grama por grama).
export function substitutionOptions(item, taco, excluded) {
  const g = groupOf(item.id);
  if (!g) return [];
  const m = MACRO_OF_ROLE[item.role];
  const amount = m ? item.food[m] * item.g / 100 : null;
  return g.ids.filter(id => id !== item.id && !excluded.has(id)).map(id => {
    const f = taco.get(id);
    const grams = !m || !f[m] ? item.g : round5(amount / f[m] * 100);
    return { id, nome: foodName(f), g: grams };
  }).filter(o => o.g > 0 && o.g <= Math.max(2.5 * item.g, 30));
}

export function statusOf(planned, target, tol) {
  if (!target) return '';
  const d = (planned - target) / target;
  if (Math.abs(d) <= tol) return 'ok';
  return d > 0 ? 'passou' : 'faltou';
}
