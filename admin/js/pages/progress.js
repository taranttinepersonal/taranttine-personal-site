import { supabase } from '../../../app/js/supabaseClient.js';

const MEASUREMENT_FIELDS = [
  { key: 'cintura', label: 'Cintura' },
  { key: 'quadril', label: 'Quadril' },
  { key: 'braco', label: 'Braço' },
  { key: 'coxa', label: 'Coxa' },
];

export async function renderProgress(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();
  const { data: entries } = await supabase
    .from('progress_entries')
    .select('id, recorded_at, weight_kg, body_fat_pct, measurements, note')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false });
  const { data: photos } = await supabase
    .from('progress_photos')
    .select('id, storage_path, recorded_at')
    .eq('client_id', clientId)
    .order('recorded_at', { ascending: false });

  const photosWithUrls = await Promise.all((photos || []).map(async (p) => {
    const { data: signed } = await supabase.storage.from('progress-photos').createSignedUrl(p.storage_path, 3600);
    return { ...p, url: signed?.signedUrl || null };
  }));

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Evolução</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>

    ${entries && entries.length ? `
      <div class="admin-card">
        ${entries.map(e => `
          <div class="admin-row">
            <div>
              <div class="admin-row-name">${formatDate(e.recorded_at)}</div>
              <div class="admin-row-sub">${entryStats(e)}</div>
              ${e.note ? `<div class="admin-row-sub" style="margin-top:4px;">💬 ${escapeHtml(e.note)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    ` : `<div class="admin-empty">Nenhum registro ainda.</div>`}

    ${photosWithUrls.length ? `
      <div class="admin-section-title">Fotos</div>
      <div class="admin-card" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
        ${photosWithUrls.map(p => `
          <div style="text-align:center;">
            ${p.url ? `<img src="${p.url}" alt="Foto" style="width:100%;border-radius:8px;aspect-ratio:1;object-fit:cover;">` : ''}
            <div style="font-size:10px;color:var(--muted);margin-top:4px;">${formatDate(p.recorded_at)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

function entryStats(entry) {
  const stats = [];
  if (entry.weight_kg != null) stats.push(`⚖️ ${entry.weight_kg}kg`);
  if (entry.body_fat_pct != null) stats.push(`% Gordura: ${entry.body_fat_pct}%`);
  if (entry.measurements) {
    for (const f of MEASUREMENT_FIELDS) {
      if (entry.measurements[f.key] != null) stats.push(`${f.label}: ${entry.measurements[f.key]}cm`);
    }
  }
  return stats.join(' · ') || '—';
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
