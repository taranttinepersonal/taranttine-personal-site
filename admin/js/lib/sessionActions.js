// Ajustes na hora do treino (Lançar treino): adicionar exercício e trocar aparelho.
import { supabase } from '../../../app/js/supabaseClient.js';
import { ensureArchive } from './rotationActions.js';
import { diffOrder } from '../../../app/js/lib/ordering.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

// Grava só o que mudou de seção/posição (flat vem de app/js/lib/ordering.js).
export async function persistOrder(changes) {
  await Promise.all(changes.map(async (c) => { must(await supabase.from('workout_exercises').update({ section_id: c.section_id, sort_order: c.sort_order }).eq('id', c.id).select('id')); }));
}

// Move um exercício da ficha uma posição (±1). `before`/`after` = listas "flat" antes e depois (já calculadas pela tela).
export async function moveExercise(before, after) {
  await persistOrder(diffOrder(before, after));
}

// Adiciona um exercício ao dia da ficha.
//  - onlyToday=false: entra na ficha, na posição escolhida (`flatBefore`/`flatAfter` já calculadas com a linha nova).
//  - onlyToday=true: guarda a linha no programa-arquivo (inativo), ligada ao dia, e o painel só a mostra em `date`;
//    sort_order = posição*100+desempate (ver ordering.js: extraKey).
export async function addExercise(clientId, { dayId, exerciseId, sets, reps, rest, onlyToday, date, sortOrder = 0, insertAt }) {
  const base = { exercise_id: exerciseId, sets: sets || null, reps: reps || null, rest_seconds: rest ? Number(rest) : null };
  if (onlyToday) {
    const arch = await ensureArchive(clientId);
    return must(await supabase.from('workout_exercises').insert({
      ...base, workout_day_id: arch.dayId, section_id: null, sort_order: sortOrder, extra_on: date, extra_day_id: dayId,
    }).select('id').single());
  }
  // insertAt(newId) devolve { flatBefore, flatAfter } com a linha nova já no lugar
  const sectionId = insertAt?.sectionId ?? null;
  const created = must(await supabase.from('workout_exercises').insert({
    ...base, workout_day_id: dayId, section_id: sectionId, sort_order: 32000,
  }).select('id').single());
  if (insertAt) {
    const { flatBefore, flatAfter } = insertAt.build(created.id);
    await persistOrder([...diffOrder(flatBefore, flatAfter), ...flatAfter.filter(r => r.id === created.id).map(r => ({ id: r.id, section_id: r.section_id, sort_order: r.sort_order }))]);
  }
  return created;
}

// Remove um exercício "só hoje" (e o lançamento dele, por cascata).
export async function removeExtra(rowId) {
  must(await supabase.from('workout_exercises').delete().eq('id', rowId).not('extra_on', 'is', null).select('id'));
}

// Muda a posição de um exercício "só hoje" entre os visíveis do dia.
export async function setExtraIndex(rowId, index) {
  must(await supabase.from('workout_exercises').update({ sort_order: Math.max(0, index) }).eq('id', rowId).not('extra_on', 'is', null).select('id'));
}
