import { supabase } from '../supabaseClient.js';

export async function fetchTarget(clientId) {
  const { data, error } = await supabase
    .from('nutrition_targets')
    .select('calories, protein_g, carb_g, fat_g')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    console.error('fetchTarget failed', error);
    return null;
  }
  return data;
}

export async function saveTarget(clientId, target) {
  const { error } = await supabase.from('nutrition_targets').upsert(
    { client_id: clientId, ...target, updated_at: new Date().toISOString() },
    { onConflict: 'client_id' },
  );
  if (error) throw error;
}

export async function fetchEntriesForDate(clientId, dateISO) {
  const { data, error } = await supabase
    .from('food_entries')
    .select('id, logged_at, meal_type, description, calories, protein_g, carb_g, fat_g, source, created_at')
    .eq('client_id', clientId)
    .eq('logged_at', dateISO)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchEntriesForDate failed', error);
    return [];
  }
  return data;
}

export async function estimateFromDescription(description) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  const res = await fetch('/.netlify/functions/estimate-nutrition', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveEntry(clientId, entry) {
  const { error } = await supabase.from('food_entries').insert({
    client_id: clientId,
    logged_at: entry.loggedAt,
    meal_type: entry.mealType,
    description: entry.description,
    calories: entry.calories,
    protein_g: entry.protein_g,
    carb_g: entry.carb_g,
    fat_g: entry.fat_g,
    source: entry.source || 'agent',
  });
  if (error) throw error;
}

export async function deleteEntry(entryId) {
  const { error } = await supabase.from('food_entries').delete().eq('id', entryId);
  if (error) throw error;
}
