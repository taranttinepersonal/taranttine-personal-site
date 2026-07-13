import { supabase } from '../../../app/js/supabaseClient.js';

const MEASUREMENT_FIELDS = [
  { key: 'cintura', label: 'Cintura', unit: 'cm' },
  { key: 'quadril', label: 'Quadril', unit: 'cm' },
  { key: 'braco', label: 'Braço', unit: 'cm' },
  { key: 'coxa', label: 'Coxa', unit: 'cm' },
];

const POSTURAL_CHECKLIST = [
  { key: 'cabeca', label: 'Cabeça' },
  { key: 'ombros', label: 'Ombros' },
  { key: 'escapulas', label: 'Escápulas' },
  { key: 'coluna', label: 'Coluna' },
  { key: 'quadril', label: 'Quadril' },
  { key: 'joelhos', label: 'Joelhos' },
  { key: 'pes', label: 'Pés' },
];

const POSTURAL_ANGLES = [
  { column: 'foto_lateral_direita', label: 'Lateral Direita' },
  { column: 'foto_lateral_esquerda', label: 'Lateral Esquerda' },
  { column: 'foto_posterior', label: 'Posterior' },
  { column: 'foto_anterior', label: 'Anterior' },
];

export async function renderReport(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profile }, { data: entries }, { data: photos }, { data: postural }] = await Promise.all([
    supabase.from('profiles').select('full_name, birth_date').eq('id', clientId).single(),
    supabase.from('progress_entries').select('id, recorded_at, weight_kg, body_fat_pct, measurements')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('progress_photos').select('id, storage_path, recorded_at')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(6),
    supabase.from('postural_assessments').select('recorded_at, notes, general_note, foto_anterior, foto_posterior, foto_lateral_direita, foto_lateral_esquerda')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1),
  ]);

  const photosWithUrls = await Promise.all((photos || []).map(async (p) => {
    const { data: signed } = await supabase.storage.from('progress-photos').createSignedUrl(p.storage_path, 3600);
    return { ...p, url: signed?.signedUrl || null };
  }));

  const latest = entries?.[0] || null;
  const previous = entries?.[1] || null;
  const posturalLatest = postural?.[0] || null;
  const age = calcAge(profile?.birth_date);

  const posturalPhotosWithUrls = posturalLatest ? await Promise.all(
    POSTURAL_ANGLES.map(async (a) => {
      const path = posturalLatest[a.column];
      if (!path) return { ...a, url: null };
      const { data: signed } = await supabase.storage.from('progress-photos').createSignedUrl(path, 3600);
      return { ...a, url: signed?.signedUrl || null };
    }),
  ) : [];

  main.innerHTML = `
    <div class="admin-header no-print">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Relatório de Avaliação</div>
      <div style="display:flex;gap:8px;">
        <a href="#/clientes" class="admin-btn">← Voltar</a>
        <button class="admin-btn primary" id="report-print">🖨️ Imprimir / Salvar PDF</button>
      </div>
    </div>

    <div class="report-doc">
      <div class="report-header">
        <img src="/app/icons/icon-192.png" class="report-logo" alt="Taranttine Personal">
        <div class="report-brand">TARANTTINE PERSONAL</div>
        <div class="report-brand-sub">Relatório de Avaliação Física</div>
      </div>

      <div class="report-client-row">
        <div><span class="report-label">Cliente</span><span class="report-value">${escapeHtml(profile?.full_name || '—')}</span></div>
        <div><span class="report-label">Idade</span><span class="report-value">${age != null ? age + ' anos' : '—'}</span></div>
        <div><span class="report-label">Data</span><span class="report-value">${formatDate(latest?.recorded_at) || formatDate(new Date().toISOString().slice(0, 10))}</span></div>
      </div>

      <div class="report-section-title">Composição Corporal</div>
      <div class="report-bars">
        ${renderDeltaBar('Peso', latest?.weight_kg, previous?.weight_kg, 'kg')}
        ${renderDeltaBar('% Gordura', latest?.body_fat_pct, previous?.body_fat_pct, '%')}
      </div>

      <div class="report-section-title">Medidas</div>
      <div class="report-bars">
        ${MEASUREMENT_FIELDS.map(f => renderDeltaBar(
          f.label, latest?.measurements?.[f.key], previous?.measurements?.[f.key], f.unit,
        )).join('')}
      </div>

      ${entries && entries.filter(e => e.weight_kg != null).length >= 2 ? `
        <div class="report-section-title">Histórico — Peso</div>
        ${renderChart(entries)}
      ` : ''}

      ${photosWithUrls.length ? `
        <div class="report-section-title">Fotos</div>
        <div class="report-photos">
          ${photosWithUrls.map(p => `
            <div class="report-photo">
              ${p.url ? `<img src="${p.url}" alt="Foto">` : ''}
              <div class="report-photo-date">${formatDate(p.recorded_at)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="report-section-title">Avaliação Postural</div>
      ${posturalLatest ? `
        ${posturalPhotosWithUrls.some(p => p.url) ? `
          <div class="postural-grid-photos">
            ${posturalPhotosWithUrls.map(p => `
              <div class="postural-grid-photo">
                ${p.url ? `
                  <div class="postural-grid-photo-frame">
                    <img src="${p.url}" alt="${p.label}">
                    <div class="postural-grid-overlay"></div>
                  </div>
                ` : `<div class="postural-grid-photo-frame empty"></div>`}
                <div class="postural-grid-photo-label">${p.label}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="report-postural">
          ${POSTURAL_CHECKLIST.filter(item => posturalLatest.notes?.[item.key]).map(item => `
            <div class="report-postural-row"><b>${item.label}</b><span>${escapeHtml(posturalLatest.notes[item.key])}</span></div>
          `).join('') || '<p class="report-empty">Sem itens registrados.</p>'}
          ${posturalLatest.general_note ? `<p class="report-postural-general">${escapeHtml(posturalLatest.general_note)}</p>` : ''}
          <div class="report-postural-date">Avaliado em ${formatDate(posturalLatest.recorded_at)}</div>
        </div>
      ` : `<p class="report-empty">Nenhuma avaliação postural registrada ainda.</p>`}

      <div class="report-footer">Taranttine Personal · taranttinepersonal.netlify.app</div>
    </div>
  `;

  document.getElementById('report-print').addEventListener('click', () => window.print());
}

function renderDeltaBar(label, current, previous, unit) {
  if (current == null) return '';
  const hasPrevious = previous != null && previous !== current;
  const delta = hasPrevious ? (current - previous) : null;
  const deltaText = delta != null ? `${delta > 0 ? '+' : ''}${round1(delta)}${unit}` : '';
  const maxVal = Math.max(current, previous || 0) || 1;

  return `
    <div class="report-bar-item">
      <div class="report-bar-label">
        <span>${label}</span>
        <span class="report-bar-value">${round1(current)}${unit}${deltaText ? ` <small>(${deltaText})</small>` : ''}</span>
      </div>
      ${hasPrevious ? `
        <div class="report-bar-track">
          <div class="report-bar-fill prev" style="width:${(previous / maxVal) * 100}%"></div>
        </div>
      ` : ''}
      <div class="report-bar-track">
        <div class="report-bar-fill current" style="width:${(current / maxVal) * 100}%"></div>
      </div>
    </div>
  `;
}

function renderChart(entries) {
  const withWeight = entries.filter(e => e.weight_kg != null).slice().reverse();
  const values = withWeight.map(e => Number(e.weight_kg));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 600;
  const h = 140;
  const step = w / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 30) - 15;
    return `${x},${y}`;
  }).join(' ');

  return `
    <div class="report-chart">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:140px;">
        <polyline points="${points}" fill="none" stroke="var(--report-accent)" stroke-width="2"/>
        ${values.map((v, i) => {
          const x = i * step;
          const y = h - ((v - min) / range) * (h - 30) - 15;
          return `<circle cx="${x}" cy="${y}" r="3" fill="var(--report-accent)"/>`;
        }).join('')}
      </svg>
      <div class="report-chart-dates">
        <span>${formatDate(withWeight[0].recorded_at)}</span>
        <span>${formatDate(withWeight[withWeight.length - 1].recorded_at)}</span>
      </div>
    </div>
  `;
}

function calcAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate + 'T00:00:00');
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
