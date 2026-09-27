import { supabase } from '../../../app/js/supabaseClient.js';

export async function renderAnamneseReport(main, clientId, anamneseId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profile }, { data: anamnese }] = await Promise.all([
    supabase.from('profiles').select('full_name, birth_date').eq('id', clientId).single(),
    supabase.from('anamneses').select('*').eq('id', anamneseId).single(),
  ]);

  if (!anamnese) {
    main.innerHTML = `<div class="admin-empty">Anamnese não encontrada.</div>`;
    return;
  }

  const respostas = anamnese.respostas || {};
  const entries = Object.entries(respostas).filter(([, v]) => v != null && String(v).length);

  main.innerHTML = `
    <div class="admin-header no-print">
      <div class="admin-title">${escapeHtml(profile?.full_name || anamnese.full_name || '')} · Anamnese</div>
      <div style="display:flex;gap:8px;">
        <a href="#/cliente/${clientId}/avaliacao" class="admin-btn">← Voltar</a>
        <button class="admin-btn primary" id="report-print">🖨️ Imprimir / Salvar PDF</button>
      </div>
    </div>

    <div class="report-doc">
      <div class="report-header">
        <img src="/app/icons/icon-192.png" class="report-logo" alt="Taranttine Personal">
        <div class="report-brand">TARANTTINE PERSONAL</div>
        <div class="report-brand-sub">Anamnese${anamnese.source === 'presencial' ? ' — Avaliação Presencial' : ''}</div>
      </div>

      <div class="report-client-row">
        <div><span class="report-label">Cliente</span><span class="report-value">${escapeHtml(profile?.full_name || anamnese.full_name || '—')}</span></div>
        <div><span class="report-label">Data</span><span class="report-value">${formatDate(anamnese.recorded_at)}</span></div>
        <div><span class="report-label">Origem</span><span class="report-value">${anamnese.source === 'presencial' ? 'Presencial' : 'Formulário online'}</span></div>
      </div>

      <div class="report-section-title">Respostas</div>
      <div class="report-postural">
        ${entries.length ? entries.map(([k, v]) => `
          <div class="report-postural-row"><b>${escapeHtml(k)}</b><span>${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}</span></div>
        `).join('') : '<p class="report-empty">Sem respostas registradas.</p>'}
      </div>

      <div class="report-footer">Taranttine Personal · taranttinepersonal.netlify.app</div>
    </div>
  `;

  document.getElementById('report-print').addEventListener('click', () => window.print());
}

function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate.length > 10 ? isoDate : isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
