const { getGoogleAccessToken, sendToTokens } = require('./_lib/fcm');

// Agendada a cada 5 min (netlify.toml). Avisa o treinador, por push, dos atendimentos e lembretes da agenda
// que estão na hora do aviso (padrão: 30 min antes; lembrete livre: na hora). Dourados = UTC-4.
// A regra é a mesma de app/js/lib/agenda.js (remindMinutes / reminderDue): se mudar lá, mude aqui.
const LOCAL_OFFSET_MS = 4 * 3600 * 1000;
const GRACE_MIN = 60;

const pad = (n) => String(n).padStart(2, '0');
const iso = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const localMs = (date, time) => { const [y, m, d] = date.split('-').map(Number); const [h, mi] = String(time).slice(0, 5).split(':').map(Number); return Date.UTC(y, m - 1, d, h, mi); };
function remindMinutes(ev) {
  if (ev.remind_before_min === -1) return null;
  if (ev.remind_before_min != null) return ev.remind_before_min;
  if (ev.kind === 'bloqueio') return null;
  return ev.kind === 'lembrete' ? 0 : 30;
}
function due(ev, nowLocal) {
  if (ev.status !== 'agendado' || ev.notified_at) return false;
  const mins = remindMinutes(ev);
  if (mins == null) return false;
  const start = localMs(ev.on_date, ev.start_time);
  return nowLocal >= start - mins * 60000 && nowLocal < start + GRACE_MIN * 60000;
}

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  const nowLocal = Date.now() - LOCAL_OFFSET_MS;
  const today = iso(nowLocal);
  const lastDay = iso(nowLocal + 2 * 86400000); // avisos de até 2 dias antes

  // garante que os treinos dos horários fixos de hoje/amanhã já existam, mesmo sem abrir o app
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/agenda_generate`, { method: 'POST', headers: H, body: JSON.stringify({ p_from: today, p_to: lastDay }) });

  const evRes = await fetch(`${SUPABASE_URL}/rest/v1/agenda_events?status=eq.agendado&notified_at=is.null&on_date=gte.${today}&on_date=lte.${lastDay}&select=*`, { headers: H });
  const events = await evRes.json();
  if (!Array.isArray(events)) return { statusCode: 500, body: 'Failed to load agenda' };
  const dueEvents = events.filter(ev => due(ev, nowLocal));
  if (!dueEvents.length) return { statusCode: 200, body: JSON.stringify({ notified: 0 }) };

  const trainerRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.trainer&select=id`, { headers: H });
  const trainers = await trainerRes.json();
  const tokens = [];
  for (const t of Array.isArray(trainers) ? trainers : []) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?client_id=eq.${t.id}&select=fcm_token`, { headers: H });
    const rows = await r.json();
    if (Array.isArray(rows)) tokens.push(...rows.map(x => x.fcm_token));
  }
  if (!tokens.length) return { statusCode: 200, body: JSON.stringify({ notified: 0, reason: 'trainer has no push token' }) };

  const ids = [...new Set(dueEvents.map(e => e.client_id).filter(Boolean))];
  const names = {};
  if (ids.length) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,full_name`, { headers: H });
    for (const p of await r.json()) names[p.id] = p.full_name;
  }

  let accessToken;
  try { accessToken = await getGoogleAccessToken(); } catch (err) {
    return { statusCode: 500, body: 'Failed to authenticate with Firebase: ' + err.message };
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const stale = [];
  let notified = 0;
  for (const ev of dueEvents) {
    const hora = String(ev.start_time).slice(0, 5);
    const quem = ev.client_id ? (names[ev.client_id] || '').split(' ')[0] : '';
    const title = ev.kind === 'lembrete' ? `🔔 ${ev.title || 'Lembrete'}` : `📅 ${hora} · ${quem || ev.title || 'Compromisso'}`;
    const label = { treino: 'Treino', reposicao: 'Reposição', avaliacao: 'Avaliação', consulta: 'Consulta' }[ev.kind] || '';
    const body = ev.kind === 'lembrete' ? (ev.note || `Hoje às ${hora}`) : `${label}${ev.on_date !== today ? ` (${ev.on_date.slice(8, 10)}/${ev.on_date.slice(5, 7)})` : ''} às ${hora}${ev.note ? ` · ${ev.note}` : ''}`;
    const { staleTokens } = await sendToTokens(accessToken, projectId, tokens, { title, body }, 'https://taranttinepersonal.netlify.app/admin/#/agenda');
    stale.push(...staleTokens);
    // marca como avisado pra não repetir
    await fetch(`${SUPABASE_URL}/rest/v1/agenda_events?id=eq.${ev.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ notified_at: new Date().toISOString() }) });
    notified++;
  }
  if (stale.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${[...new Set(stale)].map(t => `"${t}"`).join(',')})`, { method: 'DELETE', headers: H });
  }
  return { statusCode: 200, body: JSON.stringify({ notified }) };
};
