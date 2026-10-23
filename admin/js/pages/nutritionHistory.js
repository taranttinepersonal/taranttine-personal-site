import { supabase } from '../../../app/js/supabaseClient.js';
import {
  fetchTarget, fetchBodyComposition, fetchAnamneseHints, calculateBMR, bmrRange, calculateTargetSuggestion, saveTarget,
} from '../../../app/js/lib/nutrition.js';
import { fetchDailyHistory, fetchWeightSeries, summarizeHistory, renderHistoryHtml } from '../../../app/js/lib/nutritionHistory.js';
import { buildTrendChart } from '../../../app/js/lib/chart.js';
import {
  ETAPA1, ETAPA2, renderBlocks, collectBlocks, fetchNutritionAnamneses, saveNutritionAnamnese, fetchNutritionConsult,
} from '../../../app/js/lib/nutritionAnamnese.js';
import { QUESTIONS as CK_QUESTIONS, fetchCheckins, flagsOf, answerText } from '../../../app/js/lib/checkin.js';

export async function renderNutritionHistory(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const [{ data: profile }, initialTarget, bodyComp, anamneseHints, nutritionConsult, nutriAnamneses, checkins] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', clientId).single(),
    fetchTarget(clientId),
    fetchBodyComposition(clientId),
    fetchAnamneseHints(clientId),
    fetchNutritionConsult(clientId),
    fetchNutritionAnamneses(clientId),
    fetchCheckins(clientId, 8),
  ]);
  let target = initialTarget;

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')} · Nutrição</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>
    <div class="admin-card">
      <div id="current-target">${renderCurrentTarget(target)}</div>
    </div>
    ${renderNutriAnamnese(nutritionConsult, nutriAnamneses)}
    ${renderCheckinHistory(checkins)}
    ${renderCalculator(bodyComp, anamneseHints, target)}
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

  const consultToggle = document.getElementById('nutri-consult');
  const consultMsg = document.getElementById('nutri-consult-msg');
  consultToggle.addEventListener('change', async () => {
    const { error } = await supabase.from('profiles').update({ nutrition_consult: consultToggle.checked }).eq('id', clientId);
    if (error) {
      console.error('toggle nutrition_consult failed', error);
      consultToggle.checked = !consultToggle.checked;
      consultMsg.className = 'admin-msg error';
      consultMsg.textContent = 'Não consegui salvar. Confira se a atualização do banco (0025) já foi aplicada.';
      return;
    }
    consultMsg.className = 'admin-msg';
    consultMsg.textContent = consultToggle.checked
      ? 'Liberado: o aluno já vê a anamnese nutricional na aba Nutrição do app.'
      : 'Desligado: a anamnese nutricional saiu do app do aluno.';
  });

  const na2Btn = document.getElementById('save-na2');
  const na2Msg = document.getElementById('na2-msg');
  na2Btn.addEventListener('click', async () => {
    const respostas = collectBlocks(ETAPA2, 'na2');
    if (!Object.keys(respostas).length) {
      na2Msg.className = 'admin-msg error';
      na2Msg.textContent = 'Preencha pelo menos um campo antes de salvar.';
      return;
    }
    na2Btn.disabled = true;
    try {
      await saveNutritionAnamnese(clientId, 2, respostas);
      na2Msg.className = 'admin-msg';
      na2Msg.textContent = 'Etapa 2 salva.';
    } catch (e) {
      console.error('save etapa 2 failed', e);
      na2Msg.className = 'admin-msg error';
      na2Msg.textContent = 'Não consegui salvar a etapa 2. Tente de novo.';
    } finally {
      na2Btn.disabled = false;
    }
  });

  let currentDays = 7;
  buttons.forEach(b => b.addEventListener('click', () => { currentDays = Number(b.dataset.days); load(currentDays); }));
  load(currentDays);

  const $ = id => document.getElementById(id);
  const msg = $('calc-msg');

  $('calc-run').addEventListener('click', () => {
    const weightKg = Number($('calc-weight').value);
    const bodyFatPct = Number($('calc-fat').value);
    if (!weightKg || !bodyFatPct) {
      msg.className = 'admin-msg error';
      msg.textContent = 'Preencha peso e %gordura pra calcular.';
      return;
    }
    const s = calculateTargetSuggestion({
      weightKg, bodyFatPct,
      activityLevel: $('calc-activity').value,
      goal: $('calc-goal').value,
      hormoneUse: $('calc-hormone').checked,
    });
    const r = bmrRange(s.bmr);
    $('calc-bmr').textContent = `~${s.bmr}kcal (${r.low}–${r.high})`;
    $('tg-calories').value = s.calories;
    $('tg-protein').value = s.protein_g;
    $('tg-carb').value = s.carb_g;
    $('tg-fat').value = s.fat_g;
    msg.className = 'admin-msg';
    msg.textContent = 'Sugestão preenchida. Ajuste se quiser e salve.';
  });

  $('calc-save').addEventListener('click', async () => {
    const next = {
      calories: toInt($('tg-calories').value),
      protein_g: toInt($('tg-protein').value),
      carb_g: toInt($('tg-carb').value),
      fat_g: toInt($('tg-fat').value),
    };
    if (!next.calories) {
      msg.className = 'admin-msg error';
      msg.textContent = 'Defina pelo menos as calorias antes de salvar.';
      return;
    }
    try {
      await saveTarget(clientId, next);
      target = next;
      $('current-target').innerHTML = renderCurrentTarget(target);
      msg.className = 'admin-msg';
      msg.textContent = 'Meta salva. O aluno já vê a nova meta no app.';
      load(currentDays);
    } catch (e) {
      console.error('saveTarget failed', e);
      msg.className = 'admin-msg error';
      msg.textContent = 'Não consegui salvar a meta. Tente de novo.';
    }
  });
}

const ACTIVITY_OPTIONS = [
  { key: 'sedentario', label: 'Sedentário' },
  { key: 'leve', label: 'Leve (1-3x/semana)' },
  { key: 'moderado', label: 'Moderado (3-5x/semana)' },
  { key: 'intenso', label: 'Intenso (5-7x/semana)' },
];
const GOAL_OPTIONS = [
  { key: 'emagrecimento', label: 'Emagrecimento' },
  { key: 'manutencao', label: 'Manutenção' },
  { key: 'ganho_de_massa', label: 'Ganho de massa' },
];

function renderCheckinHistory(checkins) {
  if (!checkins.length) return `<div class="admin-card"><div class="admin-section-title" style="margin-top:0;">✅ Check-ins semanais</div><div class="admin-row-sub">Nenhum check-in ainda. O aluno responde na aba Nutrição do app.</div></div>`;
  const Q = Object.fromEntries(CK_QUESTIONS.map(q => [q.key, q]));
  const fmt = iso => { const [, m, d] = String(iso).split('-'); return `${d}/${m}`; };
  return `
    <div class="admin-card">
      <div class="admin-section-title" style="margin-top:0;">✅ Check-ins semanais</div>
      <div class="rx-scroll"><table class="rx-table">
        <thead><tr><th>Semana</th><th>Aderência</th><th>Fome</th><th>Sono</th><th>Energia</th><th>Água</th><th>Intestino</th><th>Peso</th><th>Atenção</th></tr></thead>
        <tbody>${checkins.map(c => { const r = c.respostas || {}; return `<tr>
          <td><b>${fmt(c.week_start)}</b></td><td>${escapeHtml(answerText(Q.adesao, r.adesao))}</td><td>${escapeHtml(answerText(Q.fome, r.fome))}</td>
          <td>${escapeHtml(answerText(Q.sono_h, r.sono_h))} · ${escapeHtml(answerText(Q.sono_q, r.sono_q))}</td><td>${escapeHtml(answerText(Q.energia, r.energia))}</td>
          <td>${escapeHtml(answerText(Q.agua, r.agua))}</td><td>${escapeHtml(answerText(Q.intestino, r.intestino))}</td><td>${escapeHtml(answerText(Q.peso, r.peso))}</td>
          <td>${flagsOf(r).map(f => `<span class="rx-supp-alert" style="display:inline-block;margin-right:6px;">⚠️ ${escapeHtml(f)}</span>`).join('') || '<span class="admin-row-sub">—</span>'}</td></tr>
          ${r.dificuldade || r.duvida ? `<tr><td></td><td colspan="8" class="admin-row-sub">${r.dificuldade ? `<b>Dificuldade:</b> ${escapeHtml(r.dificuldade)} ` : ''}${r.duvida ? `<b>Ajuste/dúvida:</b> ${escapeHtml(r.duvida)}` : ''}</td></tr>` : ''}`; }).join('')}
        </tbody>
      </table></div>
    </div>
  `;
}

function renderNutriAnamnese(nutritionConsult, { etapa1, etapa2 }) {
  const answered = etapa1 ? ETAPA1.map(b => {
    const rows = b.fields.filter(f => etapa1.respostas?.[f.label]);
    if (!rows.length) return '';
    return `<div class="admin-row-sub" style="margin:12px 0 4px;color:var(--white);font-weight:600;">${escapeHtml(b.title)}</div>` +
      rows.map(f => `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span style="color:var(--muted);">${escapeHtml(f.short || f.label)}</span>
        <span style="text-align:right;white-space:pre-wrap;">${escapeHtml(etapa1.respostas[f.label])}</span></div>`).join('');
  }).join('') : '';
  return `
    <div class="admin-card">
      <div class="admin-section-title" style="margin-top:0;">📝 Anamnese nutricional</div>
      <label style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="nutri-consult" ${nutritionConsult ? 'checked' : ''} style="width:auto;margin:0;">
        Consultoria nutricional liberada para este aluno (mostra a etapa 1 no app)
      </label>
      <div class="admin-msg" id="nutri-consult-msg"></div>
      <div class="admin-section-title">Etapa 1 · respondida pelo aluno</div>
      ${etapa1
        ? `<div class="admin-row-sub">Respondida em ${formatDate(etapa1.recorded_at)}</div>${answered}`
        : '<div class="admin-row-sub">O aluno ainda não respondeu.</div>'}
    </div>
    <div class="admin-card admin-form">
      <div class="admin-section-title" style="margin-top:0;">Etapa 2 · preenchida na consulta</div>
      ${etapa2 ? `<div class="admin-row-sub" style="margin-bottom:6px;">Última atualização: ${formatDate(etapa2.recorded_at)}</div>` : ''}
      ${renderBlocks(ETAPA2, 'na2', etapa2?.respostas || {}, { titleClass: 'admin-section-title', hintClass: 'admin-row-sub' })}
      <button class="admin-btn primary" id="save-na2" style="margin-top:14px;">Salvar etapa 2</button>
      <div class="admin-msg" id="na2-msg"></div>
    </div>
  `;
}

function renderCurrentTarget(target) {
  return target
    ? `<div class="admin-row-sub">Meta atual: <b style="color:var(--white);">${target.calories ?? '—'}kcal</b> · proteína ${target.protein_g ?? '—'}g · carbo ${target.carb_g ?? '—'}g · gordura ${target.fat_g ?? '—'}g</div>`
    : `<div class="admin-row-sub">Este cliente ainda não tem meta definida. Use a calculadora abaixo ou peça pra ele definir no app.</div>`;
}

function renderCalculator(bodyComp, anamneseHints, target) {
  const hasComp = bodyComp.weightKg && bodyComp.bodyFatPct;
  const bmr = hasComp ? calculateBMR({ weightKg: bodyComp.weightKg, bodyFatPct: bodyComp.bodyFatPct }) : null;
  const range = bmr ? bmrRange(bmr) : null;
  return `
    <div class="admin-card admin-form">
      <div class="admin-section-title" style="margin-top:0;">🧮 Calculadora de meta</div>
      <div class="admin-row-sub" style="margin-bottom:10px;">
        ${hasComp
          ? `Última avaliação: ${bodyComp.weightKg}kg · ${bodyComp.bodyFatPct}% gordura (${bodyComp.source}, ${formatDate(bodyComp.recordedAt)})`
          : 'Sem peso/%gordura registrado ainda. Registre uma bioimpedância em Avaliação ou preencha à mão abaixo.'}
        ${anamneseHints.goal ? `<br>Objetivo na anamnese: ${escapeHtml(anamneseHints.goal)}` : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px;">
        <div><label>Peso (kg)</label><input type="number" step="0.1" id="calc-weight" value="${bodyComp.weightKg ?? ''}"></div>
        <div><label>% gordura</label><input type="number" step="0.1" id="calc-fat" value="${bodyComp.bodyFatPct ?? ''}"></div>
        <div><label>Nível de atividade</label><select id="calc-activity">
          ${ACTIVITY_OPTIONS.map(a => `<option value="${a.key}" ${a.key === 'moderado' ? 'selected' : ''}>${a.label}</option>`).join('')}
        </select></div>
        <div><label>Objetivo</label><select id="calc-goal">
          ${GOAL_OPTIONS.map(g => `<option value="${g.key}" ${g.key === 'ganho_de_massa' ? 'selected' : ''}>${g.label}</option>`).join('')}
        </select></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
        <input type="checkbox" id="calc-hormone" ${anamneseHints.hormoneUse ? 'checked' : ''} style="width:auto;margin:0;">
        Aluno usa hormônios (proteína 2,75 g/kg de peso total)${anamneseHints.hormoneUse ? ' · indicado na anamnese' : ''}
      </label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;">
        <div class="admin-row-sub">🔥 Basal estimado (Katch-McArdle): <b style="color:var(--white);" id="calc-bmr">${bmr ? `~${bmr}kcal (${range.low}–${range.high})` : '—'}</b></div>
        <div class="admin-row-sub">⚖️ Basal da balança: <b style="color:var(--white);">${bodyComp.deviceBmr ? `${bodyComp.deviceBmr}kcal` : '—'}</b></div>
      </div>
      <div class="admin-row-sub" style="margin:-4px 0 10px;">Proteína calculada pela massa magra: 2,2 g/kg (2,4 g/kg no emagrecimento), ou 2,75 g/kg de peso total se o aluno usa hormônios.</div>
      <button class="admin-btn" id="calc-run">Calcular sugestão</button>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0 12px;margin-top:12px;">
        <div><label>Calorias</label><input type="number" id="tg-calories" value="${target?.calories ?? ''}"></div>
        <div><label>Proteína (g)</label><input type="number" id="tg-protein" value="${target?.protein_g ?? ''}"></div>
        <div><label>Carbo (g)</label><input type="number" id="tg-carb" value="${target?.carb_g ?? ''}"></div>
        <div><label>Gordura (g)</label><input type="number" id="tg-fat" value="${target?.fat_g ?? ''}"></div>
      </div>
      <button class="admin-btn primary" id="calc-save" style="margin-top:12px;">Salvar meta do aluno</button>
      <div class="admin-msg" id="calc-msg"></div>
    </div>
  `;
}

function toInt(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
