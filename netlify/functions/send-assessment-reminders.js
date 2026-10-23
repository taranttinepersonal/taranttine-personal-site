const { getGoogleAccessToken, sendToTokens } = require('./_lib/fcm');

// Diária às 23h UTC (19h em Dourados). Lembra do preparo quem tem
// avaliação agendada para o dia seguinte (horário local, UTC-4).
exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const localNow = new Date(Date.now() - 4 * 3600 * 1000);
  const tomorrow = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1));
  const from = new Date(tomorrow.getTime() + 4 * 3600 * 1000).toISOString();
  const to = new Date(tomorrow.getTime() + (24 + 4) * 3600 * 1000).toISOString();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.client&active=eq.true&next_assessment_at=gte.${from}&next_assessment_at=lt.${to}&select=id,next_assessment_at`, { headers: H });
  const clients = await res.json();
  if (!Array.isArray(clients)) return { statusCode: 500, body: 'Failed to load profiles' };
  if (!clients.length) return { statusCode: 200, body: JSON.stringify({ reminded: 0 }) };

  let accessToken;
  try { accessToken = await getGoogleAccessToken(); } catch (err) {
    return { statusCode: 500, body: 'Failed to authenticate with Firebase: ' + err.message };
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  let reminded = 0;
  const stale = [];
  for (const c of clients) {
    const tokensRes = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?client_id=eq.${c.id}&select=fcm_token`, { headers: H });
    const rows = await tokensRes.json();
    if (!Array.isArray(rows) || !rows.length) continue;
    const local = new Date(new Date(c.next_assessment_at).getTime() - 4 * 3600 * 1000);
    const hora = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
    const { staleTokens } = await sendToTokens(accessToken, projectId, rows.map(r => r.fcm_token),
      { title: `📅 Avaliação amanhã às ${hora}`, body: 'Jejum de 3–4 h, sem treino nas 12 h antes e sem álcool hoje. Veja o preparo completo no app.' },
      'https://taranttinepersonal.netlify.app/app/#/progresso');
    stale.push(...staleTokens);
    reminded++;
  }
  if (stale.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${stale.map(t => `"${t}"`).join(',')})`, { method: 'DELETE', headers: H });
  }
  return { statusCode: 200, body: JSON.stringify({ reminded }) };
};
