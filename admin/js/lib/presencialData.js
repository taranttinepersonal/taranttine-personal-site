import { supabase } from '../../../app/js/supabaseClient.js';
import { parseRepsRange, parseTargetRir, mesoPosition, suggestNext } from '../../../app/js/lib/progression.js';

const PAGE = 1000; // limite padrão de linhas por consulta do PostgREST

// A migração 0037 ainda não rodou: as colunas novas não existem.
export function isMissingColumn(error) {
  return !!error && (error.code === '42703' || /reps_done|rir_done|week_no|modalidade|meso_length|meso_deload/.test(error.message || ''));
}

export function isDeloadWeek(weekNo, program) {
  if (weekNo == null) return false;
  return !!mesoPosition(weekNo, program.meso_length, program.meso_deload)?.isDeload;
}

async function fetchAllLogs(clientId, workoutExerciseIds) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('load_history')
      .select('workout_exercise_id, load_value, logged_on, reps_done, rir_done, week_no')
      .eq('client_id', clientId)
      .in('workout_exercise_id', workoutExerciseIds)
      .order('logged_on', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

// Ficha ativa do cliente + histórico de cargas + sugestão por exercício.
export async function loadPresencialClient(clientId) {
  const { data: profile, error: pErr } = await supabase
    .from('profiles').select('id, full_name, sexo, modalidade').eq('id', clientId).single();
  if (pErr) throw pErr;

  const { data: program, error: gErr } = await supabase
    .from('workout_programs')
    .select('id, title, current_week, total_weeks, meso_length, meso_deload, last_adjusted_at, created_at')
    .eq('client_id', clientId).eq('is_active', true).maybeSingle();
  if (gErr) throw gErr;

  const { data: levels } = await supabase
    .from('training_level_assessments').select('nivel_final, recorded_at')
    .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1);
  const level = levels?.[0] || null;

  if (!program) return { profile, program: null, days: [], level, logs: [] };

  const { data: days, error: dErr } = await supabase
    .from('workout_days').select('id, label, title, sort_order').eq('program_id', program.id).order('sort_order');
  if (dErr) throw dErr;
  const dayIds = days.map(d => d.id);

  const { data: wes, error: wErr } = dayIds.length ? await supabase
    .from('workout_exercises')
    .select('id, workout_day_id, sets, reps, rest_seconds, method, display_group, sort_order, exercises(name, muscle_groups(name))')
    .in('workout_day_id', dayIds).order('sort_order') : { data: [], error: null };
  if (wErr) throw wErr;

  const logs = wes.length ? await fetchAllLogs(clientId, wes.map(w => w.id)) : [];
  const logsByEx = {};
  for (const l of logs) (logsByEx[l.workout_exercise_id] ||= []).push(l); // já vem do mais novo pro mais antigo

  const pos = mesoPosition(program.current_week, program.meso_length, program.meso_deload);

  const daysOut = days.map(d => ({
    ...d,
    exercises: wes.filter(w => w.workout_day_id === d.id).map(w => {
      const history = logsByEx[w.id] || [];
      const range = parseRepsRange(w.reps);
      const targetRir = parseTargetRir(w.method);
      // logs de semana de deload não servem de base pra progredir
      const base = history.filter(l => !isDeloadWeek(l.week_no, program));
      return {
        id: w.id,
        name: w.exercises?.name || 'Exercício',
        muscle: w.exercises?.muscle_groups?.name || '',
        sets: w.sets, reps: w.reps, rest: w.rest_seconds, method: w.method, group: w.display_group,
        range, targetRir, history,
        last: history[0] || null,
        suggestion: suggestNext({ history: base, repsRange: range, targetRir, isDeload: !!pos?.isDeload }),
      };
    }),
  }));

  return { profile, program, days: daysOut, level, logs, pos };
}

// Visão geral: um cartão por cliente presencial.
export async function loadPresencialOverview() {
  const { data: clients, error } = await supabase
    .from('profiles').select('id, full_name, phone, active, modalidade')
    .eq('role', 'client').order('full_name');
  if (error) throw error;

  const presenciais = clients.filter(c => c.modalidade === 'presencial');
  const others = clients.filter(c => c.modalidade !== 'presencial' && c.active);
  const cards = await Promise.all(presenciais.map(async (c) => {
    try { return { client: c, data: await loadPresencialClient(c.id) }; }
    catch (e) { console.error('presencial overview', c.id, e); return { client: c, data: null }; }
  }));
  return { cards, others };
}
