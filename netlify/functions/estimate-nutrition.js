// Environment variables required (Netlify dashboard > Site settings > Environment variables):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já conhecidas — mesmas usadas no resto do projeto)
//   ANTHROPIC_API_KEY (console.anthropic.com > API Keys)

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) return { statusCode: 401, body: 'Missing authorization' };

  // qualquer usuário autenticado (cliente ou treinador) pode estimar — é um
  // registro pessoal, não uma ação administrativa
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_KEY, Authorization: authHeader },
  });
  if (!userRes.ok) return { statusCode: 401, body: 'Invalid session' };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }
  const description = (payload.description || '').trim();
  if (!description) return { statusCode: 400, body: 'Missing description' };

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
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
      max_tokens: 1024,
      system: 'Você estima calorias e macronutrientes de refeições a partir de uma descrição em português, pra um app de registro alimentar brasileiro. "note" é uma frase curta (até 15 palavras) explicando a suposição feita (porções, preparo) quando a descrição for vaga. Use valores plausíveis pra porções brasileiras comuns quando a quantidade não for especificada.',
      messages: [{ role: 'user', content: description }],
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              calories: { type: 'number' },
              protein_g: { type: 'number' },
              carb_g: { type: 'number' },
              fat_g: { type: 'number' },
              note: { type: 'string' },
            },
            required: ['calories', 'protein_g', 'carb_g', 'fat_g', 'note'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return { statusCode: 502, body: 'Anthropic API error: ' + errText };
  }

  const anthropicData = await anthropicRes.json();
  if (anthropicData.stop_reason === 'refusal') {
    return { statusCode: 502, body: 'Estimate refused: ' + JSON.stringify(anthropicData.stop_details || {}) };
  }
  const textBlock = (anthropicData.content || []).find((b) => b.type === 'text');

  let estimate;
  try {
    estimate = JSON.parse(textBlock?.text || '');
  } catch (err) {
    return { statusCode: 502, body: 'Failed to parse estimate: ' + (textBlock?.text || '') };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      calories: Number(estimate.calories) || null,
      protein_g: Number(estimate.protein_g) || null,
      carb_g: Number(estimate.carb_g) || null,
      fat_g: Number(estimate.fat_g) || null,
      note: estimate.note || null,
    }),
  };
};
