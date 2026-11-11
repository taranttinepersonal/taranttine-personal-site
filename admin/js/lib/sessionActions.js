// Ajustes na hora do treino (Lançar treino): adicionar exercício e trocar aparelho.
import { supabase } from '../../../app/js/supabaseClient.js';
import { ensureArchive } from './rotationActions.js';

const must = ({ data, error }) => { if (error) throw error; return data; };

// Adiciona um exercício ao dia da ficha.
//  - onlyToday=false: entra no fim do dia (na mesma seção do último exercício) e passa a fazer parte da ficha.
//  - onlyToday=true: guarda a linha no programa-arquivo (inativo), ligada ao dia, e o painel só a mostra em `date`.
export async function addExercise(clientId, { dayId, exerciseId, sets, reps, rest, onlyToday, date }) {
  const base = { exercise_id: exerciseId, sets: sets || null, reps: reps || null, rest_seconds: rest ? Number(rest) : null };
  if (onlyToday) {
    const arch = await ensureArchive(clientId);
    return must(await supabase.from('workout_exercises').insert({
      ...base, workout_day_id: arch.dayId, section_id: null, sort_order: 0, extra_on: date, extra_day_id: dayId,
    }).select('id').single());
  }
  const rows = must(await supabase.from('workout_exercises').select('section_id, sort_order').eq('workout_day_id', dayId).order('sort_order', { ascending: false }).limit(1));
  const last = rows[0];
  return must(await supabase.from('workout_exercises').insert({
    ...base, workout_day_id: dayId, section_id: last?.section_id ?? null, sort_order: (last?.sort_order ?? -1) + 1,
  }).select('id').single());
}

// Remove um exercício "só hoje" (e o lançamento dele, por cascata).
export async function removeExtra(rowId) {
  must(await supabase.from('workout_exercises').delete().eq('id', rowId).not('extra_on', 'is', null).select('id'));
}
