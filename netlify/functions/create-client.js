exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return { statusCode: 401, body: 'Missing authorization' };

  // only the trainer may create a client
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
  const { full_name, email, phone, birth_date } = payload;
  if (!full_name || !email) return { statusCode: 400, body: 'Missing full_name/email' };

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const created = await createRes.json();
  if (!createRes.ok) {
    const message = created?.msg || created?.message || 'Falha ao criar o acesso (e-mail já pode estar em uso)';
    return { statusCode: createRes.status, body: JSON.stringify({ error: message }) };
  }

  const newId = created.id;
  const profileInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: 'POST',
    headers: { ...SUPABASE_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      id: newId,
      role: 'client',
      full_name,
      email,
      phone: phone || null,
      birth_date: birth_date || null,
      active: true,
    }),
  });
  if (!profileInsertRes.ok) {
    const errBody = await profileInsertRes.text();
    // roll back the auth user so a failed profile insert doesn't leave an orphaned login
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${newId}`, { method: 'DELETE', headers: SUPABASE_HEADERS });
    return { statusCode: 500, body: JSON.stringify({ error: 'Falha ao criar o perfil: ' + errBody }) };
  }

  return { statusCode: 200, body: JSON.stringify({ id: newId }) };
};
