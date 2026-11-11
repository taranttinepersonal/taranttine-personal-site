import { supabase } from '../../../app/js/supabaseClient.js';

// Biblioteca inteira de exercícios (≈1.900). O PostgREST devolve no máximo 1.000 linhas por consulta,
// então busca em páginas.
let cache = null;
export async function getExerciseLibrary() {
  if (cache) return cache;
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('exercises').select('id, name, muscle_groups(name)').order('name').range(from, from + 999);
    if (error) { console.error(error); return rows; }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  cache = rows;
  return rows;
}
