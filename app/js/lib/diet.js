import { supabase } from '../supabaseClient.js';

// Plano estruturado (aba Prescrição do painel) tem prioridade; se não
// houver, cai no plano antigo em texto/PDF (diet_plans). Quem só precisa
// saber se existe dieta (botão do menu) usa o retorno como booleano.
export async function fetchVisibleDiet(clientId) {
  const { data: np, error: npError } = await supabase
    .from('nutrition_plans')
    .select('plan, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!npError && np?.plan) return { kind: 'plan', plan: np.plan, created_at: np.created_at };
  const { data, error } = await supabase
    .from('diet_plans')
    .select('title, content_text, content_url')
    .eq('client_id', clientId)
    .eq('is_visible', true)
    .maybeSingle();
  if (error) {
    console.error('fetchVisibleDiet failed', error);
    return null;
  }
  return data ? { kind: 'legacy', ...data } : null;
}

export async function getDietFileUrl(path) {
  const { data, error } = await supabase.storage.from('diet-plan-files').createSignedUrl(path, 300);
  if (error) {
    console.error('getDietFileUrl failed', error);
    return null;
  }
  return data.signedUrl;
}
