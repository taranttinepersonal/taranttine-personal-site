// Estado público da oferta Plano 50 Dias (vagas e janela da campanha), usado
// pela página /plano50/. Só devolve números; nenhum dado de comprador.
const SLOTS = 50;
// Campanha: 03/11 a 16/11/2026, horário de Mato Grosso do Sul (UTC-4)
const DEFAULT_START = '2026-11-03T00:00:00-04:00';
const DEFAULT_END = '2026-11-16T23:59:59-04:00';

exports.handler = async () => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const start = new Date(process.env.PLANO50_START || DEFAULT_START);
  const end = new Date(process.env.PLANO50_END || DEFAULT_END);

  let sold = 0;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/plan50_orders?status=eq.paid&select=id`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'count=exact', Range: '0-0' },
    });
    sold = parseInt(String(res.headers.get('content-range') || '').split('/')[1], 10) || 0;
  } catch (err) {
    console.error('plano50-status: contagem falhou', err.message);
  }

  const now = new Date();
  const remaining = Math.max(0, SLOTS - sold);
  let state = 'open';
  if (now < start) state = 'soon';
  else if (now > end) state = 'closed';
  else if (remaining === 0) state = 'soldout';

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=20' },
    body: JSON.stringify({ state, total: SLOTS, sold, remaining, opens_at: start.toISOString(), closes_at: end.toISOString() }),
  };
};
