const { getGoogleAccessToken, sendToTokens } = require('./_lib/fcm');

// Scheduled daily via netlify.toml (schedule = "@daily"). Pushes the TRAINER
// (not the client) one consolidated notification listing every client whose
// active program has gone 28+ days without an adjustment — matches the
// "ajuste a cada 4 semanas" promise in the pricing plans.
const ADJUSTMENT_DAYS = 28;

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const programsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/workout_programs?is_active=eq.true&select=id,client_id,created_at,last_adjusted_at,adjustment_reminder_sent_at,profiles(full_name)`,
    { headers: SUPABASE_HEADERS },
  );
  const programs = await programsRes.json();
  if (!Array.isArray(programs)) {
    return { statusCode: 500, body: 'Failed to load programs' };
  }

  const cutoffMs = ADJUSTMENT_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const due = programs.filter((p) => {
    const reference = p.last_adjusted_at || p.created_at;
    if (!reference) return false;
    const referenceMs = new Date(reference).getTime();
    if (now - referenceMs < cutoffMs) return false;
    if (p.adjustment_reminder_sent_at && new Date(p.adjustment_reminder_sent_at).getTime() > referenceMs) return false;
    return true;
  });

  if (!due.length) {
    return { statusCode: 200, body: JSON.stringify({ notified: 0 }) };
  }

  const trainerRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?role=eq.trainer&select=id&limit=1`,
    { headers: SUPABASE_HEADERS },
  );
  const [trainer] = await trainerRes.json();
  if (!trainer) {
    return { statusCode: 500, body: 'No trainer profile found' };
  }

  const tokensRes = await fetch(
    `${SUPABASE_URL}/rest/v1/push_tokens?client_id=eq.${trainer.id}&select=fcm_token`,
    { headers: SUPABASE_HEADERS },
  );
  const tokenRows = await tokensRes.json();
  if (!Array.isArray(tokenRows) || !tokenRows.length) {
    return { statusCode: 200, body: JSON.stringify({ notified: 0, reason: 'trainer has no push token registered' }) };
  }

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to authenticate with Firebase: ' + err.message };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const names = due.map((p) => p.profiles?.full_name).filter(Boolean);
  const notification = {
    title: '🔁 Reajuste de treino pendente',
    body: names.length === 1
      ? `${names[0]} já passou de 4 semanas sem reajuste.`
      : `${names.length} clientes já passaram de 4 semanas sem reajuste: ${names.join(', ')}.`,
  };

  const { staleTokens } = await sendToTokens(accessToken, projectId, tokenRows.map((r) => r.fcm_token), notification);

  const nowIso = new Date().toISOString();
  await Promise.all(due.map((p) =>
    fetch(`${SUPABASE_URL}/rest/v1/workout_programs?id=eq.${p.id}`, {
      method: 'PATCH',
      headers: { ...SUPABASE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustment_reminder_sent_at: nowIso }),
    })
  ));

  if (staleTokens.length) {
    const inList = staleTokens.map((t) => `"${t}"`).join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${inList})`, {
      method: 'DELETE',
      headers: SUPABASE_HEADERS,
    });
  }

  return { statusCode: 200, body: JSON.stringify({ notified: due.length }) };
};
