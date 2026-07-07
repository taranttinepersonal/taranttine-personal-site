const crypto = require('crypto');

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
  let sent = 0;
  let failed = 0;
  const staleTokens = [];

  for (const row of tokenRows) {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: row.fcm_token,
            notification: { title, body },
            webpush: { fcm_options: { link: 'https://taranttinepersonal.netlify.app/app/#/treino' } },
          },
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failed++;
        const errBody = await res.json().catch(() => null);
        const code = errBody?.error?.details?.find((d) => d.errorCode)?.errorCode;
        if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') staleTokens.push(row.fcm_token);
      }
    } catch (err) {
      failed++;
    }
  }

  if (staleTokens.length) {
    const inList = staleTokens.map((t) => `"${t}"`).join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${inList})`, {
      method: 'DELETE',
      headers: SUPABASE_HEADERS,
    });
  }

  return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
};

function b64url(input) {
  const base64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessToken() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const jwt = `${signingInput}.${b64url(signature)}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenJson.access_token) throw new Error(JSON.stringify(tokenJson));
  return tokenJson.access_token;
}
