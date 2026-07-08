import { supabase } from '../supabaseClient.js';

export async function fetchEntries(clientId) {
  const { data, error } = await supabase
    .from('progress_entries')
    .select('id, recorded_at, weight_kg, body_fat_pct, measurements, note')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false });
  if (error) {
    console.error('fetchEntries failed', error);
    return [];
  }
  return data;
}

export async function saveEntry(clientId, entry) {
  const { error } = await supabase.from('progress_entries').insert({
    client_id: clientId,
    recorded_at: entry.recordedAt,
    weight_kg: entry.weightKg || null,
    body_fat_pct: entry.bodyFatPct || null,
    measurements: entry.measurements || null,
    note: entry.note || null,
  });
  if (error) throw error;
}

export async function fetchPhotos(clientId) {
  const { data, error } = await supabase
    .from('progress_photos')
    .select('id, storage_path, recorded_at')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false });
  if (error) {
    console.error('fetchPhotos failed', error);
    return [];
  }
  const withUrls = await Promise.all(data.map(async (p) => {
    const { data: signed } = await supabase.storage
      .from('progress-photos')
      .createSignedUrl(p.storage_path, 3600);
    return { ...p, url: signed?.signedUrl || null };
  }));
  return withUrls;
}

export async function uploadPhoto(clientId, file, recordedAt) {
  const ext = file.name.split('.').pop();
  const path = `${clientId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('progress-photos')
    .upload(path, file);
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('progress_photos').insert({
    client_id: clientId,
    storage_path: path,
    recorded_at: recordedAt,
  });
  if (error) throw error;
}
