import { supabase } from '../supabaseClient.js';

export async function fetchVisibleDiet(clientId) {
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
  return data;
}

export async function getDietFileUrl(path) {
  const { data, error } = await supabase.storage.from('diet-plan-files').createSignedUrl(path, 300);
  if (error) {
    console.error('getDietFileUrl failed', error);
    return null;
  }
  return data.signedUrl;
}
