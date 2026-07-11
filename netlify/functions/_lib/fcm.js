const crypto = require('crypto');

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

async function sendToTokens(accessToken, projectId, fcmTokens, notification) {
  let sent = 0;
  let failed = 0;
  const staleTokens = [];

  for (const fcmToken of fcmTokens) {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification,
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
        if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') staleTokens.push(fcmToken);
      }
    } catch (err) {
      failed++;
    }
  }

  return { sent, failed, staleTokens };
}

module.exports = { getGoogleAccessToken, sendToTokens };
