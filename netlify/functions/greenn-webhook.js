// Recebe o aviso (webhook) da Greenn quando alguém compra, é reembolsado ou
// pede chargeback do "Plano 50 Dias". Configurar na Greenn:
//   Produto > Entrega e Integrações > Webhook > evento "Venda Paga"
//   (+ "Venda Reembolsada" e "Chargeback realizado")
//   URL: https://taranttinepersonal.netlify.app/.netlify/functions/greenn-webhook?k=<GREENN_WEBHOOK_SECRET>
//
// A Greenn não assina o envio, então a defesa é o segredo na URL (?k=) +
// conferir se o produto é o nosso + idempotência pelo id da venda.
const crypto = require('crypto');

const PLAN_DAYS = 50;
const SLOTS = 50;

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function digits(s) {
  return String(s || '').replace(/\D/g, '');
}

function isOurProduct(product) {
  if (!product) return false;
  const wanted = String(process.env.GREENN_PRODUCT_ID || '');
  if (wanted && String(product.id) === wanted) return true;
  return /plano\s*50\s*dias/i.test(String(product.name || ''));
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const secret = process.env.GREENN_WEBHOOK_SECRET;
  const given = (event.queryStringParameters && event.queryStringParameters.k) || '';
  if (!secret || !safeEqual(given, secret)) return json(401, { error: 'unauthorized' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const JH = { ...H, 'Content-Type': 'application/json' };

  let p;
  try {
    p = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'invalid json' });
  }

  if (p.type !== 'sale') return json(200, { ignored: 'type' });
  if (!isOurProduct(p.product)) return json(200, { ignored: 'product', product: p.product && p.product.id });

  const sale = p.sale || {};
  const client = p.client || {};
  const saleId = String(sale.id != null ? sale.id : '');
  const status = String(p.currentStatus || sale.status || '');
  const email = String(client.email || '').trim().toLowerCase();
  if (!saleId) return json(422, { error: 'sem id da venda' });

  const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/plan50_orders?greenn_sale_id=eq.${encodeURIComponent(saleId)}&select=id,client_id,status`, { headers: H });
  const [existing] = orderRes.ok ? await orderRes.json() : [];

  // ---------- reembolso / chargeback: encerra o acesso ----------
  if (status === 'refunded' || status === 'chargedback') {
    if (!existing) return json(200, { ignored: 'refund sem pedido' });
    await fetch(`${SUPABASE_URL}/rest/v1/plan50_orders?id=eq.${existing.id}`, {
      method: 'PATCH', headers: JH, body: JSON.stringify({ status }),
    });
    if (existing.client_id) {
      // só revoga quem entrou pelo Plano 50 — nunca mexe num aluno que já existia
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${existing.client_id}&plan=eq.plano50`, {
        method: 'PATCH', headers: JH,
        body: JSON.stringify({ active: false, access_expires_at: new Date().toISOString() }),
      });
    }
    return json(200, { ok: true, revoked: status });
  }

  if (status !== 'paid') return json(200, { ignored: 'status', status });
  if (existing) return json(200, { ok: true, duplicate: true });
  if (!email) return json(422, { error: 'sem e-mail do comprador' });

  // conta quantas vagas já foram vendidas (só para sinalizar excesso; a Greenn limita as vendas)
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/plan50_orders?status=eq.paid&select=id`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  });
  const sold = parseInt(String(countRes.headers.get('content-range') || '').split('/')[1], 10) || 0;

  const now = new Date();
  const expires = new Date(now.getTime() + PLAN_DAYS * 24 * 60 * 60 * 1000);
  const name = String(client.name || '').trim() || email;
  const phone = digits(client.cellphone) || null;
  const amount = sale.amount != null ? Number(sale.amount) : null;
  let note = sold >= SLOTS ? 'acima das 50 vagas' : null;

  // já existe perfil com esse e-mail?
  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id,plan,role,active`, { headers: H });
  const [prof] = profRes.ok ? await profRes.json() : [];

  let clientId = null;
  if (prof) {
    clientId = prof.id;
    if (prof.role === 'trainer' || (prof.plan !== 'plano50' && prof.active)) {
      // aluno já existente comprou o plano: não mexe na conta dele; o treinador decide
      note = [note, 'e-mail já é de aluno/treinador: conta não alterada'].filter(Boolean).join('; ');
    } else {
      // recompra do próprio Plano 50 (ou conta inativa): renova 50 dias
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${prof.id}`, {
        method: 'PATCH', headers: JH,
        body: JSON.stringify({ plan: 'plano50', active: true, plan_started_at: now.toISOString(), access_expires_at: expires.toISOString() }),
      });
    }
  } else {
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: JH, body: JSON.stringify({ email, email_confirm: true }),
    });
    const created = await createRes.json();
    if (!createRes.ok) {
      console.error('greenn-webhook: falha ao criar login', createRes.status, JSON.stringify(created));
      return json(500, { error: 'falha ao criar login' }); // 5xx: a Greenn pode reenviar
    }
    clientId = created.id;
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST', headers: { ...JH, Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: clientId, role: 'client', full_name: name, email, phone, active: true,
        plan: 'plano50', plan_started_at: now.toISOString(), access_expires_at: expires.toISOString(),
      }),
    });
    if (!insRes.ok) {
      console.error('greenn-webhook: falha ao criar perfil', insRes.status, await insRes.text());
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${clientId}`, { method: 'DELETE', headers: H });
      return json(500, { error: 'falha ao criar perfil' });
    }
  }

  const orderIns = await fetch(`${SUPABASE_URL}/rest/v1/plan50_orders`, {
    method: 'POST', headers: { ...JH, Prefer: 'return=minimal' },
    body: JSON.stringify({
      greenn_sale_id: saleId, client_id: clientId, email, full_name: name, phone, status: 'paid',
      amount, note, raw: p, paid_at: now.toISOString(),
    }),
  });
  if (!orderIns.ok) {
    console.error('greenn-webhook: falha ao gravar pedido', orderIns.status, await orderIns.text());
    return json(500, { error: 'falha ao gravar pedido' });
  }

  return json(200, { ok: true, client_id: clientId, sold: sold + 1 });
};
