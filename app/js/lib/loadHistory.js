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

function weekStartISO(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function addWeeksISO(dateStr, weeks) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

// Carga total, tempo de treino estimado e calorias estimadas por semana —
// tempo/calorias são aproximações (sem cronômetro real), assumindo ~40s de
// execução por série + o descanso prescrito de cada exercício.
export async function computeTrainingStats(clientId, weeksBack = 8) {
  const [{ data: loads }, { data: completions }, { data: weightEntries }] = await Promise.all([
    supabase.from('load_history').select('load_value, logged_on').eq('client_id', clientId),
    supabase.from('workout_completions')
      .select('completed_on, workout_exercises(rest_seconds)')
      .eq('client_id', clientId),
    supabase.from('progress_entries').select('weight_kg').eq('client_id', clientId)
      .not('weight_kg', 'is', null).order('recorded_at', { ascending: false }).limit(1),
  ]);

  const loadByWeek = {};
  for (const row of loads || []) {
    const v = Number(row.load_value);
    if (!v) continue;
    const wk = weekStartISO(row.logged_on);
    loadByWeek[wk] = (loadByWeek[wk] || 0) + v;
  }

  const minutesByWeek = {};
  for (const row of completions || []) {
    const wk = weekStartISO(row.completed_on);
    const restSeconds = row.workout_exercises?.rest_seconds || 60;
    const estimatedSeconds = restSeconds + 40;
    minutesByWeek[wk] = (minutesByWeek[wk] || 0) + estimatedSeconds / 60;
  }

  const thisWeek = weekStartISO(new Date().toISOString().slice(0, 10));
  const lastWeek = addWeeksISO(thisWeek, -1);
  const weightKg = weightEntries?.[0]?.weight_kg ? Number(weightEntries[0].weight_kg) : null;

  const kcalForMinutes = (minutes) => (weightKg ? Math.round(6 * 3.5 * weightKg / 200 * minutes) : null);

  const loadWeeklySeries = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const wk = addWeeksISO(thisWeek, -i);
    if (loadByWeek[wk] != null) loadWeeklySeries.push({ date: wk, value: Math.round(loadByWeek[wk]) });
  }

  return {
    loadWeeklySeries,
    cargaTotal: { current: loadByWeek[thisWeek] || 0, previous: loadByWeek[lastWeek] || 0 },
    tempoTreino: { current: Math.round(minutesByWeek[thisWeek] || 0), previous: Math.round(minutesByWeek[lastWeek] || 0) },
    calorias: { current: kcalForMinutes(minutesByWeek[thisWeek] || 0), previous: kcalForMinutes(minutesByWeek[lastWeek] || 0) },
  };
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
