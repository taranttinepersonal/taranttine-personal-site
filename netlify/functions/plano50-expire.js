// Agendada (netlify.toml, @daily): desativa quem passou dos 50 dias do Plano 50
// Dias, para não receber lembretes de aluno ativo. O acesso ao treino já fica
// bloqueado no app pela data (access_expires_at); aqui só limpamos o estado.
// Não mexe em quem já virou aluno efetivo (plan nulo).
exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const now = new Date().toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?plan=eq.plano50&active=eq.true&access_expires_at=lt.${encodeURIComponent(now)}&select=id`,
    { method: 'PATCH', headers: H, body: JSON.stringify({ active: false }) },
  );
  if (!res.ok) {
    console.error('plano50-expire falhou', res.status, await res.text());
    return { statusCode: 500, body: 'falha' };
  }
  const changed = await res.json();
  console.log(`plano50-expire: ${changed.length} acesso(s) encerrado(s)`);
  return { statusCode: 200, body: JSON.stringify({ expired: changed.length }) };
};
