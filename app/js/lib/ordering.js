// Ordem dos exercícios de um dia da ficha. Funções puras (sem Supabase).
//
// No banco cada exercício tem section_id + sort_order, e o sort_order recomeça em cada seção. A ordem do dia
// (a que o aluno vê no app) é: seções na ordem delas e, dentro de cada seção, sort_order.
// "flat" = lista de linhas { id, section_id, sort_order, hidden } nessa ordem; `hidden` = linhas que o painel
// não mostra (alongamentos), mas que continuam na ficha e entram na contagem.

export function isStretch(method, name) { return /along/i.test(method || '') || /along/i.test(name || ''); }

// sections: [{ id, sort_order }] · rows: [{ id, section_id, sort_order, ... }]
export function orderRows(rows, sections = []) {
  const secOrder = new Map(sections.map(s => [s.id, s.sort_order ?? 0]));
  return [...rows].sort((a, b) =>
    (secOrder.get(a.section_id) ?? 1e6) - (secOrder.get(b.section_id) ?? 1e6)
    || (a.sort_order ?? 0) - (b.sort_order ?? 0)
    || String(a.id).localeCompare(String(b.id)));
}

// Dá a cada linha o sort_order 0..n-1 dentro da sua seção, seguindo a ordem da lista.
export function renumber(flat) {
  const next = new Map();
  return flat.map(r => {
    const k = r.section_id ?? 'none';
    const n = next.get(k) ?? 0; next.set(k, n + 1);
    return { ...r, sort_order: n };
  });
}

// Move um exercício visível uma posição pra cima (-1) ou pra baixo (+1) entre os visíveis.
// Ao passar do limite de uma seção ele entra na seção vizinha (e vira parte dela no app do aluno).
export function moveFlat(flat, id, dir) {
  const vis = flat.filter(r => !r.hidden);
  const vi = vis.findIndex(r => r.id === id);
  const neighbor = vis[vi + dir];
  if (vi < 0 || !neighbor) return null;
  const me = flat.find(r => r.id === id);
  const rest = flat.filter(r => r.id !== id);
  const at = rest.findIndex(r => r.id === neighbor.id);
  rest.splice(dir < 0 ? at : at + 1, 0, { ...me, section_id: neighbor.section_id });
  return renumber(rest);
}

// Insere uma linha nova: pos = { mode: 'end' } | { mode: 'start' } | { mode: 'after', refId }.
// A linha nova entra na seção do exercício de referência. Devolve a lista já renumerada.
export function insertFlat(flat, row, pos = { mode: 'end' }) {
  const vis = flat.filter(r => !r.hidden);
  const list = [...flat];
  if (!vis.length) {
    const last = flat[flat.length - 1];
    list.push({ ...row, section_id: row.section_id ?? last?.section_id ?? null });
  } else if (pos.mode === 'start') {
    list.splice(list.findIndex(r => r.id === vis[0].id), 0, { ...row, section_id: vis[0].section_id });
  } else {
    const ref = pos.mode === 'after' ? (vis.find(r => r.id === pos.refId) || vis[vis.length - 1]) : vis[vis.length - 1];
    list.splice(list.findIndex(r => r.id === ref.id) + 1, 0, { ...row, section_id: ref.section_id });
  }
  return renumber(list);
}

// O que mudou entre duas listas (só linhas existentes nas duas): [{ id, section_id, sort_order }]
export function diffOrder(before, after) {
  const was = new Map(before.map(r => [r.id, r]));
  return after.filter(r => was.has(r.id) && (was.get(r.id).section_id !== r.section_id || was.get(r.id).sort_order !== r.sort_order))
    .map(r => ({ id: r.id, section_id: r.section_id, sort_order: r.sort_order }));
}

// Extras "só hoje": sort_order = posição * 100 + desempate (posição = entre quantos exercícios visíveis da ficha ele fica;
// 0 = começo). Dois extras na mesma posição ficam na ordem do desempate.
export const extraKey = (index, tie = 0) => Math.max(0, index) * 100 + Math.min(Math.max(tie, 0), 99);
export const extraIndex = (sortOrder) => Math.floor((sortOrder ?? 0) / 100);
export function nextTie(extras, index) {
  const ties = extras.filter(x => extraIndex(x.sortOrder) === index).map(x => (x.sortOrder ?? 0) % 100);
  return ties.length ? Math.max(...ties) + 1 : 0;
}

// Junta os extras do dia na lista de visíveis, cada um na sua posição (limitada ao tamanho da lista).
export function mergeExtras(visible, extras) {
  const out = [...visible];
  const sorted = [...extras].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id)));
  let shift = 0;
  for (const x of sorted) {
    const at = Math.min(extraIndex(x.sortOrder), visible.length) + shift;
    out.splice(at, 0, x); shift++;
  }
  return out;
}

// Troca de lugar um item da lista misturada (ficha + extras) com o vizinho de cima (-1) ou de baixo (+1).
// Devolve { merged, ficha: bool (a ordem da ficha mudou), extraUpdates: [{ id, sortOrder }] } ou null nas pontas.
// `isExtra(item)` diz quem é extra. Só os extras mudam de sort_order; a ordem da ficha a tela grava com moveFlat.
export function swapMerged(merged, id, dir, isExtra) {
  const i = merged.findIndex(x => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= merged.length) return null;
  const next = [...merged];
  [next[i], next[j]] = [next[j], next[i]];
  const ficha = !isExtra(merged[i]) && !isExtra(merged[j]);
  // recalcula a posição de cada extra pela lista nova
  let before = 0; const tieAt = new Map(); const updates = [];
  for (const x of next) {
    if (!isExtra(x)) { before++; continue; }
    const t = tieAt.get(before) ?? 0; tieAt.set(before, t + 1);
    const key = extraKey(before, t);
    if (key !== x.sortOrder) updates.push({ id: x.id, sortOrder: key });
  }
  return { merged: next, ficha, extraUpdates: updates };
}
