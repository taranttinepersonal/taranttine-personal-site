const { getGoogleAccessToken, sendToTokens } = require('./_lib/fcm');

// Agendada para domingo 23h UTC (19h em Dourados, UTC-4 — ver netlify.toml).
// Lembra do check-in semanal só quem tem a consultoria nutricional liberada
// e ainda não respondeu o da semana (semana começa na segunda-feira).
function localWeekStart() {
  const local = new Date(Date.now() - 4 * 3600 * 1000);
  const dow = (local.getUTCDay() + 6) % 7;
  local.setUTCDate(local.getUTCDate() - dow);
  return local.toISOString().slice(0, 10);
}

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const week = localWeekStart();

  const [profilesRes, doneRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.client&active=eq.true&nutrition_consult=eq.true&select=id`, { headers: H }),
    fetch(`${SUPABASE_URL}/rest/v1/weekly_checkins?week_start=eq.${week}&select=client_id`, { headers: H }),
  ]);
  const profiles = await profilesRes.json();
  const done = await doneRes.json();
  if (!Array.isArray(profiles)) return { statusCode: 500, body: 'Failed to load profiles' };

  const answered = new Set((Array.isArray(done) ? done : []).map(r => r.client_id));
  const candidates = profiles.filter(p => !answered.has(p.id));
  if (!candidates.length) return { statusCode: 200, body: JSON.stringify({ week, reminded: 0 }) };

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to authenticate with Firebase: ' + err.message };
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;

  let reminded = 0;
  const stale = [];
  for (const client of candidates) {
    const tokensRes = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?client_id=eq.${client.id}&select=fcm_token`, { headers: H });
    const tokenRows = await tokensRes.json();
    if (!Array.isArray(tokenRows) || !tokenRows.length) continue;
    const { staleTokens } = await sendToTokens(
      accessToken, projectId, tokenRows.map(r => r.fcm_token),
      { title: '✅ Check-in da semana', body: 'Leva 1 minuto: me conta como foi sua semana pra eu ajustar o seu plano.' },
      'https://taranttinepersonal.netlify.app/app/#/checkin',
    );
    stale.push(...staleTokens);
    reminded++;
  }
  if (stale.length) {
    const inList = stale.map(t => `"${t}"`).join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${inList})`, { method: 'DELETE', headers: H });
  }
  return { statusCode: 200, body: JSON.stringify({ week, reminded, candidates: candidates.length }) };
};
