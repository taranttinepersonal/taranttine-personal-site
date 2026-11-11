// Gravações da rotação de exercícios e do novo ciclo (os cálculos puros ficam em app/js/lib/rotation.js).
import { supabase } from '../../../app/js/supabaseClient.js';

const ARCHIVE_TITLE = 'Arquivo de rotação';
const EX_FIELDS = ['workout_day_id', 'section_id', 'exercise_id', 'sets', 'reps', 'rest_seconds', 'method', 'tip', 'sort_order', 'display_group', 'superset_group'];
const pick = (row, keys) => Object.fromEntries(keys.map(k => [k, row[k] ?? null]));
const must = ({ data, error }) => { if (error) throw error; return data; };

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Programa "arquivo" do cliente (inativo): guarda os exercícios trocados com todo o histórico de cargas.
// Todas as telas leem só programas ativos, então ele não aparece pra ninguém.
export async function ensureArchive(clientId) {
  let prog = must(await supabase.from('workout_programs').select('id')
    .eq('client_id', clientId).eq('is_active', false).eq('title', ARCHIVE_TITLE).limit(1))[0];
  if (!prog) {
    prog = must(await supabase.from('workout_programs').insert({
      client_id: clientId, title: ARCHIVE_TITLE, subtitle: 'Exercícios trocados na rotação (histórico de cargas preservado)', is_active: false,
    }).select('id').single());
  }
  let day = must(await supabase.from('workout_days').select('id').eq('program_id', prog.id).limit(1))[0];
  if (!day) {
    day = must(await supabase.from('workout_days').insert({ program_id: prog.id, label: 'ARQ', title: 'Exercícios trocados', sort_order: 0 }).select('id').single());
  }
  return { programId: prog.id, dayId: day.id };
}

// ids dos exercícios que já saíram da ficha deste cliente (não voltam logo na próxima sugestão)
export async function loadArchivedExerciseIds(clientId) {
  const { data: prog } = await supabase.from('workout_programs').select('id')
    .eq('client_id', clientId).eq('is_active', false).eq('title', ARCHIVE_TITLE).limit(1);
  if (!prog?.length) return new Set();
  const { data: days } = await supabase.from('workout_days').select('id').eq('program_id', prog[0].id);
  if (!days?.length) return new Set();
  const { data: rows } = await supabase.from('workout_exercises').select('exercise_id').in('workout_day_id', days.map(d => d.id)).is('extra_on', null);
  return new Set((rows || []).map(r => r.exercise_id));
}

// Troca exercícios dentro do ciclo atual: o exercício novo ocupa o lugar e a prescrição do antigo;
// o antigo vai pro arquivo com o histórico. swaps: [{ rowId, toId }]. Devolve quantas trocas foram feitas.
export async function applySwaps(clientId, programId, swaps, { restartBlock = true } = {}) {
  if (!swaps.length) return 0;
  const arch = await ensureArchive(clientId);
  let done = 0;
  for (const s of swaps) {
    const old = must(await supabase.from('workout_exercises').select(EX_FIELDS.join(',')).eq('id', s.rowId).single());
    // a dica (tip) é do exercício antigo: não faz sentido pro novo
    const created = must(await supabase.from('workout_exercises')
      .insert({ ...pick(old, EX_FIELDS), exercise_id: s.toId, tip: null }).select('id').single());
    const { error } = await supabase.from('workout_exercises')
      .update({ workout_day_id: arch.dayId, section_id: null }).eq('id', s.rowId);
    if (error) {
      await supabase.from('workout_exercises').delete().eq('id', created.id); // desfaz: nada fica duplicado
      throw error;
    }
    done++;
  }
  // início de um novo bloco = ficha ajustada agora (troca de aparelho na hora do treino não reinicia o bloco)
  if (restartBlock) must(await supabase.from('workout_programs').update({ last_adjusted_at: new Date().toISOString() }).eq('id', programId).select('id'));
  return done;
}

// Cria o próximo ciclo (cópia da ficha, semana 1) e passa a ser o ativo. O ciclo anterior continua
// guardado, inativo, com todo o histórico.
// starts: { [id do workout_exercise antigo]: carga de partida } · swaps: [{ rowId, toId }] aplicadas na cópia.
export async function createNextCycle(clientId, oldProgramId, { starts = {}, swaps = [] } = {}) {
  const old = must(await supabase.from('workout_programs').select('*').eq('id', oldProgramId).single());
  const swapBy = new Map(swaps.map(s => [s.rowId, s.toId]));
  const created = { program: null };
  try {
    const prog = must(await supabase.from('workout_programs').insert({
      client_id: clientId, title: old.title, subtitle: old.subtitle, health_note: old.health_note,
      total_weeks: old.total_weeks, periodization: old.periodization, meso_length: old.meso_length, meso_deload: old.meso_deload,
      block_weeks: old.block_weeks, current_week: 1, cycle_no: (old.cycle_no || 1) + 1, previous_program_id: old.id,
      last_adjusted_at: new Date().toISOString(), is_active: false, // ativa só no fim (índice: 1 ativo por cliente)
    }).select('id').single());
    created.program = prog.id;

    const days = must(await supabase.from('workout_days').select('id, label, title, sort_order').eq('program_id', old.id).order('sort_order'));
    const dayMap = new Map();
    for (const d of days) {
      const nd = must(await supabase.from('workout_days').insert({ program_id: prog.id, label: d.label, title: d.title, sort_order: d.sort_order }).select('id').single());
      dayMap.set(d.id, nd.id);
    }
    const oldDayIds = days.map(d => d.id);
    const sections = oldDayIds.length ? must(await supabase.from('workout_sections').select('id, workout_day_id, title, icon, sort_order').in('workout_day_id', oldDayIds)) : [];
    const secMap = new Map();
    for (const s of sections) {
      const ns = must(await supabase.from('workout_sections').insert({ workout_day_id: dayMap.get(s.workout_day_id), title: s.title, icon: s.icon, sort_order: s.sort_order }).select('id').single());
      secMap.set(s.id, ns.id);
    }
    const exs = oldDayIds.length ? must(await supabase.from('workout_exercises').select(['id', ...EX_FIELDS].join(',')).in('workout_day_id', oldDayIds)) : [];
    const today = todayLocal();
    const logs = [];
    await Promise.all(exs.map(async (e) => {
      const swapTo = swapBy.get(e.id);
      const row = { ...pick(e, EX_FIELDS), workout_day_id: dayMap.get(e.workout_day_id), section_id: e.section_id ? secMap.get(e.section_id) || null : null };
      if (swapTo) { row.exercise_id = swapTo; row.tip = null; }
      const ne = must(await supabase.from('workout_exercises').insert(row).select('id').single());
      // carga de partida só pra quem manteve o exercício; vira "meta" na tela de lançar
      if (!swapTo && starts[e.id] != null) {
        logs.push({ client_id: clientId, workout_exercise_id: ne.id, load_value: String(starts[e.id]), logged_on: today, week_no: null, estimated: true });
      }
    }));
    if (logs.length) must(await supabase.from('load_history').insert(logs).select('id'));

    // troca de ativo: primeiro desliga o antigo (índice único), depois liga o novo
    must(await supabase.from('workout_programs').update({ is_active: false }).eq('id', old.id).select('id'));
    const { error } = await supabase.from('workout_programs').update({ is_active: true }).eq('id', prog.id);
    if (error) {
      await supabase.from('workout_programs').update({ is_active: true }).eq('id', old.id); // volta ao que era
      throw error;
    }
    return { programId: prog.id, cycleNo: (old.cycle_no || 1) + 1, seeded: logs.length, swapped: swaps.length };
  } catch (e) {
    if (created.program) await supabase.from('workout_programs').delete().eq('id', created.program); // apaga a cópia incompleta
    throw e;
  }
}
