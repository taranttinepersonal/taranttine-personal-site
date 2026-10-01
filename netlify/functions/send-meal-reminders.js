const { getGoogleAccessToken, sendToTokens } = require('./_lib/fcm');

// Agendada de hora em hora (netlify.toml). Em cada execução, confere se a
// hora UTC atual bate com algum horário de refeição (já convertido de
// horário de Brasília, UTC-4) e, se bater, lembra só quem ainda não
// registrou aquela refeição hoje — nunca manda duplicado pra quem já anotou.
const MEAL_SCHEDULE = [
  { utcHour: 12, mealType: 'cafe', title: '🍽 Café da manhã', body: 'Não esqueça de registrar o que você comeu hoje.' },
  { utcHour: 16, mealType: 'almoco', title: '🍽 Almoço', body: 'Já registrou o almoço de hoje?' },
  { utcHour: 20, mealType: 'lanche', title: '🍽 Lanche', body: 'Hora do lanche — registra pra manter o controle do dia.' },
  { utcHour: 0, mealType: 'jantar', title: '🍽 Jantar', body: 'Não esqueça de registrar o jantar antes de dormir.' },
];

exports.handler = async () => {
  const currentUtcHour = new Date().getUTCHours();
  const meal = MEAL_SCHEDULE.find((m) => m.utcHour === currentUtcHour);
  if (!meal) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, currentUtcHour }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

  const todayISO = new Date().toISOString().slice(0, 10);

  const [profilesRes, loggedRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.client&active=eq.true&select=id`, { headers: SUPABASE_HEADERS }),
    fetch(`${SUPABASE_URL}/rest/v1/food_entries?logged_at=eq.${todayISO}&meal_type=eq.${meal.mealType}&select=client_id`, { headers: SUPABASE_HEADERS }),
  ]);
  const profiles = await profilesRes.json();
  const logged = await loggedRes.json();
  if (!Array.isArray(profiles)) return { statusCode: 500, body: 'Failed to load profiles' };

  const alreadyLogged = new Set((Array.isArray(logged) ? logged : []).map((e) => e.client_id));
  const candidates = profiles.filter((p) => !alreadyLogged.has(p.id));
  if (!candidates.length) {
    return { statusCode: 200, body: JSON.stringify({ meal: meal.mealType, reminded: 0 }) };
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

    const { staleTokens } = await sendToTokens(
      accessToken, projectId, tokenRows.map((r) => r.fcm_token),
      { title: meal.title, body: meal.body },
      'https://taranttinepersonal.netlify.app/app/#/nutricao',
    );
    staleTokensAll.push(...staleTokens);
    reminded++;
  }

  if (staleTokensAll.length) {
    const inList = staleTokensAll.map((t) => `"${t}"`).join(',');
    await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?fcm_token=in.(${inList})`, {
      method: 'DELETE',
      headers: SUPABASE_HEADERS,
    });
  }

  return { statusCode: 200, body: JSON.stringify({ meal: meal.mealType, reminded, candidates: candidates.length }) };
};
