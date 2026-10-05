import { supabase } from '../supabaseClient.js';

// Um dia só conta como "registro completo" com pelo menos 3 refeições distintas
// lançadas — senão um dia em que só o almoço foi registrado apareceria como um
// déficit enorme e falso.
export const MIN_MEALS_COMPLETE_DAY = 3;

// Data local (não UTC) — um jantar lançado às 21h não pode cair no dia seguinte.
export function localISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(iso, delta) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return localISO(d);
}

// Série diária dos últimos `days` dias (do mais antigo ao de hoje), com os dias
// sem registro preenchidos com zero pra o gráfico manter o espaçamento certo.
export async function fetchDailyHistory(clientId, days) {
  const today = localISO();
  const from = addDays(today, -(days - 1));
  const { data, error } = await supabase
    .from('food_entries')
    .select('logged_at, meal_type, calories, protein_g')
    .eq('client_id', clientId)
    .gte('logged_at', from)
    .lte('logged_at', today)
    .limit(5000);
  if (error) {
    console.error('fetchDailyHistory failed', error);
    return [];
  }
  const byDate = {};
  data.forEach((e) => {
    const day = byDate[e.logged_at] || (byDate[e.logged_at] = { calories: 0, protein_g: 0, meals: new Set() });
    day.calories += Number(e.calories) || 0;
    day.protein_g += Number(e.protein_g) || 0;
    day.meals.add(e.meal_type);
  });
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    const d = byDate[date];
    return {
      date,
      calories: d ? Math.round(d.calories) : 0,
      protein_g: d ? Math.round(d.protein_g) : 0,
      meals: d ? d.meals.size : 0,
      complete: !!d && d.meals.size >= MIN_MEALS_COMPLETE_DAY,
    };
  });
}

export async function fetchWeightSeries(clientId, days) {
  const from = addDays(localISO(), -(days - 1));
  const { data, error } = await supabase
    .from('progress_entries')
    .select('recorded_at, weight_kg')
    .eq('client_id', clientId)
    .not('weight_kg', 'is', null)
    .gte('recorded_at', from)
    .order('recorded_at', { ascending: true });
  if (error) {
    console.error('fetchWeightSeries failed', error);
    return [];
  }
  return data.map((e) => ({ date: e.recorded_at, value: Number(e.weight_kg) }));
}

// Aderência à meta — não é "déficit": a meta já embute o déficit/superávit do
// objetivo, então comparar consumo com a meta é a medida exata; comparar com o
// gasto estimado (BMR x fator) erraria 10-20%.
export function summarizeHistory(daily, target) {
  const complete = daily.filter((d) => d.complete);
  const avg = (key) => (complete.length ? Math.round(complete.reduce((s, d) => s + d[key], 0) / complete.length) : null);
  const kcalTarget = target?.calories || null;
  const proteinTarget = target?.protein_g || null;
  return {
    totalDays: daily.length,
    completeDays: complete.length,
    avgCalories: avg('calories'),
    avgProtein: avg('protein_g'),
    // ±10% da meta de calorias
    daysInRange: kcalTarget ? complete.filter((d) => Math.abs(d.calories - kcalTarget) / kcalTarget <= 0.1).length : null,
    // proteína em pelo menos 90% da meta
    daysProteinHit: proteinTarget ? complete.filter((d) => d.protein_g >= proteinTarget * 0.9).length : null,
  };
}

// Barras diárias de calorias contra a linha da meta. Dias com registro
// incompleto ficam em cinza, pra não serem lidos como dia "bom".
export function buildDailyBarChart(daily, targetKcal) {
  if (!daily.length) return '';
  const w = 600;
  const h = 170;
  const padTop = 14;
  const padBottom = 22;
  const maxVal = Math.max(targetKcal || 0, ...daily.map((d) => d.calories), 1) * 1.08;
  const slot = w / daily.length;
  const barW = Math.max(3, slot * 0.68);
  const y = (v) => padTop + (1 - v / maxVal) * (h - padTop - padBottom);
  const labelEvery = daily.length > 14 ? 5 : 1;

  const bars = daily.map((d, i) => {
    const x = i * slot + (slot - barW) / 2;
    const top = y(d.calories);
    const barH = Math.max(0, h - padBottom - top);
    const color = !d.calories ? 'transparent' : d.complete ? 'var(--green)' : 'var(--muted)';
    const opacity = d.complete ? 1 : 0.45;
    const label = (i % labelEvery === 0 || i === daily.length - 1)
      ? `<text x="${x + barW / 2}" y="${h - 6}" font-size="10" text-anchor="middle" fill="var(--muted)">${Number(d.date.slice(8))}</text>`
      : '';
    return `<rect x="${x}" y="${top}" width="${barW}" height="${barH}" rx="2" fill="${color}" opacity="${opacity}"><title>${d.date.split('-').reverse().join('/')} — ${d.calories}kcal · ${d.protein_g}g prot · ${d.meals} refeição(ões)${d.complete ? '' : ' (registro incompleto)'}</title></rect>${label}`;
  }).join('');

  const targetLine = targetKcal ? `
    <line x1="0" y1="${y(targetKcal)}" x2="${w}" y2="${y(targetKcal)}" stroke="var(--white, #fff)" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.7"/>
    <text x="${w - 2}" y="${y(targetKcal) - 4}" font-size="10" text-anchor="end" fill="var(--white, #fff)" opacity="0.8">meta ${targetKcal}</text>` : '';

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:${h}px;">${bars}${targetLine}</svg>`;
}

function weightChartHtml(weightSeries, buildTrendChart) {
  const chart = buildTrendChart([{ label: 'Peso', color: 'var(--green)', points: weightSeries }]);
  if (!chart) return '';
  const first = weightSeries[0];
  const last = weightSeries[weightSeries.length - 1];
  const delta = Math.round((last.value - first.value) * 10) / 10;
  return `
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:16px 0 4px;">Peso no período (lançamentos de Evolução)</div>
    ${chart.svg}
    <div style="font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;">
      <span>${first.value}kg</span><span>${delta > 0 ? '+' : ''}${delta}kg</span><span>${last.value}kg</span>
    </div>`;
}

// HTML do histórico (gráfico + resumo + peso). Compartilhado entre o app do
// aluno e o painel do treinador.
export function renderHistoryHtml({ daily, summary, target, weightSeries, buildTrendChart }) {
  const kcalTarget = target?.calories || null;
  const proteinTarget = target?.protein_g || null;
  const stat = (label, value, sub) => `
    <div class="stat-box"><div class="form-label">${label}</div>
      <div style="font-weight:700;color:var(--white);">${value}</div>
      ${sub ? `<div style="font-size:10.5px;color:var(--muted);margin-top:2px;">${sub}</div>` : ''}
    </div>`;
  const pctOfTarget = kcalTarget && summary.avgCalories != null ? Math.round((summary.avgCalories / kcalTarget) * 100) : null;
  const incomplete = summary.totalDays - summary.completeDays;

  return `
    ${buildDailyBarChart(daily, kcalTarget)}
    <div style="display:flex;gap:14px;font-size:10.5px;color:var(--muted);margin:4px 0 12px;flex-wrap:wrap;">
      <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--green);"></span> dia completo</span>
      <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--muted);opacity:.45;"></span> registro incompleto (menos de ${MIN_MEALS_COMPLETE_DAY} refeições)</span>
    </div>
    <div class="ex-stats" style="grid-template-columns:1fr 1fr;gap:8px;">
      ${stat('Média de calorias', summary.avgCalories != null ? `${summary.avgCalories}kcal` : '—', pctOfTarget != null ? `${pctOfTarget}% da meta` : (kcalTarget ? '' : 'sem meta definida'))}
      ${stat('Média de proteína', summary.avgProtein != null ? `${summary.avgProtein}g` : '—', proteinTarget ? `meta ${proteinTarget}g` : 'sem meta definida')}
      ${stat('Dias na faixa (±10%)', summary.daysInRange != null ? `${summary.daysInRange}/${summary.completeDays}` : '—', 'calorias perto da meta')}
      ${stat('Dias com proteína', summary.daysProteinHit != null ? `${summary.daysProteinHit}/${summary.completeDays}` : '—', 'pelo menos 90% da meta')}
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin-top:10px;">
      ${summary.completeDays} de ${summary.totalDays} dias com registro completo${incomplete ? ` · ${incomplete} sem registro ou incompleto(s), fora das médias` : ''}.
    </div>
    ${weightSeries.length >= 2 ? weightChartHtml(weightSeries, buildTrendChart) : ''}
  `;
}
