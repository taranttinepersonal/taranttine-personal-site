import { supabase } from '../../../app/js/supabaseClient.js';
import { sumSkinfolds, calcBodyFat } from '../../../app/js/lib/skinfold.js';
import { classificar } from '../../../app/js/lib/trainingLevel.js';
import { MEASUREMENT_FIELDS } from '../../../app/js/lib/progress.js';

const BIOIMPEDANCE_FIELDS = [
  { key: 'peso', label: 'Peso', unit: 'kg' },
  { key: 'percentual_gordura', label: '% Gordura', unit: '%' },
  { key: 'massa_muscular_esqueletica', label: 'Massa Muscular Esquelética', unit: 'kg' },
  { key: 'massa_gordura', label: 'Massa de Gordura', unit: 'kg' },
  { key: 'gordura_visceral', label: 'Gordura Visceral', unit: '' },
  { key: 'relacao_cintura_quadril', label: 'Relação Cintura-Quadril', unit: '' },
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

const CHART_COLORS = ['#00b894', '#6c5ce7', '#e17055', '#0984e3', '#fdcb6e', '#d63384'];

function seriesFrom(entries, key) {
  return (entries || [])
    .filter(e => e[key] != null)
    .map(e => ({ date: e.recorded_at, value: Number(e[key]) }))
    .reverse();
}

const POSTURAL_ANGLES = [
  { column: 'foto_lateral_direita', label: 'Lateral Direita' },
  { column: 'foto_lateral_esquerda', label: 'Lateral Esquerda' },
  { column: 'foto_posterior', label: 'Posterior' },
  { column: 'foto_anterior', label: 'Anterior' },
];

export async function renderReport(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profile }, { data: entries }, { data: photos }, { data: postural }, { data: skinfolds }, { data: bioimpedances }, { data: levels }, { data: anamneses }, { data: savedReports }] = await Promise.all([
    supabase.from('profiles').select('full_name, birth_date').eq('id', clientId).single(),
    supabase.from('progress_entries').select('id, recorded_at, weight_kg, body_fat_pct, measurements')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('progress_photos').select('id, storage_path, recorded_at')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(6),
    supabase.from('postural_assessments').select('recorded_at, notes, general_note, foto_anterior, foto_posterior, foto_lateral_direita, foto_lateral_esquerda')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1),
    supabase.from('skinfold_assessments').select('*')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('bioimpedance_assessments').select('*')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('training_level_assessments').select('*')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }),
    supabase.from('anamneses').select('recorded_at, respostas')
      .eq('client_id', clientId).order('recorded_at', { ascending: false }).limit(1),
    supabase.from('assessment_reports').select('id, recorded_at, storage_path, created_at')
      .eq('client_id', clientId).order('created_at', { ascending: false }),
  ]);

  const photosWithUrls = await Promise.all((photos || []).map(async (p) => {
    const { data: signed } = await supabase.storage.from('progress-photos').createSignedUrl(p.storage_path, 3600);
    return { ...p, url: signed?.signedUrl || null };
  }));

  const latest = entries?.[0] || null;
  const previous = entries?.[1] || null;
  const posturalLatest = postural?.[0] || null;
  const age = calcAge(profile?.birth_date);

  const skinfoldCurrent = skinfolds?.[0] ? { ...skinfolds[0], sum: sumSkinfolds(skinfolds[0]) } : null;
  const skinfoldPrevious = skinfolds?.[1] ? { ...skinfolds[1], sum: sumSkinfolds(skinfolds[1]) } : null;
  const skinfoldResultCurrent = skinfoldCurrent ? calcBodyFat({ sexo: skinfoldCurrent.sexo, age, sum: skinfoldCurrent.sum }) : null;
  const skinfoldResultPrevious = skinfoldPrevious ? calcBodyFat({ sexo: skinfoldPrevious.sexo, age, sum: skinfoldPrevious.sum }) : null;

  const bioCurrent = bioimpedances?.[0] || null;
  const bioPrevious = bioimpedances?.[1] || null;

  const levelCurrent = levels?.[0] || null;
  const levelPrevious = levels?.[1] || null;
  const levelClassCurrent = levelCurrent ? classificar(levelCurrent.score_final) : null;

  const anamneseLatest = anamneses?.[0] || null;

  // séries de evolução (ordem cronológica ascendente) pros gráficos de comparação
  const weightSeries = seriesFrom(entries, 'weight_kg');
  const bodyFatSeries = seriesFrom(entries, 'body_fat_pct');
  const measurementSeries = MEASUREMENT_FIELDS.map((f, i) => ({
    label: f.label,
    color: CHART_COLORS[i % CHART_COLORS.length],
    points: (entries || [])
      .filter(e => e.measurements?.[f.key] != null)
      .map(e => ({ date: e.recorded_at, value: Number(e.measurements[f.key]) }))
      .reverse(),
  }));
  const skinfoldSumSeries = (skinfolds || [])
    .map(s => ({ date: s.recorded_at, value: sumSkinfolds(s) }))
    .reverse();
  const skinfoldFatSeries = (skinfolds || [])
    .map(s => {
      const result = calcBodyFat({ sexo: s.sexo, age, sum: sumSkinfolds(s) });
      return result ? { date: s.recorded_at, value: result.bodyFatPct } : null;
    })
    .filter(Boolean)
    .reverse();
  const bioSeries = BIOIMPEDANCE_FIELDS.map(f => ({
    field: f,
    points: (bioimpedances || [])
      .filter(b => b[f.key] != null)
      .map(b => ({ date: b.recorded_at, value: Number(b[f.key]) }))
      .reverse(),
  }));
  const levelScoreSeries = (levels || [])
    .filter(l => l.score_final != null)
    .map(l => ({ date: l.recorded_at, value: Number(l.score_final) }))
    .reverse();

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
        <button class="admin-btn" id="report-print">🖨️ Imprimir</button>
        <button class="admin-btn primary" id="report-save-pdf">💾 Gerar e Salvar PDF</button>
      </div>
    </div>
    <div class="admin-msg no-print" id="report-save-msg"></div>

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

      ${anamneseLatest?.respostas?.['Objetivo principal'] ? `
        <p class="report-postural-general" style="margin:-4px 0 16px;">🎯 Objetivo: ${escapeHtml(anamneseLatest.respostas['Objetivo principal'])}</p>
      ` : ''}

      <div class="report-section-title">Composição Corporal</div>
      <div class="report-bars">
        ${renderDeltaBar('Peso', latest?.weight_kg, previous?.weight_kg, 'kg')}
        ${renderDeltaBar('% Gordura', latest?.body_fat_pct, previous?.body_fat_pct, '%')}
      </div>
      ${renderMultiTrendChart([{ label: 'Peso', color: CHART_COLORS[0], points: weightSeries }], 'kg', 'Evolução — Peso')}
      ${renderMultiTrendChart([{ label: '% Gordura', color: CHART_COLORS[1], points: bodyFatSeries }], '%', 'Evolução — % Gordura')}

      <div class="report-section-title">Medidas</div>
      <div class="report-bars">
        ${MEASUREMENT_FIELDS.map(f => renderDeltaBar(
          f.label, latest?.measurements?.[f.key], previous?.measurements?.[f.key], f.unit,
        )).join('')}
      </div>
      ${renderMultiTrendChart(measurementSeries, 'cm', 'Evolução — Medidas')}

      ${skinfoldResultCurrent ? `
        <div class="report-section-title">Composição Corporal — Dobras Cutâneas (Pollock 7 pontos)</div>
        <div class="report-bars">
          ${renderDeltaBar('Soma das dobras', skinfoldCurrent.sum, skinfoldPrevious?.sum, 'mm')}
          ${renderDeltaBar('% Gordura (dobras)', skinfoldResultCurrent.bodyFatPct, skinfoldResultPrevious?.bodyFatPct, '%')}
        </div>
        ${skinfoldCurrent.general_note ? `<p class="report-postural-general">${escapeHtml(skinfoldCurrent.general_note)}</p>` : ''}
        ${renderMultiTrendChart([{ label: 'Soma das dobras', color: CHART_COLORS[2], points: skinfoldSumSeries }], 'mm', 'Evolução — Soma das Dobras')}
        ${renderMultiTrendChart([{ label: '% Gordura (dobras)', color: CHART_COLORS[3], points: skinfoldFatSeries }], '%', 'Evolução — % Gordura (dobras)')}
      ` : ''}

      ${bioCurrent ? `
        <div class="report-section-title">Composição Corporal — Bioimpedância</div>
        <div class="report-bars">
          ${BIOIMPEDANCE_FIELDS.map(f => renderDeltaBar(f.label, bioCurrent[f.key], bioPrevious?.[f.key], f.unit)).join('')}
        </div>
        ${bioCurrent.general_note ? `<p class="report-postural-general">${escapeHtml(bioCurrent.general_note)}</p>` : ''}
        ${bioSeries.map((s, i) => renderMultiTrendChart(
          [{ label: s.field.label, color: CHART_COLORS[i % CHART_COLORS.length], points: s.points }],
          s.field.unit, `Evolução — ${s.field.label}`,
        )).join('')}
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

      ${levelCurrent ? `
        <div class="report-section-title">Nível de Treinamento</div>
        <div class="report-bars">
          <div class="report-bar-item">
            <div class="report-bar-label">
              <span>Classificação</span>
              <span class="report-bar-value">${levelClassCurrent?.label || '—'}</span>
            </div>
          </div>
          ${renderDeltaBar('Score', levelCurrent.score_final, levelPrevious?.score_final, '')}
        </div>
        ${renderMultiTrendChart([{ label: 'Score', color: CHART_COLORS[4], points: levelScoreSeries }], '', 'Evolução — Nível de Treinamento')}
        ${levelCurrent.general_note ? `<p class="report-postural-general">${escapeHtml(levelCurrent.general_note)}</p>` : ''}
      ` : ''}

      <div class="report-footer">Taranttine Personal · taranttinepersonal.netlify.app</div>
    </div>

    <div class="no-print">
      <div class="admin-section-title">Documentos Salvos</div>
      ${savedReports && savedReports.length ? `
        <div class="admin-card" id="saved-reports-list">
          ${savedReports.map(r => `
            <div class="admin-row" data-report-id="${r.id}">
              <div>
                <div class="admin-row-name">${formatDate(r.recorded_at)}</div>
                <div class="admin-row-sub">Gerado em ${new Date(r.created_at).toLocaleString('pt-BR')}</div>
              </div>
              <div class="admin-row-actions">
                <a href="#" class="admin-btn saved-report-open" data-path="${r.storage_path}">Abrir</a>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="admin-empty">Nenhum PDF salvo ainda. Gere um acima depois de concluir a avaliação.</div>`}
    </div>
  `;

  document.getElementById('report-print').addEventListener('click', () => window.print());

  main.querySelectorAll('.saved-report-open').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const { data: signed } = await supabase.storage.from('assessment-reports').createSignedUrl(link.dataset.path, 3600);
      if (signed?.signedUrl) window.open(signed.signedUrl, '_blank');
    });
  });

  document.getElementById('report-save-pdf').addEventListener('click', async () => {
    const btn = document.getElementById('report-save-pdf');
    const msg = document.getElementById('report-save-msg');
    btn.disabled = true;
    msg.classList.remove('error');
    msg.textContent = 'Gerando PDF...';
    try {
      const { jsPDF } = await import('https://esm.sh/jspdf@2.5.2');
      const html2canvas = (await import('https://esm.sh/html2canvas@1.4.1')).default;

      const el = main.querySelector('.report-doc');
      el.classList.add('pdf-export');
      const restoreImages = await inlineImagesAsDataUrls(el);
      const SCALE = 2;
      let canvas;
      let domBreakpoints;
      try {
        domBreakpoints = collectSafeBreakpoints(el);
        canvas = await html2canvas(el, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true });
      } finally {
        el.classList.remove('pdf-export');
        restoreImages();
      }

      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const ptPerCanvasPx = imgWidth / canvas.width;
      const pageHeightCanvasPx = pageHeight / ptPerCanvasPx;
      const canvasBreakpoints = domBreakpoints.map(y => y * SCALE);

      let cursor = 0;
      let firstPage = true;
      while (cursor < canvas.height - 1) {
        const idealEnd = cursor + pageHeightCanvasPx;
        let end = null;
        for (const bp of canvasBreakpoints) {
          if (bp > cursor && bp <= idealEnd) end = bp;
        }
        if (end === null) end = Math.min(idealEnd, canvas.height);

        const sliceHeightCanvasPx = end - cursor;
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightCanvasPx;
        sliceCanvas.getContext('2d').drawImage(
          canvas, 0, cursor, canvas.width, sliceHeightCanvasPx, 0, 0, canvas.width, sliceHeightCanvasPx,
        );
        const sliceData = sliceCanvas.toDataURL('image/jpeg', 0.92);

        if (!firstPage) pdf.addPage();
        pdf.addImage(sliceData, 'JPEG', 0, 0, imgWidth, sliceHeightCanvasPx * ptPerCanvasPx);
        firstPage = false;
        cursor = end;
      }

      const blob = pdf.output('blob');
      const dateStr = (latest?.recorded_at) || new Date().toISOString().slice(0, 10);
      const path = `${clientId}/${dateStr}-${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage.from('assessment-reports').upload(path, blob, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('assessment_reports').insert([{
        client_id: clientId,
        recorded_at: dateStr,
        storage_path: path,
      }]);
      if (insertError) throw insertError;

      msg.textContent = '✅ PDF salvo no histórico do cliente!';
      setTimeout(() => renderReport(main, clientId), 900);
    } catch (err) {
      msg.textContent = 'Erro ao gerar/salvar PDF: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });
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

// Gráfico de evolução genérico — recebe uma ou mais séries {label, color, points:
// [{date, value}]} já em ordem cronológica ascendente. Séries com menos de 2
// pontos são ignoradas; se nenhuma sobrar, não renderiza nada (sem histórico
// suficiente ainda pra comparar).
function renderMultiTrendChart(seriesList, unit, title) {
  const usable = seriesList.filter(s => s.points && s.points.length >= 2);
  if (!usable.length) return '';

  const allValues = usable.flatMap(s => s.points.map(p => p.value));
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = (max - min) || 1;

  const allDates = usable.flatMap(s => s.points.map(p => p.date)).sort();
  const minDate = new Date(allDates[0] + 'T00:00:00').getTime();
  const maxDate = new Date(allDates[allDates.length - 1] + 'T00:00:00').getTime();
  const dateRange = (maxDate - minDate) || 1;

  const w = 600;
  const h = 140;
  const x = (d) => ((new Date(d + 'T00:00:00').getTime() - minDate) / dateRange) * w;
  const y = (v) => h - ((v - min) / range) * (h - 30) - 15;

  const lines = usable.map(s => {
    const pts = s.points.map(p => `${x(p.date)},${y(p.value)}`).join(' ');
    const dots = s.points.map(p => `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="3" fill="${s.color}"/>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>${dots}`;
  }).join('');

  const legend = usable.length > 1 ? `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;">
      ${usable.map(s => `
        <span style="font-size:10px;color:var(--report-muted);display:inline-flex;align-items:center;gap:4px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};"></span>${escapeHtml(s.label)}
        </span>
      `).join('')}
    </div>
  ` : '';

  return `
    <div class="report-section-title" style="font-size:12px;margin:14px 0 8px;">${title}</div>
    <div class="report-chart">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:140px;">${lines}</svg>
      <div class="report-chart-dates">
        <span>${formatDate(allDates[0])}</span>
        <span>${formatDate(allDates[allDates.length - 1])}</span>
      </div>
      ${legend}
    </div>
  `;
}

// html2canvas costuma renderizar imagens de outra origem (fotos assinadas do
// Supabase Storage) como um quadro preto/vazio mesmo com useCORS — baixamos e
// convertemos pra data URL antes de capturar, o que elimina o problema de vez.
async function inlineImagesAsDataUrls(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  const originals = imgs.map(img => img.src);
  await Promise.all(imgs.map(async (img) => {
    if (!img.src) return;
    try {
      const res = await fetch(img.src);
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      img.src = dataUrl;
      await img.decode().catch(() => {});
    } catch {
      // se a imagem não puder ser baixada, mantém o src original
    }
  }));
  return () => {
    imgs.forEach((img, i) => { img.src = originals[i]; });
  };
}

// Pontos seguros pra cortar página no PDF: topo de cada bloco/foto dentro do
// relatório, pra quebra de página nunca cair no meio de uma foto ou linha.
function collectSafeBreakpoints(root) {
  const rootTop = root.getBoundingClientRect().top;
  const selector = [
    '.report-header', '.report-client-row', '.report-section-title',
    '.report-bar-item', '.report-photo', '.postural-grid-photo',
    '.report-chart', '.report-postural-row', '.report-postural-general',
    '.report-postural-date', '.report-footer',
  ].join(', ');
  const ys = new Set([0, root.scrollHeight]);
  root.querySelectorAll(selector).forEach((node) => {
    ys.add(node.getBoundingClientRect().top - rootTop);
  });
  return Array.from(ys).sort((a, b) => a - b);
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
