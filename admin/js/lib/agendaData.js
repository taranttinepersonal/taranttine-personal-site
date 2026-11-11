// Leitura e gravação da agenda (as regras puras ficam em app/js/lib/agenda.js).
import { supabase } from '../../../app/js/supabaseClient.js';
import { addDays, toIso, ABSENCES } from '../../../app/js/lib/agenda.js';

const must = ({ data, error }) => { if (error) throw error; return data; };
export const isMissingAgenda = (e) => !!e && (['42P01', '42883', 'PGRST205', 'PGRST202'].includes(e.code) || /agenda_/.test(e.message || ''));

export async function loadClients() {
  return must(await supabase.from('profiles').select('id, full_name, phone, active, modalidade').eq('role', 'client').order('full_name'));
}

// Gera os treinos dos horários fixos no período e devolve os compromissos dele.
export async function loadRange(from, to) {
  must(await supabase.rpc('agenda_generate', { p_from: from, p_to: to }));
  return must(await supabase.from('agenda_events').select('*').gte('on_date', from).lte('on_date', to).order('on_date').order('start_time'));
}

// treinos/reposições de dias passados que ninguém marcou se vieram
export async function loadUnmarked(todayIso) {
  return must(await supabase.from('agenda_events').select('id, on_date, start_time, duration_min, kind, status')
    .eq('status', 'agendado').in('kind', ['treino', 'reposicao']).gte('on_date', addDays(todayIso, -30)).lte('on_date', todayIso).order('on_date'));
}

// faltas com crédito de reposição + reposições ligadas a elas
export async function loadCreditEvents() {
  const absences = must(await supabase.from('agenda_events').select('*').eq('generates_credit', true).in('status', ABSENCES).order('on_date'));
  const makeups = must(await supabase.from('agenda_events').select('*').not('makeup_for', 'is', null));
  return [...absences, ...makeups];
}

export async function loadSlots() {
  return must(await supabase.from('agenda_slots').select('*').order('weekday').order('start_time'));
}

export async function createEvent(fields) {
  return must(await supabase.from('agenda_events').insert(fields).select('*').single());
}
export async function updateEvent(id, patch) {
  must(await supabase.from('agenda_events').update(patch).eq('id', id).select('id'));
}
// Mover só esta ocorrência (o horário fixo não muda). Guarda de onde saiu na primeira vez.
export async function moveEvent(ev, date, time, extra = {}) {
  const patch = { on_date: date, start_time: time, notified_at: null, ...extra };
  if (!ev.orig_date) { patch.orig_date = ev.on_date; patch.orig_time = ev.start_time; }
  if (ev.orig_date && date === ev.orig_date && time === String(ev.orig_time).slice(0, 5)) { patch.orig_date = null; patch.orig_time = null; } // voltou pro lugar de origem
  must(await supabase.from('agenda_events').update(patch).eq('id', ev.id).select('id'));
}
export async function setStatus(id, status, { credit = false, note } = {}) {
  const patch = { status, generates_credit: ABSENCES.includes(status) ? credit : false };
  if (note !== undefined) patch.note = note || null;
  must(await supabase.from('agenda_events').update(patch).eq('id', id).select('id'));
}
// Só compromissos avulsos podem ser apagados; treinos de horário fixo são cancelados (senão a grade recria).
export async function deleteEvent(id) {
  must(await supabase.from('agenda_events').delete().eq('id', id).is('slot_id', null).select('id'));
}

// ---- horários fixos ----
export async function createSlots(clientId, weekdays, startTime, durationMin, validFrom, note) {
  const rows = weekdays.map(w => ({ client_id: clientId, weekday: w, start_time: startTime, duration_min: durationMin, valid_from: validFrom, note: note || null }));
  return must(await supabase.from('agenda_slots').insert(rows).select('*'));
}
async function cleanupMoved(slotId, fromIso) { // os movidos de propósito ficam; só limpa os que estão no próprio dia
  const rows = must(await supabase.from('agenda_events').select('id, on_date, slot_date').eq('slot_id', slotId).eq('status', 'agendado').gte('slot_date', fromIso));
  return rows;
}
// Encerra o horário fixo a partir de `fromIso` (o último dia válido é o anterior).
export async function endSlot(slot, fromIso) {
  const last = addDays(fromIso, -1);
  if (last < slot.valid_from) must(await supabase.from('agenda_slots').update({ active: false, valid_until: slot.valid_from }).eq('id', slot.id).select('id'));
  else must(await supabase.from('agenda_slots').update({ valid_until: last }).eq('id', slot.id).select('id'));
  const rows = await cleanupMoved(slot.id, fromIso);
  const untouched = rows.filter(r => r.on_date === r.slot_date).map(r => r.id);
  if (untouched.length) must(await supabase.from('agenda_events').delete().in('id', untouched).select('id'));
}
// Muda o horário fixo a partir de uma data: encerra o antigo e cria o novo.
export async function changeSlotFrom(slot, fromIso, { weekday, start_time, duration_min }) {
  await endSlot(slot, fromIso);
  return must(await supabase.from('agenda_slots').insert({
    client_id: slot.client_id, weekday, start_time, duration_min, valid_from: fromIso, note: slot.note,
  }).select('*').single());
}
export const todayIso = () => toIso(new Date());
