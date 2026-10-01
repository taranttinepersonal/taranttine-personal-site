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

// Puxa peso + %gordura mais recentes já registrados na Avaliação, priorizando
// bioimpedância (os dois valores vêm medidos juntos, no mesmo aparelho) sobre
// o autorrelato em Evolução.
export async function fetchBodyComposition(clientId) {
  const [{ data: profile }, { data: bio }, { data: entries }] = await Promise.all([
    supabase.from('profiles').select('birth_date, sexo').eq('id', clientId).single(),
    supabase.from('bioimpedance_assessments').select('recorded_at, peso, percentual_gordura')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1),
    supabase.from('progress_entries').select('recorded_at, weight_kg, body_fat_pct')
      .eq('client_id', clientId).not('weight_kg', 'is', null).not('body_fat_pct', 'is', null)
      .order('recorded_at', { ascending: false }).limit(1),
  ]);

  const age = profile?.birth_date ? calcAge(profile.birth_date) : null;
  const sexo = profile?.sexo || null;

  if (bio?.[0]) {
    return { weightKg: Number(bio[0].peso), bodyFatPct: Number(bio[0].percentual_gordura), source: 'bioimpedância', recordedAt: bio[0].recorded_at, age, sexo };
  }
  if (entries?.[0]) {
    return { weightKg: Number(entries[0].weight_kg), bodyFatPct: Number(entries[0].body_fat_pct), source: 'evolução', recordedAt: entries[0].recorded_at, age, sexo };
  }
  return { weightKg: null, bodyFatPct: null, source: null, recordedAt: null, age, sexo };
}

export async function fetchGoalHint(clientId) {
  const { data } = await supabase.from('anamneses').select('respostas')
    .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  return data?.respostas?.['Objetivo principal'] || data?.respostas?.['Descreva sua meta em detalhes'] || null;
}

const ACTIVITY_FACTORS = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
};

const GOAL_ADJUSTMENTS = {
  emagrecimento: -0.20,
  manutencao: 0,
  ganho_de_massa: 0.10,
};

// Katch-McArdle (usa massa magra, não precisa de altura) + ajuste por
// objetivo. Proteína 2g/kg e gordura 0,8g/kg de peso total (não massa magra),
// carboidrato preenche o restante das calorias.
export function calculateTargetSuggestion({ weightKg, bodyFatPct, activityLevel, goal }) {
  const leanMassKg = weightKg * (1 - bodyFatPct / 100);
  const bmr = 370 + 21.6 * leanMassKg;
  const tdee = bmr * (ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS.moderado);
  const calories = Math.round(tdee * (1 + (GOAL_ADJUSTMENTS[goal] ?? 0)));

  const protein_g = Math.round(weightKg * 2.0);
  const fat_g = Math.round(weightKg * 0.8);
  const remainingCalories = calories - (protein_g * 4) - (fat_g * 9);
  const carb_g = Math.max(0, Math.round(remainingCalories / 4));

  return { calories, protein_g, carb_g, fat_g };
}

function calcAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate + 'T00:00:00');
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
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
