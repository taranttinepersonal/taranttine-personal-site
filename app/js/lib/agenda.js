// Agenda de atendimentos do treinador: funções puras (sem Supabase) pra testar sozinhas.
// Datas e horas são sempre locais (Dourados), em texto: "2026-11-10" e "07:00".

export const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const DOW_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export const KINDS = {
  treino:    { label: 'Treino', needsClient: true },
  reposicao: { label: 'Reposição', needsClient: true },
  avaliacao: { label: 'Avaliação', needsClient: true },
  consulta:  { label: 'Consulta', needsClient: true },
  bloqueio:  { label: 'Bloqueio', needsClient: false },
  lembrete:  { label: 'Lembrete', needsClient: false },
};
export const STATUS = {
  agendado:  { label: 'Agendado', cls: 'muted' },
  feito:     { label: 'Compareceu', cls: 'up' },
  faltou:    { label: 'Faltou', cls: 'down' },
  desmarcou: { label: 'Desmarcou', cls: 'warn' },
  cancelado: { label: 'Cancelado', cls: 'warn' },
};
export const ABSENCES = ['faltou', 'desmarcou', 'cancelado'];
export const DEFAULT_REMIND_MIN = 30;
export const NO_REMINDER = -1;

// ---------- datas ----------
const pad = (n) => String(n).padStart(2, '0');
export function toIso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function fromIso(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00'); }
export function addDays(iso, n) { const d = fromIso(iso); d.setDate(d.getDate() + n); return toIso(d); }
export function dowOf(iso) { return fromIso(iso).getDay(); }
// semana de segunda a domingo
export function weekStart(iso) { const dow = dowOf(iso); return addDays(iso, dow === 0 ? -6 : 1 - dow); }
export function weekDays(iso) { const s = weekStart(iso); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
export function fmtDay(iso) { const d = fromIso(iso); return `${DOW_SHORT[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }
export function fmtDayLong(iso) { const d = fromIso(iso); return `${DOW_LONG[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }
export function hm(t) { return String(t || '').slice(0, 5); }
export function toMin(t) { const [h, m] = hm(t).split(':').map(Number); return h * 60 + (m || 0); }
export function fromMin(n) { const x = ((n % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}`; }
export function endTime(start, dur) { return fromMin(toMin(start) + (Number(dur) || 0)); }

// ---------- conflitos e pendências ----------
const ACTIVE = ['agendado', 'feito'];
export function overlaps(a, b) {
  if (a.on_date !== b.on_date) return false;
  const a0 = toMin(a.start_time), a1 = a0 + Math.max(1, Number(a.duration_min) || 0);
  const b0 = toMin(b.start_time), b1 = b0 + Math.max(1, Number(b.duration_min) || 0);
  return a0 < b1 && b0 < a1;
}
// compromissos ativos que batem com o horário `cand` (ignora o próprio, cancelados, faltas e lembretes)
export function conflictsWith(cand, events) {
  return events.filter(e => e.id !== cand.id && ACTIVE.includes(e.status) && e.kind !== 'lembrete' && overlaps(cand, e));
}

// Faltas que geraram crédito de reposição e ainda não foram repostas. Reposição cancelada/faltada devolve o crédito.
export function pendingCredits(events) {
  const live = new Set(events.filter(e => e.makeup_for && ACTIVE.includes(e.status)).map(e => e.makeup_for));
  return events
    .filter(e => ABSENCES.includes(e.status) && e.generates_credit && !live.has(e.id))
    .sort((a, b) => (a.on_date + a.start_time).localeCompare(b.on_date + b.start_time));
}

// passou do horário e ninguém marcou se veio ou não
export function needsMark(ev, nowIso, nowHm) {
  if (ev.status !== 'agendado' || !['treino', 'reposicao'].includes(ev.kind)) return false;
  const end = endTime(ev.start_time, ev.duration_min);
  return ev.on_date < nowIso || (ev.on_date === nowIso && toMin(end) <= toMin(nowHm));
}

// ---------- lembretes (push pro treinador) ----------
// minutos de antecedência do aviso; null = sem aviso
export function remindMinutes(ev) {
  if (ev.remind_before_min === NO_REMINDER) return null;
  if (ev.remind_before_min != null) return ev.remind_before_min;
  if (ev.kind === 'bloqueio') return null;
  return ev.kind === 'lembrete' ? 0 : DEFAULT_REMIND_MIN;
}
// nowLocalMs = relógio local de Dourados como "ms UTC" (Date.UTC com a hora local)
export function localMs(iso, time) { const [y, m, d] = iso.split('-').map(Number); const [h, mi] = hm(time).split(':').map(Number); return Date.UTC(y, m - 1, d, h, mi); }
export function reminderDue(ev, nowLocalMs, graceMin = 60) {
  if (ev.status !== 'agendado' || ev.notified_at) return false;
  const mins = remindMinutes(ev);
  if (mins == null) return false;
  const start = localMs(ev.on_date, ev.start_time);
  return nowLocalMs >= start - mins * 60000 && nowLocalMs < start + graceMin * 60000;
}

// ---------- mensagens de WhatsApp pro aluno ----------
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
export function waMessage(type, ev, clientName, extra = {}) {
  const nome = first(clientName);
  const quando = `${DOW_LONG[dowOf(ev.on_date)].toLowerCase()} (${pad(fromIso(ev.on_date).getDate())}/${pad(fromIso(ev.on_date).getMonth() + 1)}) às ${hm(ev.start_time)}`;
  const kind = ev.kind === 'avaliacao' ? 'avaliação' : ev.kind === 'consulta' ? 'consulta' : ev.kind === 'reposicao' ? 'reposição' : 'treino';
  if (type === 'remarcado') {
    const antes = ev.orig_date ? ` (antes: ${fmtDay(ev.orig_date)} às ${hm(ev.orig_time)})` : '';
    return `Oi, ${nome}! Remarcamos seu ${kind} ✅\n📅 Novo horário: ${quando}${antes}\nConfirma pra mim?`;
  }
  if (type === 'reposicao') return `Oi, ${nome}! Sua reposição está marcada ✅\n📅 ${quando}\nConfirma pra mim?`;
  if (type === 'falta') return `Oi, ${nome}! Senti sua falta no treino de hoje. Está tudo bem? Quer que eu marque uma reposição${extra.suggest ? ` ${extra.suggest}` : ''}?`;
  if (type === 'cancelado') return `Oi, ${nome}! Precisei cancelar o treino de ${quando}. Vamos marcar a reposição? Me diz qual horário fica melhor pra você.`;
  return `Oi, ${nome}! Confirmando seu ${kind}:\n📅 ${quando}\nPosso contar com você? ✅`;
}
export function waLink(phone, text) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n && n.length <= 11) n = '55' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

// ---------- horários fixos ----------
export function slotLabel(s) { return `${DOW_SHORT[s.weekday]} ${hm(s.start_time)}`; }
