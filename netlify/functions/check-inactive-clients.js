const { getGoogleAccessToken, sendToTokens } = require('./_lib/fcm');
const MESSAGES = require('./_lib/reminderMessages');

// Scheduled daily via netlify.toml (schedule = "@daily"). Reminds clients who
// haven't opened the app in INACTIVE_DAYS days, at most once every INACTIVE_DAYS
// days per client (tracked via profiles.last_reminder_sent_at).
const INACTIVE_DAYS = 2;

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const profilesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?role=eq.client&active=eq.true&select=id,full_name,created_at,last_active_at,last_reminder_sent_at,last_reminder_message_index`,
    { headers: SUPABASE_HEADERS },
  );
  const profiles = await profilesRes.json();
  if (!Array.isArray(profiles)) {
    return { statusCode: 500, body: 'Failed to load profiles' };
  }

  const cutoff = Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  const candidates = profiles.filter((p) => {
    const lastSeen = p.last_active_at ? new Date(p.last_active_at).getTime() : new Date(p.created_at).getTime();
    if (lastSeen > cutoff) return false;
    if (p.last_reminder_sent_at && new Date(p.last_reminder_sent_at).getTime() > cutoff) return false;
    return true;
  });

  if (!candidates.length) {
    return { statusCode: 200, body: JSON.stringify({ reminded: 0 }) };
  }

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to authenticate with Firebase: ' + err.message };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;

  let reminded = 0;
  const staleTokensAll = [];

  for (const client of candidates) {
    const tokensRes = await fetch(
      `${SUPABASE_URL}/rest/v1/push_tokens?client_id=eq.${client.id}&select=fcm_token`,
      { headers: SUPABASE_HEADERS },
    );
    const tokenRows = await tokensRes.json();
    if (!Array.isArray(tokenRows) || !tokenRows.length) continue;

    const nextIndex = ((client.last_reminder_message_index ?? -1) + 1) % MESSAGES.length;
    const notification = MESSAGES[nextIndex];

    const { staleTokens } = await sendToTokens(accessToken, projectId, tokenRows.map((r) => r.fcm_token), notification);
    staleTokensAll.push(...staleTokens);

    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${client.id}`, {
      method: 'PATCH',
      headers: { ...SUPABASE_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_reminder_sent_at: new Date().toISOString(), last_reminder_message_index: nextIndex }),
    });
    reminded++;
  }

  if (staleTokensAll.length) {
    const inList = staleTokensAll.map((t) => `"${t}"`).join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${inList})`, {
      method: 'DELETE',
      headers: SUPABASE_HEADERS,
    });
  }

  return { statusCode: 200, body: JSON.stringify({ reminded, candidates: candidates.length }) };
};
