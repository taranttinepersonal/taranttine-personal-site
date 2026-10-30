// Primeiro login do Plano 50 Dias: recebe o questionário do aluno, grava a
// anamnese e entrega a ficha do modelo certo (nível + local). Se a triagem de
// saúde der positivo, NÃO entrega a ficha: segura e avisa que o treinador
// vai falar com a pessoa antes.
const TEMPLATES = require('./_lib/plano50-templates.json');

const NIVEIS = ['iniciante', 'intermediario', 'avancado'];
const LOCAIS = ['academia', 'casa'];
const PLAN_WEEKS = 7; // 50 dias ≈ 7 semanas

const PARQ = [
  ['parq_coracao', 'Algum médico já disse que você tem problema de coração ou pressão alta?'],
  ['parq_peito', 'Sente dor no peito quando faz atividade física?'],
  ['parq_tontura', 'Já perdeu o equilíbrio por tontura ou desmaiou nos últimos 12 meses?'],
  ['parq_articular', 'Tem algum problema ósseo ou articular que piora com exercício?'],
  ['parq_remedio', 'Toma remédio para pressão ou coração?'],
  ['parq_gestante', 'Está grávida ou teve bebê nos últimos 3 meses?'],
  ['parq_medico', 'Algum médico já recomendou não fazer exercício, ou só com supervisão?'],
];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function pickTemplateKey(local, nivel) {
  // em casa só existem iniciante e intermediário: quem é avançado recebe o intermediário
  const n = local === 'casa' && nivel === 'avancado' ? 'intermediario' : nivel;
  return `${local}_${n}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const JH = { ...H, 'Content-Type': 'application/json' };

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return json(401, { error: 'Missing authorization' });
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: authHeader } });
  if (!userRes.ok) return json(401, { error: 'Invalid session' });
  const user = await userRes.json();

  const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=id,role,full_name,email,phone,plan,active,access_expires_at`, { headers: H });
  const [profile] = profRes.ok ? await profRes.json() : [];
  if (!profile || profile.role !== 'client' || profile.plan !== 'plano50') return json(403, { error: 'Conta sem Plano 50 Dias' });
  if (!profile.active || (profile.access_expires_at && new Date(profile.access_expires_at) < new Date())) {
    return json(403, { error: 'Acesso encerrado' });
  }

  const progRes = await fetch(`${SUPABASE_URL}/rest/v1/workout_programs?client_id=eq.${user.id}&is_active=eq.true&select=id`, { headers: H });
  const [already] = progRes.ok ? await progRes.json() : [];
  if (already) return json(200, { status: 'ok', note: 'ficha já entregue' });

  let b;
  try {
    b = JSON.parse(event.body || '{}');
  } catch (err) {
    return json(400, { error: 'JSON inválido' });
  }
  if (!NIVEIS.includes(b.nivel) || !LOCAIS.includes(b.local)) return json(400, { error: 'Escolha o nível e o local de treino.' });
  if (b.consentimento !== true) return json(400, { error: 'É preciso autorizar o uso dos dados de saúde.' });

  const parqPositivas = PARQ.filter(([k]) => b[k] === true).map(([, q]) => q);
  const respostas = {
    'Objetivo principal': String(b.objetivo || '').slice(0, 200),
    'Nível de treinamento (autoavaliação)': b.nivel,
    'Local de treino': b.local === 'casa' ? 'Em casa (peso do corpo e elástico)' : 'Academia',
    'Dores ou lesões': String(b.lesoes || '').slice(0, 500),
    'Intensidade da dor (0 a 10)': b.dor != null ? String(b.dor) : '',
    'Medicamentos em uso': String(b.medicamentos || '').slice(0, 300),
    'Triagem de saúde (PAR-Q)': parqPositivas.length ? `POSITIVA: ${parqPositivas.join(' | ')}` : 'Negativa em todas as perguntas',
    'Origem': 'Plano 50 Dias (Greenn)',
  };

  const profilePatch = {};
  if (b.nascimento && /^\d{4}-\d{2}-\d{2}$/.test(b.nascimento)) profilePatch.birth_date = b.nascimento;
  if (b.sexo === 'M' || b.sexo === 'F') profilePatch.sexo = b.sexo;

  await fetch(`${SUPABASE_URL}/rest/v1/anamneses`, {
    method: 'POST', headers: { ...JH, Prefer: 'return=minimal' },
    body: JSON.stringify({ client_id: user.id, source: 'online', full_name: profile.full_name, phone: profile.phone, email: profile.email, respostas }),
  });

  // triagem positiva: segura a ficha até o treinador conversar com o aluno
  if (parqPositivas.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH', headers: JH, body: JSON.stringify({ ...profilePatch, plan_hold: true }),
    });
    return json(200, { status: 'hold' });
  }

  const key = pickTemplateKey(b.local, b.nivel);
  const tpl = TEMPLATES[key];
  if (!tpl) return json(500, { error: 'Modelo de ficha não encontrado' });

  const healthNote = [
    'Plano 50 Dias. Se sentir qualquer dor ou desconforto durante o exercício, pare e avise pelo WhatsApp.',
    String(b.lesoes || '').trim() ? `Você informou: ${String(b.lesoes).trim().slice(0, 300)}. Respeite a amplitude confortável e reduza a carga nesses movimentos.` : '',
  ].filter(Boolean).join(' ');

  const progIns = await fetch(`${SUPABASE_URL}/rest/v1/workout_programs`, {
    method: 'POST', headers: { ...JH, Prefer: 'return=representation' },
    body: JSON.stringify({
      client_id: user.id, is_active: true, current_week: 1, total_weeks: PLAN_WEEKS,
      title: tpl.title, subtitle: tpl.subtitle, health_note: healthNote,
    }),
  });
  if (!progIns.ok) {
    console.error('plano50-onboard: programa', progIns.status, await progIns.text());
    return json(500, { error: 'Não consegui montar a ficha agora. Tente de novo em instantes.' });
  }
  const [program] = await progIns.json();

  const ICON = { 'Ativação': '⚡', 'Treino Principal': '🏋', 'Alongamento': '🧘' };
  try {
    for (let di = 0; di < tpl.days.length; di += 1) {
      const d = tpl.days[di];
      const dayRes = await fetch(`${SUPABASE_URL}/rest/v1/workout_days`, {
        method: 'POST', headers: { ...JH, Prefer: 'return=representation' },
        body: JSON.stringify({ program_id: program.id, label: d.label, title: d.title, sort_order: di }),
      });
      if (!dayRes.ok) throw new Error('day ' + (await dayRes.text()));
      const [day] = await dayRes.json();

      const rows = [];
      let n = 0;
      let so = 0;
      for (const [secTitle, items] of Object.entries(d.sections)) {
        const secRes = await fetch(`${SUPABASE_URL}/rest/v1/workout_sections`, {
          method: 'POST', headers: { ...JH, Prefer: 'return=representation' },
          body: JSON.stringify({ workout_day_id: day.id, title: secTitle, icon: ICON[secTitle] || null, sort_order: so }),
        });
        if (!secRes.ok) throw new Error('section ' + (await secRes.text()));
        const [sec] = await secRes.json();
        so += 1;
        for (const [exerciseId, sets, reps, rest, method, group, tip] of items) {
          rows.push({
            workout_day_id: day.id, section_id: sec.id, exercise_id: exerciseId, sets, reps,
            rest_seconds: rest, method, display_group: group, tip: tip || null, sort_order: n,
          });
          n += 1;
        }
      }
      const exRes = await fetch(`${SUPABASE_URL}/rest/v1/workout_exercises`, {
        method: 'POST', headers: { ...JH, Prefer: 'return=minimal' }, body: JSON.stringify(rows),
      });
      if (!exRes.ok) throw new Error('exercises ' + (await exRes.text()));
    }
  } catch (err) {
    console.error('plano50-onboard: clonagem falhou', err.message);
    // desfaz o programa pela cascata, para o aluno poder tentar de novo sem ficha pela metade
    await fetch(`${SUPABASE_URL}/rest/v1/workout_programs?id=eq.${program.id}`, { method: 'DELETE', headers: H });
    return json(500, { error: 'Não consegui montar a ficha agora. Tente de novo em instantes.' });
  }

  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
    method: 'PATCH', headers: JH, body: JSON.stringify({ ...profilePatch, plan_template: key, plan_hold: false }),
  });

  return json(200, { status: 'ok', template: key });
};
