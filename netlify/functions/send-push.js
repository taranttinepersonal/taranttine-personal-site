const { getGoogleAccessToken, sendToTokens } = require('./_lib/fcm');

// Environment variables required (set in Netlify dashboard > Site settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (already known — same values used everywhere else in this project)
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY  (from the Firebase service account JSON)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return { statusCode: 401, body: 'Missing authorization' };

  // only the trainer may trigger a push send
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: authHeader },
  });
  if (!userRes.ok) return { statusCode: 401, body: 'Invalid session' };
  const user = await userRes.json();

  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: SUPABASE_HEADERS });
  const [profile] = await profileRes.json();
  if (!profile || profile.role !== 'trainer') return { statusCode: 403, body: 'Forbidden' };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }
  const { title, body, target_client_id } = payload;
  if (!title || !body) return { statusCode: 400, body: 'Missing title/body' };

  const tokensUrl = target_client_id
    ? `${SUPABASE_URL}/rest/v1/push_tokens?client_id=eq.${target_client_id}&select=fcm_token`
    : `${SUPABASE_URL}/rest/v1/push_tokens?select=fcm_token,profiles!inner(active)&profiles.active=eq.true`;

  const tokensRes = await fetch(tokensUrl, { headers: SUPABASE_HEADERS });
  const tokenRows = await tokensRes.json();
  if (!Array.isArray(tokenRows) || !tokenRows.length) {
    return { statusCode: 200, body: JSON.stringify({ sent: 0, failed: 0 }) };
  }

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to authenticate with Firebase: ' + err.message };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const { sent, failed, staleTokens } = await sendToTokens(
    accessToken, projectId, tokenRows.map((r) => r.fcm_token), { title, body },
  );

  if (staleTokens.length) {
    const inList = staleTokens.map((t) => `"${t}"`).join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${inList})`, {
      method: 'DELETE',
      headers: SUPABASE_HEADERS,
    });
  }

  return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
};
