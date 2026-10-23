// Lê um laudo de exame (PDF ou foto) com IA e grava os valores em
// lab_imports para revisão. Função de background: o Netlify responde 202 na
// hora e ela roda até 15 min; o app acompanha o status pela tabela.
// Environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

const CONSENT_VERSION = '2026-10b'; // igual a app/js/lib/consent.js

const CODES = {
  glicemia: 'Glicemia de jejum (mg/dL)', hba1c: 'Hemoglobina glicada (%)', insulina: 'Insulina de jejum (µUI/mL)',
  ct: 'Colesterol total (mg/dL)', ldl: 'LDL (mg/dL)', hdl: 'HDL (mg/dL)', tg: 'Triglicerídeos (mg/dL)',
  tgo: 'TGO/AST (U/L)', tgp: 'TGP/ALT (U/L)', ggt: 'Gama-GT (U/L)', creatinina: 'Creatinina (mg/dL)', ureia: 'Ureia (mg/dL)',
  acido_urico: 'Ácido úrico (mg/dL)', hemoglobina: 'Hemoglobina (g/dL)', ferritina: 'Ferritina (ng/mL)', ferro: 'Ferro sérico (µg/dL)',
  b12: 'Vitamina B12 (pg/mL)', vitd: 'Vitamina D 25-OH (ng/mL)', tsh: 'TSH (µUI/mL)', t4l: 'T4 livre (ng/dL)', pcr: 'Proteína C reativa (mg/L)',
};

const numOrNull = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const strOrNull = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const SCHEMA = {
  type: 'object',
  properties: {
    data_coleta: strOrNull,
    laboratorio: strOrNull,
    resultados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codigo: { type: 'string', enum: [...Object.keys(CODES), 'outro'] },
          nome_no_laudo: { type: 'string' },
          valor: { type: 'number' },
          unidade: strOrNull,
          ref_min: numOrNull,
          ref_max: numOrNull,
        },
        required: ['codigo', 'nome_no_laudo', 'valor', 'unidade', 'ref_min', 'ref_max'],
        additionalProperties: false,
      },
    },
  },
  required: ['data_coleta', 'laboratorio', 'resultados'],
  additionalProperties: false,
};

const SYSTEM = `Você extrai resultados de laudos de exames laboratoriais brasileiros para uma ficha de acompanhamento nutricional.
Regras:
- Copie os números exatamente como estão no laudo. Não invente, não arredonde, não estime. Se não conseguir ler um valor com segurança, não inclua o exame.
- "codigo": use o código do catálogo quando o exame for claramente o mesmo; senão use "outro".
- "unidade": a unidade impressa no laudo, como está.
- "ref_min"/"ref_max": a faixa de referência do próprio laudo para a idade e o sexo do paciente, quando houver. "Até X" → ref_max = X, ref_min = null. "Acima de X" / "maior que X" → ref_min = X. Se houver várias faixas (desejável, limítrofe, alto), use o limite do valor desejável/normal. Sem referência → null.
- Use vírgula decimal brasileira como ponto no número (5,4 → 5.4). Separador de milhar não é decimal.
- Para glicemia, use só a de jejum; para hemograma, só a hemoglobina.
- "data_coleta": data da coleta no formato AAAA-MM-DD; se não houver, a data do laudo; se nenhuma, null.
Catálogo: ${Object.entries(CODES).map(([k, v]) => `${k} = ${v}`).join('; ')}.`;

exports.handler = async (event) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return;

  let importId;
  try { importId = JSON.parse(event.body || '{}').importId; } catch { return; }
  if (!importId) return;

  const setStatus = (patch) => fetch(`${SUPABASE_URL}/rest/v1/lab_imports?id=eq.${importId}`, { method: 'PATCH', headers: H, body: JSON.stringify(patch) });
  const fail = (erro) => setStatus({ status: 'erro', erro });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: authHeader } });
  if (!userRes.ok) return;
  const user = await userRes.json();

  const [imp] = await (await fetch(`${SUPABASE_URL}/rest/v1/lab_imports?id=eq.${importId}&select=*`, { headers: H })).json();
  if (!imp) return;
  if (imp.client_id !== user.id) {
    const [prof] = await (await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: H })).json();
    if (!prof || prof.role !== 'trainer') return fail('sem_permissao');
  }

  // o dado é do aluno: vale o consentimento dele, mesmo quando o treinador envia
  const [consent] = await (await fetch(`${SUPABASE_URL}/rest/v1/consents?client_id=eq.${imp.client_id}&versao=eq.${CONSENT_VERSION}&select=uso_ia_exames`, { headers: H })).json();
  if (!consent?.uso_ia_exames) return fail('sem_consentimento');

  await setStatus({ status: 'lendo' });

  const fileRes = await fetch(`${SUPABASE_URL}/storage/v1/object/lab-files/${imp.arquivo}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!fileRes.ok) return fail('arquivo_nao_encontrado');
  const data = Buffer.from(await fileRes.arrayBuffer()).toString('base64');
  const isPdf = imp.media_type === 'application/pdf';
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: imp.media_type, data } };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: 'Extraia os resultados deste laudo.' }] }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    }),
  });
  if (!res.ok) return fail('ia_erro: ' + (await res.text()).slice(0, 300));
  const out = await res.json();
  if (out.stop_reason === 'refusal') return fail('ia_recusou');
  if (out.stop_reason === 'max_tokens') return fail('ia_cortou');
  const text = (out.content || []).find((b) => b.type === 'text')?.text;
  let resultado;
  try { resultado = JSON.parse(text || ''); } catch { return fail('ia_resposta_invalida'); }

  await setStatus({ status: 'pronto', resultado });
};
