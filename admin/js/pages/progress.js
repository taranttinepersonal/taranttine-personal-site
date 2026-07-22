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

  const exerciseSeries = await fetchExerciseSeries(clientId);

  const weightSeries = (entries || [])
    .filter(e => e.weight_kg != null)
    .map(e => ({ date: e.recorded_at, value: Number(e.weight_kg) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Evolução</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>

    ${weightSeries.length >= 2 ? `
      <div class="admin-section-title">Peso</div>
      <div class="admin-card">${renderLineChart(weightSeries, 'kg')}</div>
    ` : ''}

    ${exerciseSeries.length ? `
      <div class="admin-section-title">Carga e Volume por Exercício</div>
      <div class="admin-card">
        <label style="display:block;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Exercício</label>
        <select id="exercise-select" style="width:100%;background:var(--black3);border:1.5px solid var(--border2);border-radius:8px;padding:10px;color:var(--text);font-size:14px;font-family:'Inter',sans-serif;">
          ${exerciseSeries.map((ex, i) => `<option value="${i}">${escapeHtml(ex.name)}</option>`).join('')}
        </select>
        <div id="exercise-chart-container" style="margin-top:14px;"></div>
      </div>
    ` : ''}

    ${entries && entries.length ? `
      <div class="admin-section-title">Registros</div>
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

  const select = document.getElementById('exercise-select');
  if (select) {
    const renderSelected = () => {
      const ex = exerciseSeries[Number(select.value)];
      document.getElementById('exercise-chart-container').innerHTML = renderExerciseCharts(ex);
    };
    select.addEventListener('change', renderSelected);
    renderSelected();
  }
}

async function fetchExerciseSeries(clientId) {
  const { data: program } = await supabase
    .from('workout_programs').select('id').eq('client_id', clientId).eq('is_active', true).maybeSingle();
  if (!program) return [];

  const { data: days } = await supabase.from('workout_days').select('id').eq('program_id', program.id);
  const dayIds = (days || []).map(d => d.id);
  if (!dayIds.length) return [];

  const { data: workoutExercises } = await supabase
    .from('workout_exercises')
    .select('id, sets, reps, exercises(name)')
    .in('workout_day_id', dayIds);
  if (!workoutExercises || !workoutExercises.length) return [];

  const { data: history } = await supabase
    .from('load_history')
    .select('workout_exercise_id, load_value, logged_on')
    .eq('client_id', clientId)
    .order('logged_on', { ascending: true });

  const historyByExercise = {};
  (history || []).forEach(h => { (historyByExercise[h.workout_exercise_id] ||= []).push(h); });

  return workoutExercises
    .filter(we => historyByExercise[we.id]?.length)
    .map(we => {
      const reps = parseRepsAvg(we.reps);
      const sets = parseNum(we.sets) || 1;
      const points = historyByExercise[we.id].map(h => {
        const load = parseNum(h.load_value);
        return {
          date: h.logged_on,
          load,
          volume: (load != null && reps != null) ? load * reps * sets : null,
        };
      });
      return { name: we.exercises?.name || 'Exercício', sets, reps, points };
    });
}

function renderExerciseCharts(ex) {
  const loadSeries = ex.points.filter(p => p.load != null).map(p => ({ date: p.date, value: p.load }));
  const volumeSeries = ex.points.filter(p => p.volume != null).map(p => ({ date: p.date, value: p.volume }));

  return `
    ${loadSeries.length >= 2 ? `
      <div class="admin-row-sub" style="margin-bottom:6px;">Carga (kg)</div>
      ${renderLineChart(loadSeries, 'kg')}
    ` : '<div class="admin-empty">Poucos registros de carga ainda pra esse exercício.</div>'}
    ${volumeSeries.length >= 2 ? `
      <div class="admin-row-sub" style="margin:14px 0 6px;">Volume estimado (séries × reps × carga) — ${ex.sets}×${ex.reps || '—'} prescrito</div>
      ${renderLineChart(volumeSeries, '')}
    ` : ''}
  `;
}

function renderLineChart(series, unit) {
  const values = series.map(s => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 600;
  const h = 140;
  const step = series.length > 1 ? w / (series.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 30) - 15;
    return `${x},${y}`;
  }).join(' ');

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:140px;">
      <polyline points="${points}" fill="none" stroke="var(--green)" stroke-width="2"/>
      ${values.map((v, i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * (h - 30) - 15;
        return `<circle cx="${x}" cy="${y}" r="3" fill="var(--green)"/>`;
      }).join('')}
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px;">
      <span>${formatDate(series[0].date)} · ${round1(values[0])}${unit}</span>
      <span>${formatDate(series[series.length - 1].date)} · ${round1(values[values.length - 1])}${unit}</span>
    </div>
  `;
}

function parseNum(str) {
  if (str == null) return null;
  const match = String(str).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseRepsAvg(reps) {
  if (reps == null) return null;
  const nums = String(reps).match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const values = nums.map(Number);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
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
