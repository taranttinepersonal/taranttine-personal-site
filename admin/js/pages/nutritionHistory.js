import { supabase } from '../../../app/js/supabaseClient.js';
import { fetchTarget } from '../../../app/js/lib/nutrition.js';
import { fetchDailyHistory, fetchWeightSeries, summarizeHistory, renderHistoryHtml } from '../../../app/js/lib/nutritionHistory.js';
import { buildTrendChart } from '../../../app/js/lib/chart.js';

export async function renderNutritionHistory(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profile }, target] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', clientId).single(),
    fetchTarget(clientId),
  ]);

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Nutrição</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>
    <div class="admin-card">
      ${target ? `
        <div class="admin-row-sub">Meta atual: <b style="color:var(--white);">${target.calories ?? '—'}kcal</b> · proteína ${target.protein_g ?? '—'}g · carbo ${target.carb_g ?? '—'}g · gordura ${target.fat_g ?? '—'}g</div>
      ` : `<div class="admin-row-sub">Este cliente ainda não definiu uma meta na aba Nutrição do app.</div>`}
    </div>
    <div class="admin-card">
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="admin-btn primary" data-days="7">7 dias</button>
        <button class="admin-btn" data-days="30">30 dias</button>
        <button class="admin-btn" data-days="60">60 dias</button>
      </div>
      <div id="nutri-history-body"></div>
    </div>
  `;

  const body = document.getElementById('nutri-history-body');
  const buttons = main.querySelectorAll('[data-days]');

  async function load(days) {
    buttons.forEach(b => b.classList.toggle('primary', Number(b.dataset.days) === days));
    body.innerHTML = `<div class="admin-empty">Carregando...</div>`;
    const [daily, weightSeries] = await Promise.all([fetchDailyHistory(clientId, days), fetchWeightSeries(clientId, days)]);
    if (!daily.length) {
      body.innerHTML = `<div class="admin-empty">Não consegui carregar o histórico.</div>`;
      return;
    }
    if (!daily.some(d => d.calories)) {
      body.innerHTML = `<div class="admin-empty">Nenhuma refeição registrada nesse período.</div>`;
      return;
    }
    body.innerHTML = renderHistoryHtml({ daily, summary: summarizeHistory(daily, target), target, weightSeries, buildTrendChart });
  }

  buttons.forEach(b => b.addEventListener('click', () => load(Number(b.dataset.days))));
  load(7);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
