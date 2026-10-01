import { signOut } from '../auth.js';
import {
  fetchTarget, saveTarget, fetchEntriesForDate, estimateFromDescription, saveEntry, deleteEntry,
  fetchBodyComposition, fetchAnamneseHints, calculateTargetSuggestion, calculateBMR,
} from '../lib/nutrition.js';
import { fetchVisibleDiet } from '../lib/diet.js';

const MEAL_TYPES = [
  { key: 'cafe', label: 'Café da manhã' },
  { key: 'almoco', label: 'Almoço' },
  { key: 'lanche', label: 'Lanche' },
  { key: 'jantar', label: 'Jantar' },
];

export async function renderNutricao(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando sua nutrição...</div>`;

  const clientId = session.user.id;
  const dateISO = todayISO();
  const [target, entries, diet, bodyComp, anamneseHints] = await Promise.all([
    fetchTarget(clientId), fetchEntriesForDate(clientId, dateISO), fetchVisibleDiet(clientId),
    fetchBodyComposition(clientId), fetchAnamneseHints(clientId),
  ]);

  const totals = entries.reduce((acc, e) => ({
    calories: acc.calories + (Number(e.calories) || 0),
    protein_g: acc.protein_g + (Number(e.protein_g) || 0),
    carb_g: acc.carb_g + (Number(e.carb_g) || 0),
    fat_g: acc.fat_g + (Number(e.fat_g) || 0),
  }), { calories: 0, protein_g: 0, carb_g: 0, fat_g: 0 });

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">🍽 Nutrição</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-treino">🏋 Treino</button>
      <button class="logout-link" id="nav-progresso" style="margin-left:12px;">📈 Evolução</button>
      <button class="logout-link" id="nav-anamnese" style="margin-left:12px;">📋 Anamnese</button>
      <button class="logout-link" id="nav-indicacao" style="margin-left:12px;">🎁 Indicação</button>
      ${diet ? `<button class="logout-link" id="nav-dieta" style="margin-left:12px;">🍎 Dieta</button>` : ''}
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main">
      ${renderTargetCard(target, totals, bodyComp, anamneseHints)}

      <div class="ex-card">
        <div class="ex-name" style="margin-bottom:12px;">Registrar refeição</div>
        <label class="form-label">Refeição</label>
        <select id="f-meal" class="load-input" style="text-align:left;margin-bottom:10px;">
          ${MEAL_TYPES.map(m => `<option value="${m.key}">${m.label}</option>`).join('')}
        </select>
        <label class="form-label">O que você comeu?</label>
        <textarea id="f-desc" class="load-input" style="text-align:left;min-height:70px;margin-bottom:10px;" placeholder="ex: 2 ovos mexidos, 1 fatia de pão integral, café com leite"></textarea>
        <button class="send-btn" id="estimate-btn">Estimar com IA</button>
        <div class="login-message" id="estimate-msg"></div>
        <div id="estimate-preview"></div>
      </div>

      <div class="note-box" style="margin-top:24px;">
        <b>Hoje</b>
      </div>
      ${entries.length ? entries.map(renderEntryCard).join('') : '<div class="loading-state">Nenhuma refeição registrada hoje.</div>'}
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => signOut());
  document.getElementById('nav-treino').addEventListener('click', () => { window.location.hash = '/treino'; });
  document.getElementById('nav-progresso').addEventListener('click', () => { window.location.hash = '/progresso'; });
  document.getElementById('nav-anamnese').addEventListener('click', () => { window.location.hash = '/anamnese'; });
  document.getElementById('nav-indicacao').addEventListener('click', () => { window.location.hash = '/indicacao'; });
  const navDieta = document.getElementById('nav-dieta');
  if (navDieta) navDieta.addEventListener('click', () => { window.location.hash = '/dieta'; });

  wireTargetForm(clientId, session, bodyComp);
  wireEstimateForm(clientId, session);
  wireDeleteButtons(session);
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

function renderTargetCard(target, totals, bodyComp, anamneseHints) {
  const { goal: goalHint, ergogenicSuspected } = anamneseHints;
  const fields = [
    { key: 'calories', label: 'Calorias', unit: 'kcal' },
    { key: 'protein_g', label: 'Proteína', unit: 'g' },
    { key: 'carb_g', label: 'Carbo', unit: 'g' },
    { key: 'fat_g', label: 'Gordura', unit: 'g' },
  ];
  return `
    <div class="ex-card">
      <div class="ex-name" style="margin-bottom:10px;">Hoje vs. Meta</div>
      ${fields.map(f => {
        const consumed = Math.round(totals[f.key]);
        const goal = target?.[f.key];
        const pct = goal ? Math.min(100, Math.round((consumed / goal) * 100)) : null;
        return `
          <div style="margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
              <span style="color:var(--muted);">${f.label}</span>
              <span style="color:var(--white);font-weight:600;">${consumed}${f.unit}${goal ? ` / ${goal}${f.unit}` : ''}</span>
            </div>
            ${goal ? `
              <div style="height:6px;border-radius:99px;background:var(--border);overflow:hidden;">
                <div style="height:100%;border-radius:99px;background:${pct >= 100 ? 'var(--green)' : 'var(--green)'};width:${pct}%;"></div>
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
      <button class="logout-link" id="toggle-target-form" style="margin-top:4px;">${target ? '✏️ Editar meta' : '🎯 Definir meta'}</button>
      <div id="target-form" style="display:none;margin-top:12px;">
        ${bodyComp.weightKg && bodyComp.bodyFatPct ? `
          <div class="stat-box" style="text-align:left;padding:10px;margin-bottom:10px;">
            <div class="form-label" style="margin:0 0 6px;">🧮 Calcular a partir da sua avaliação</div>
            <div style="font-size:11.5px;color:var(--muted);margin-bottom:8px;">
              ${bodyComp.weightKg}kg · ${bodyComp.bodyFatPct}% gordura (${bodyComp.source}, ${formatDate(bodyComp.recordedAt)})
              ${goalHint ? ` · objetivo registrado: ${escapeHtml(goalHint)}` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;background:var(--black3, rgba(255,255,255,0.04));border-radius:8px;padding:8px 10px;margin-bottom:10px;">
              <span style="font-size:11.5px;color:var(--muted);">🔥 Metabolismo basal (BMR)</span>
              <span style="font-size:14px;font-weight:700;color:var(--white);">${calculateBMR({ weightKg: bodyComp.weightKg, bodyFatPct: bodyComp.bodyFatPct })}kcal</span>
            </div>
            <div class="ex-stats" style="grid-template-columns:1fr 1fr;margin-bottom:8px;">
              <div>
                <label class="form-label">Nível de atividade</label>
                <select id="calc-activity" class="load-input" style="text-align:left;">
                  ${ACTIVITY_OPTIONS.map(a => `<option value="${a.key}" ${a.key === 'moderado' ? 'selected' : ''}>${a.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="form-label">Objetivo</label>
                <select id="calc-goal" class="load-input" style="text-align:left;">
                  ${GOAL_OPTIONS.map(g => `<option value="${g.key}" ${g.key === 'ganho_de_massa' ? 'selected' : ''}>${g.label}</option>`).join('')}
                </select>
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12.5px;color:var(--text);">
              <input type="checkbox" id="calc-ergogenic" ${ergogenicSuspected ? 'checked' : ''} style="width:auto;">
              Uso de recursos ergogênicos (proteína mais alta — 2,75g/kg)
            </label>
            <button class="logout-link" id="calc-target-btn">Calcular e preencher abaixo</button>
          </div>
        ` : `
          <div style="font-size:11.5px;color:var(--faint);margin-bottom:10px;">
            Sem peso/%gordura registrado ainda pra calcular automaticamente — registre uma bioimpedância ou um lançamento em Evolução, ou preencha a meta manualmente abaixo.
          </div>
        `}
        <div class="ex-stats" style="grid-template-columns:1fr 1fr;margin-bottom:10px;">
          <div class="stat-box" style="text-align:left;padding:10px;">
            <label class="form-label">Calorias (kcal)</label>
            <input type="number" id="t-calories" class="load-input" style="text-align:left;" value="${target?.calories ?? ''}">
          </div>
          <div class="stat-box" style="text-align:left;padding:10px;">
            <label class="form-label">Proteína (g)</label>
            <input type="number" id="t-protein" class="load-input" style="text-align:left;" value="${target?.protein_g ?? ''}">
          </div>
          <div class="stat-box" style="text-align:left;padding:10px;">
            <label class="form-label">Carbo (g)</label>
            <input type="number" id="t-carb" class="load-input" style="text-align:left;" value="${target?.carb_g ?? ''}">
          </div>
          <div class="stat-box" style="text-align:left;padding:10px;">
            <label class="form-label">Gordura (g)</label>
            <input type="number" id="t-fat" class="load-input" style="text-align:left;" value="${target?.fat_g ?? ''}">
          </div>
        </div>
        <button class="send-btn" id="save-target-btn">Salvar meta</button>
        <div class="login-message" id="target-msg"></div>
      </div>
    </div>
  `;
}

function wireTargetForm(clientId, session, bodyComp) {
  const toggleBtn = document.getElementById('toggle-target-form');
  const form = document.getElementById('target-form');
  toggleBtn.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  const calcBtn = document.getElementById('calc-target-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const suggestion = calculateTargetSuggestion({
        weightKg: bodyComp.weightKg,
        bodyFatPct: bodyComp.bodyFatPct,
        activityLevel: document.getElementById('calc-activity').value,
        goal: document.getElementById('calc-goal').value,
        ergogenic: document.getElementById('calc-ergogenic').checked,
      });
      document.getElementById('t-calories').value = suggestion.calories;
      document.getElementById('t-protein').value = suggestion.protein_g;
      document.getElementById('t-carb').value = suggestion.carb_g;
      document.getElementById('t-fat').value = suggestion.fat_g;
    });
  }
  document.getElementById('save-target-btn').addEventListener('click', async () => {
    const msg = document.getElementById('target-msg');
    msg.textContent = '';
    try {
      await saveTarget(clientId, {
        calories: Number(document.getElementById('t-calories').value) || null,
        protein_g: Number(document.getElementById('t-protein').value) || null,
        carb_g: Number(document.getElementById('t-carb').value) || null,
        fat_g: Number(document.getElementById('t-fat').value) || null,
      });
      renderNutricao(session);
    } catch (err) {
      msg.textContent = 'Não consegui salvar a meta.';
      msg.classList.add('error');
    }
  });
}

function wireEstimateForm(clientId, session) {
  document.getElementById('estimate-btn').addEventListener('click', async () => {
    const btn = document.getElementById('estimate-btn');
    const msg = document.getElementById('estimate-msg');
    const preview = document.getElementById('estimate-preview');
    const description = document.getElementById('f-desc').value.trim();
    if (!description) {
      msg.textContent = 'Descreva o que você comeu primeiro.';
      msg.classList.add('error');
      return;
    }
    btn.disabled = true;
    msg.classList.remove('error');
    msg.textContent = 'Estimando...';
    preview.innerHTML = '';
    try {
      const estimate = await estimateFromDescription(description);
      msg.textContent = '';
      preview.innerHTML = `
        <div class="ex-stats" style="grid-template-columns:1fr 1fr;margin:10px 0;">
          <div class="stat-box"><div class="form-label">Calorias</div><div style="font-weight:700;color:var(--white);">${Math.round(estimate.calories)}kcal</div></div>
          <div class="stat-box"><div class="form-label">Proteína</div><div style="font-weight:700;color:var(--white);">${Math.round(estimate.protein_g)}g</div></div>
          <div class="stat-box"><div class="form-label">Carbo</div><div style="font-weight:700;color:var(--white);">${Math.round(estimate.carb_g)}g</div></div>
          <div class="stat-box"><div class="form-label">Gordura</div><div style="font-weight:700;color:var(--white);">${Math.round(estimate.fat_g)}g</div></div>
        </div>
        ${estimate.note ? `<div style="font-size:11.5px;color:var(--faint);margin-bottom:10px;">💬 ${escapeHtml(estimate.note)}</div>` : ''}
        <button class="send-btn" id="confirm-save-btn">Confirmar e salvar</button>
      `;
      document.getElementById('confirm-save-btn').addEventListener('click', async () => {
        try {
          await saveEntry(clientId, {
            loggedAt: todayISO(),
            mealType: document.getElementById('f-meal').value,
            description,
            calories: estimate.calories,
            protein_g: estimate.protein_g,
            carb_g: estimate.carb_g,
            fat_g: estimate.fat_g,
            source: 'agent',
          });
          renderNutricao(session);
        } catch (err) {
          msg.textContent = 'Não consegui salvar o registro.';
          msg.classList.add('error');
        }
      });
    } catch (err) {
      console.error('estimateFromDescription failed', err);
      msg.textContent = 'Não consegui estimar: ' + err.message;
      msg.classList.add('error');
    } finally {
      btn.disabled = false;
    }
  });
}

function wireDeleteButtons(session) {
  document.querySelectorAll('.entry-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await deleteEntry(btn.dataset.id);
        renderNutricao(session);
      } catch (err) {
        btn.disabled = false;
      }
    });
  });
}

function renderEntryCard(entry) {
  const mealLabel = MEAL_TYPES.find(m => m.key === entry.meal_type)?.label || entry.meal_type;
  return `
    <div class="ex-card">
      <div class="ex-head">
        <div class="ex-name">${mealLabel}</div>
        <button class="entry-delete" data-id="${entry.id}" style="background:none;border:none;color:var(--faint);font-size:12px;cursor:pointer;">✕</button>
      </div>
      <div style="font-size:13px;color:var(--text);margin-top:4px;">${escapeHtml(entry.description)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px;">
        ${Math.round(entry.calories || 0)}kcal · P ${Math.round(entry.protein_g || 0)}g · C ${Math.round(entry.carb_g || 0)}g · G ${Math.round(entry.fat_g || 0)}g
      </div>
    </div>
  `;
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
