import { supabase } from '../../../app/js/supabaseClient.js';
import {
  getPhases, weekInfo, phaseRange, phaseRepsLabel, parseRirFloor, suggestNext, deloadRecommended, PROGRESSION,
} from '../../../app/js/lib/progression.js';

const PAGE = 1000; // limite padrão de linhas por consulta do PostgREST

// As migrações 0037/0038 ainda não rodaram: coluna ou tabela inexistente.
export function isMissingColumn(error) {
  return !!error && (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code)
    || /reps_done|rir_done|week_no|modalidade|periodization|weekly_signals/.test(error.message || ''));
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

// Ficha ativa do cliente + fase da semana + sinais + histórico + sugestão por exercício.
export async function loadPresencialClient(clientId) {
  const { data: profile, error: pErr } = await supabase
    .from('profiles').select('id, full_name, sexo, modalidade').eq('id', clientId).single();
  if (pErr) throw pErr;

  const { data: program, error: gErr } = await supabase
    .from('workout_programs')
    .select('id, title, current_week, total_weeks, periodization, last_adjusted_at, created_at')
    .eq('client_id', clientId).eq('is_active', true).maybeSingle();
  if (gErr) throw gErr;

  const { data: levels } = await supabase
    .from('training_level_assessments').select('nivel_final, recorded_at')
    .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1);
  const level = levels?.[0] || null;

  if (!program) return { profile, program: null, days: [], level, logs: [], phases: getPhases(null), info: null, signals: [] };

  const { data: signals, error: sErr } = await supabase
    .from('weekly_signals')
    .select('week_no, evoluiu, seguiu_plano, recuperacao, deload_aplicado, note')
    .eq('program_id', program.id).order('week_no', { ascending: false });
  if (sErr) throw sErr;

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

  const phases = getPhases(program);
  const info = weekInfo(program.current_week, phases);
  const currentSignal = signals.find(s => s.week_no === program.current_week) || null;
  const deloadApplied = !!currentSignal?.deload_aplicado;
  const deloadWeeks = new Set(signals.filter(s => s.deload_aplicado).map(s => s.week_no));
  const deloadFactor = phases.find(p => p.isDeload)?.loadFactor ?? PROGRESSION.fallbackDeloadFactor;
  const repsDelta = info?.phase.repsDelta ?? 0;
  const rirFloor = parseRirFloor(info?.phase.rir);

  const daysOut = days.map(d => ({
    ...d,
    exercises: wes.filter(w => w.workout_day_id === d.id).map(w => {
      const history = logsByEx[w.id] || [];
      const range = phaseRange(w.reps, repsDelta);
      // logs de semana com deload aplicado não servem de base pra progredir
      const base = history.filter(l => l.week_no == null || !deloadWeeks.has(l.week_no));
      return {
        id: w.id,
        name: w.exercises?.name || 'Exercício',
        muscle: w.exercises?.muscle_groups?.name || '',
        sets: w.sets, reps: w.reps, rest: w.rest_seconds, method: w.method, group: w.display_group,
        range, repsLabel: phaseRepsLabel(w.reps, repsDelta), baseReps: w.reps,
        history,
        last: history[0] || null,
        suggestion: suggestNext({ history: base, repsRange: range, rirFloor, phase: info?.phase || null, deloadApplied, deloadFactor }),
      };
    }),
  }));

  return {
    profile, program, days: daysOut, level, logs,
    phases, info, signals, currentSignal, deloadApplied, deloadWeeks,
    deloadSuggested: deloadRecommended(signals),
  };
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
    catch (e) { console.error('presencial overview', c.id, e); return { client: c, data: null, failed: e }; }
  }));
  // se a migração falta, todos falham do mesmo jeito: sobe o erro pra tela avisar
  const missing = cards.find(c => c.failed && isMissingColumn(c.failed));
  if (missing) throw missing.failed;
  return { cards, others };
}

// Dados extras do relatório de evolução (contato, composição corporal). Falha de uma
// tabela não derruba o relatório: a seção correspondente só não aparece.
export async function loadEvolutionExtras(clientId) {
  const [prof, progress, skin] = await Promise.all([
    supabase.from('profiles').select('phone, birth_date').eq('id', clientId).single(),
    supabase.from('progress_entries').select('recorded_at, weight_kg, body_fat_pct, measurements').eq('client_id', clientId).order('recorded_at'),
    supabase.from('skinfold_assessments').select('*').eq('client_id', clientId).order('recorded_at'),
  ]);
  return {
    phone: prof.data?.phone || '',
    birthDate: prof.data?.birth_date || null,
    progress: progress.data || [],
    skinfolds: skin.data || [],
  };
}
