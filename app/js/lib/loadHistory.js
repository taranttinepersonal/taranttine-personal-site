import { supabase } from '../supabaseClient.js';

export async function fetchHistoryForProgram(clientId, workoutExerciseIds) {
  if (!workoutExerciseIds.length) return {};
  const { data, error } = await supabase
    .from('load_history')
    .select('workout_exercise_id, load_value, logged_on')
    .eq('client_id', clientId)
    .in('workout_exercise_id', workoutExerciseIds)
    .order('logged_on', { ascending: false });
  if (error) {
    console.error('fetchHistoryForProgram failed', error);
    return {};
  }
  const byExercise = {};
  for (const row of data) {
    if (!byExercise[row.workout_exercise_id]) byExercise[row.workout_exercise_id] = [];
    if (byExercise[row.workout_exercise_id].length < 5) {
      byExercise[row.workout_exercise_id].push(row);
    }
  }
  return byExercise;
}

export async function saveLoad(clientId, workoutExerciseId, loadValue) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from('load_history')
    .upsert(
      { client_id: clientId, workout_exercise_id: workoutExerciseId, load_value: loadValue, logged_on: today },
      { onConflict: 'workout_exercise_id,logged_on' }
    );
  if (error) throw error;
}

export function renderHistoryText(entries) {
  if (!entries || !entries.length) return '';
  return '📊 Histórico: ' + entries.slice(0, 3)
    .map(e => `${e.load_value}kg (${new Date(e.logged_on + 'T00:00:00').toLocaleDateString('pt-BR')})`)
    .join(' · ');
}

export async function fetchCompletions(clientId, workoutExerciseIds) {
  if (!workoutExerciseIds.length) return new Set();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('workout_completions')
    .select('workout_exercise_id')
    .eq('client_id', clientId)
    .eq('completed_on', today)
    .in('workout_exercise_id', workoutExerciseIds);
  if (error) {
    console.error('fetchCompletions failed', error);
    return new Set();
  }
  return new Set(data.map(r => r.workout_exercise_id));
}

export async function toggleCompletion(clientId, workoutExerciseId, isDone) {
  const today = new Date().toISOString().slice(0, 10);
  if (isDone) {
    const { error } = await supabase
      .from('workout_completions')
      .upsert(
        { client_id: clientId, workout_exercise_id: workoutExerciseId, completed_on: today },
        { onConflict: 'workout_exercise_id,completed_on' }
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('workout_completions')
      .delete()
      .eq('client_id', clientId)
      .eq('workout_exercise_id', workoutExerciseId)
      .eq('completed_on', today);
    if (error) throw error;
  }
}
