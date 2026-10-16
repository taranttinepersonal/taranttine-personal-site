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
    supabase.from('bioimpedance_assessments').select('recorded_at, peso, percentual_gordura, taxa_metabolica_basal')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1),
    supabase.from('progress_entries').select('recorded_at, weight_kg, body_fat_pct')
      .eq('client_id', clientId).not('weight_kg', 'is', null).not('body_fat_pct', 'is', null)
      .order('recorded_at', { ascending: false }).limit(1),
  ]);

  const age = profile?.birth_date ? calcAge(profile.birth_date) : null;
  const sexo = profile?.sexo || null;

  // Basal que a própria balança de bioimpedância mostra — guardado à parte
  // pra aparecer ao lado do calculado, sem misturar os dois.
  const deviceBmr = bio?.[0]?.taxa_metabolica_basal ? Math.round(Number(bio[0].taxa_metabolica_basal)) : null;
  if (bio?.[0]?.peso && bio[0].percentual_gordura) {
    return { weightKg: Number(bio[0].peso), bodyFatPct: Number(bio[0].percentual_gordura), source: 'bioimpedância', recordedAt: bio[0].recorded_at, age, sexo, deviceBmr };
  }
  if (entries?.[0]) {
    return { weightKg: Number(entries[0].weight_kg), bodyFatPct: Number(entries[0].body_fat_pct), source: 'evolução', recordedAt: entries[0].recorded_at, age, sexo, deviceBmr };
  }
  return { weightKg: null, bodyFatPct: null, source: null, recordedAt: null, age, sexo, deviceBmr };
}

const HORMONE_KEYWORDS = ['hormôni', 'hormoni', 'esteroide', 'estero', 'anabolizante', 'trt', 'testosterona'];

export async function fetchAnamneseHints(clientId) {
  const { data } = await supabase.from('anamneses').select('respostas')
    .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1).maybeSingle();
  const respostas = data?.respostas || {};
  const goal = respostas['Objetivo principal'] || respostas['Descreva sua meta em detalhes'] || null;
  const medicamentos = respostas['Medicamentos em uso'] || '';
  const hormoneUse = HORMONE_KEYWORDS.some(kw => medicamentos.toLowerCase().includes(kw));
  return { goal, hormoneUse };
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

// Katch-McArdle — usa massa magra (peso x (1 - %gordura)), não precisa de altura.
export function calculateBMR({ weightKg, bodyFatPct }) {
  const leanMassKg = weightKg * (1 - bodyFatPct / 100);
  return Math.round(370 + 21.6 * leanMassKg);
}

// O basal é estimativa: a fórmula erra ~10% e o %gordura da bioimpedância
// pode variar 3-5 pontos. Mostrar como faixa evita tratar o número como medida.
export function bmrRange(bmr) {
  return { low: Math.round(bmr * 0.9), high: Math.round(bmr * 1.1) };
}

// Proteína pela massa magra: 2,2 g/kg de massa magra (2,4 no emagrecimento,
// pra proteger músculo no déficit). Em quem é magro equivale a ~1,6-2,0 g/kg
// de peso total; em quem tem muita gordura evita superestimar a meta.
// Quem usa hormônios (indicado na anamnese, aplicado pelo treinador) segue
// 2,75 g/kg de peso total, pela maior capacidade de síntese/retenção de nitrogênio.
// Gordura 0,8g/kg de peso total; carboidrato preenche o restante das calorias.
export function calculateTargetSuggestion({ weightKg, bodyFatPct, activityLevel, goal, hormoneUse = false }) {
  const bmr = calculateBMR({ weightKg, bodyFatPct });
  const tdee = bmr * (ACTIVITY_FACTORS[activityLevel] || ACTIVITY_FACTORS.moderado);
  const calories = Math.round(tdee * (1 + (GOAL_ADJUSTMENTS[goal] ?? 0)));

  const leanMassKg = weightKg * (1 - bodyFatPct / 100);
  const proteinPerKgLean = goal === 'emagrecimento' ? 2.4 : 2.2;
  const protein_g = hormoneUse
    ? Math.round(weightKg * 2.75)
    : Math.round(leanMassKg * proteinPerKgLean);
  const fat_g = Math.round(weightKg * 0.8);
  const remainingCalories = calories - (protein_g * 4) - (fat_g * 9);
  const carb_g = Math.max(0, Math.round(remainingCalories / 4));

  return { bmr, calories, protein_g, carb_g, fat_g };
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
