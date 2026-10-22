import { supabase } from '../../../app/js/supabaseClient.js';
import {
  fetchBodyComposition, fetchAnamneseHints, calculateTargetSuggestion, bmrRange,
} from '../../../app/js/lib/nutrition.js';
import { fetchNutritionAnamneses } from '../../../app/js/lib/nutritionAnamnese.js';
import {
  loadTaco, MODELS, DEFAULT_SLOTS, excludedFoods, guessGoal, mealTargets, autoSelectModels,
  buildMeal, substitutionOptions, statusOf, foodName,
} from '../../../app/js/lib/prescription.js';

const ACTIVITY = [['sedentario', 'Sedentário'], ['leve', 'Leve (1-3x/sem)'], ['moderado', 'Moderado (3-5x/sem)'], ['intenso', 'Intenso (5-7x/sem)']];
const GOALS = [['emagrecimento', 'Emagrecimento'], ['manutencao', 'Manutenção'], ['ganho_de_massa', 'Ganho de massa']];
const ROLE_LABEL = { P: 'proteína', C: 'carbo', G: 'gordura', L: 'livre', X: 'porção fixa' };
const STATUS_LABEL = { ok: '✅ ok', passou: '⚠️ passou', faltou: '⚠️ faltou' };

export async function renderPrescription(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando a prescrição...</div>`;
  main.closest('.admin-shell')?.classList.add('wide');

  const [{ data: profile }, bodyComp, hints, anam, taco] = await Promise.all([
    supabase.from('profiles').select('full_name, birth_date, sexo').eq('id', clientId).single(),
    fetchBodyComposition(clientId),
    fetchAnamneseHints(clientId),
    fetchNutritionAnamneses(clientId),
    loadTaco(),
  ]);
  const excluded = excludedFoods(anam.etapa1, taco);
  const draftKey = `prescricao-rascunho-${clientId}`;

  const fresh = () => ({
    weightKg: bodyComp.weightKg ?? '',
    bodyFatPct: bodyComp.bodyFatPct ?? '',
    activity: 'moderado',
    goal: guessGoal(hints.goal),
    hormoneUse: !!hints.hormoneUse,
    plantCredit: 50,
    slots: DEFAULT_SLOTS.map(s => ({ ...s })),
    models: null,
    edits: {},
  });
  let st;
  try { st = JSON.parse(localStorage.getItem(draftKey)) || fresh(); } catch { st = fresh(); }

  function save() {
    try { localStorage.setItem(draftKey, JSON.stringify(st)); } catch { /* rascunho é só conveniência */ }
  }

  function compute() {
    const w = Number(st.weightKg), bf = Number(st.bodyFatPct);
    if (!w || !bf) return null;
    const target = calculateTargetSuggestion({ weightKg: w, bodyFatPct: bf, activityLevel: st.activity, goal: st.goal, hormoneUse: st.hormoneUse });
    const mts = mealTargets(target, st.slots);
    if (!st.models || st.models.length !== st.slots.length) st.models = autoSelectModels(st.slots, excluded);
    const meals = st.slots.map((s, i) => {
      if (!s.ativo) return null;
      const model = MODELS.find(m => m.code === st.models[i]) || MODELS.find(m => m.tipo === s.tipo);
      return { model, ...buildMeal(model, mts[i], taco, excluded, st.edits[i] || {}, { plantCredit: st.plantCredit / 100 }) };
    });
    const day = meals.filter(Boolean).reduce((a, m) => ({
      kcal: a.kcal + m.tot.kcal, prot: a.prot + m.tot.prot, carb: a.carb + m.tot.carb, gord: a.gord + m.tot.gord,
    }), { kcal: 0, prot: 0, carb: 0, gord: 0 });
    return { target, mts, meals, day };
  }

  function render() {
    const y = window.scrollY;
    const c = compute();
    main.innerHTML = `
      <div class="admin-header">
        <div class="admin-title">${esc(profile?.full_name || '')} · Prescrição</div>
        <a href="#/cliente/${clientId}/nutricao" class="admin-btn">← Nutrição</a>
      </div>
      <div class="rx-grid">
        ${renderClientCard()}
        ${renderTargetCard(c)}
      </div>
      ${renderDistribution(c)}
      ${c ? renderDayBar(c) : ''}
      ${c ? c.meals.map((m, i) => (m ? renderMeal(i, m, c.mts[i]) : '')).join('') : ''}
      <div class="admin-card rx-actions">
        <button class="admin-btn" id="rx-reset">↺ Remontar automaticamente</button>
        <button class="admin-btn" disabled title="Fase 2">📄 Gerar PDF</button>
        <button class="admin-btn" disabled title="Fase 2">📲 Enviar para o app</button>
        <button class="admin-btn" disabled title="Fase 2">💬 WhatsApp</button>
        <span class="admin-row-sub">Rascunho salvo automaticamente neste navegador. PDF, app e WhatsApp chegam na fase 2.</span>
      </div>
    `;
    window.scrollTo(0, y);
  }

  function renderClientCard() {
    const r1 = anam.etapa1?.respostas || {};
    const r2 = anam.etapa2?.respostas || {};
    const chips = [
      profile?.sexo && `Sexo: ${profile.sexo}`,
      profile?.birth_date && `Idade: ${age(profile.birth_date)} anos`,
      bodyComp.weightKg && `${bodyComp.weightKg} kg · ${bodyComp.bodyFatPct}% gordura (${bodyComp.source}, ${fmtDate(bodyComp.recordedAt)})`,
    ].filter(Boolean);
    const facts = [
      ['Objetivo (anamnese)', hints.goal],
      ['Restrição', r1['Restrição por escolha']],
      ['Não come', r1['Alimentos que não come de jeito nenhum']],
      ['Adora', r1['Alimentos que você adora']],
      ['Treino', r1['Horário do treino']],
      ['Alergias', r2['Alergias ou intolerâncias']],
      ['Intestino', r2['Frequência do intestino']],
      ['Come por emoção', r2['Come por ansiedade ou emoção']],
      ['Suplementos', r2['Suplementos em uso (qual, dose, quem indicou)']],
    ].filter(([, v]) => v && v !== 'Nenhuma');
    const excl = [...excluded].map(id => foodName(taco.get(id)));
    return `
      <div class="admin-card">
        <div class="admin-section-title" style="margin-top:0;">Cliente</div>
        <div class="rx-chips">${chips.map(x => `<span>${esc(x)}</span>`).join('') || '<span>Sem avaliação registrada</span>'}</div>
        ${facts.map(([k, v]) => `<div class="rx-fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}
        ${excl.length ? `<div class="rx-alert">Fora do cardápio: ${esc(excl.join(', '))}</div>` : ''}
        ${!anam.etapa1 ? '<div class="admin-row-sub" style="margin-top:8px;">Anamnese nutricional (etapa 1) ainda não respondida.</div>' : ''}
      </div>
    `;
  }

  function renderTargetCard(c) {
    const t = c?.target;
    const r = t ? bmrRange(t.bmr) : null;
    const w = Number(st.weightKg) || 1;
    return `
      <div class="admin-card admin-form">
        <div class="admin-section-title" style="margin-top:0;">Meta</div>
        <div class="field-row">
          <div><label>Peso (kg)</label><input type="number" step="0.1" data-k="weightKg" value="${esc(st.weightKg)}"></div>
          <div><label>% gordura</label><input type="number" step="0.1" data-k="bodyFatPct" value="${esc(st.bodyFatPct)}"></div>
          <div><label>Atividade</label><select data-k="activity">${ACTIVITY.map(([k, l]) => `<option value="${k}" ${k === st.activity ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div><label>Objetivo</label><select data-k="goal">${GOALS.map(([k, l]) => `<option value="${k}" ${k === st.goal ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <div class="field-row">
          <label class="rx-check"><input type="checkbox" data-k="hormoneUse" ${st.hormoneUse ? 'checked' : ''}> Usa hormônios (2,75 g/kg)</label>
          <div><label>Proteína vegetal conta (%)</label><input type="number" step="10" min="0" max="100" data-k="plantCredit" value="${esc(st.plantCredit)}"></div>
        </div>
        ${t ? `
          <div class="rx-target">
            <div><span>Basal estimado</span><b>~${t.bmr}</b><small>${r.low}–${r.high} kcal</small></div>
            <div><span>Meta</span><b>${t.calories}</b><small>kcal/dia</small></div>
            <div><span>Proteína</span><b>${t.protein_g} g</b><small>${(t.protein_g / w).toFixed(1)} g/kg</small></div>
            <div><span>Carbo</span><b>${t.carb_g} g</b><small>${(t.carb_g / w).toFixed(1)} g/kg</small></div>
            <div><span>Gordura</span><b>${t.fat_g} g</b><small>${(t.fat_g / w).toFixed(1)} g/kg</small></div>
          </div>` : '<div class="admin-msg error">Preencha peso e % de gordura para calcular.</div>'}
      </div>
    `;
  }

  function renderDistribution(c) {
    const sumK = st.slots.filter(s => s.ativo).reduce((a, s) => a + Number(s.pctKcal || 0), 0);
    const sumP = st.slots.filter(s => s.ativo).reduce((a, s) => a + Number(s.pctProt || 0), 0);
    return `
      <div class="admin-card">
        <div class="admin-section-title" style="margin-top:0;">Refeições e divisão</div>
        <div class="rx-scroll"><table class="rx-table">
          <thead><tr><th></th><th>Refeição</th><th>Horário</th><th>% kcal</th><th>% prot</th><th>kcal</th><th>P</th><th>C</th><th>G</th></tr></thead>
          <tbody>${st.slots.map((s, i) => `
            <tr class="${s.ativo ? '' : 'off'}">
              <td><input type="checkbox" data-slot="${i}" data-f="ativo" ${s.ativo ? 'checked' : ''}></td>
              <td>${esc(s.nome)}</td>
              <td><input class="rx-in" type="time" data-slot="${i}" data-f="hora" value="${esc(s.hora)}"></td>
              <td><input class="rx-in sm" type="number" data-slot="${i}" data-f="pctKcal" value="${esc(s.pctKcal)}"></td>
              <td><input class="rx-in sm" type="number" data-slot="${i}" data-f="pctProt" value="${esc(s.pctProt)}"></td>
              <td>${c ? c.mts[i].kcal : '—'}</td><td>${c ? c.mts[i].prot : '—'}</td><td>${c ? c.mts[i].carb : '—'}</td><td>${c ? c.mts[i].gord : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        <div class="admin-row-sub" style="margin-top:8px;">${sumK === 100 && sumP === 100 ? '✅ As porcentagens somam 100%.' : `⚠️ As porcentagens precisam somar 100% (calorias: ${sumK}% · proteína: ${sumP}%).`}</div>
      </div>
    `;
  }

  function renderDayBar(c) {
    const t = c.target, d = c.day;
    const cell = (label, plan, goal, tol) => {
      const s = statusOf(plan, goal, tol);
      return `<div class="rx-day-cell ${s}"><span>${label}</span><b>${Math.round(plan)}</b><small>de ${Math.round(goal)} · ${STATUS_LABEL[s] || ''}</small></div>`;
    };
    return `
      <div class="rx-daybar">
        ${cell('kcal do dia', d.kcal, t.calories, 0.05)}
        ${cell('Proteína (g)', d.prot, t.protein_g, 0.10)}
        ${cell('Carbo (g)', d.carb, t.carb_g, 0.10)}
        ${cell('Gordura (g)', d.gord, t.fat_g, 0.15)}
      </div>
    `;
  }

  function renderMeal(i, m, mt) {
    const s = st.slots[i];
    const status = statusOf(m.tot.kcal, mt.kcal, 0.10);
    const models = MODELS.filter(x => x.tipo === s.tipo);
    return `
      <div class="admin-card rx-meal">
        <div class="rx-meal-head">
          <div><span class="rx-time">${esc(s.hora)}</span><span class="rx-meal-name">${esc(s.nome)}</span></div>
          <select data-model="${i}">${models.map(x => `<option value="${x.code}" ${x.code === m.model.code ? 'selected' : ''}>${x.code} · ${esc(x.nome)}</option>`).join('')}</select>
        </div>
        <div class="rx-meal-meta">
          Meta ${mt.kcal} kcal · P ${mt.prot} · C ${mt.carb} · G ${mt.gord}
          <span class="rx-sep">→</span>
          <b>${Math.round(m.tot.kcal)} kcal · P ${Math.round(m.tot.prot)} · C ${Math.round(m.tot.carb)} · G ${Math.round(m.tot.gord)}</b>
          <span class="rx-status ${status}">${STATUS_LABEL[status] || ''}</span>
        </div>
        <div class="rx-scroll"><table class="rx-table rx-items">
          <thead><tr><th>Alimento</th><th>Trocar por</th><th>Quantidade (g)</th><th>kcal</th><th>P</th><th>C</th><th>G</th></tr></thead>
          <tbody>${m.items.map(it => {
            const opts = substitutionOptions(it, taco, excluded);
            const zero = !it.livre && it.g === 0;
            return `
              <tr class="${zero ? 'off' : ''}">
                <td><div class="rx-food">${esc(it.nome)}</div><span class="rx-role r-${it.role}">${ROLE_LABEL[it.role]}</span>${it.autoSwapped ? '<span class="rx-role auto">trocado pela restrição</span>' : ''}${zero ? '<span class="rx-role">dispensado neste ajuste</span>' : ''}</td>
                <td><select data-swap="${i}:${it.idx}">
                  <option value="">manter</option>
                  ${opts.map(o => `<option value="${o.id}">${esc(o.nome)} · ${o.g} g</option>`).join('')}
                </select></td>
                <td><input class="rx-in" type="number" step="5" min="0" data-grams="${i}:${it.idx}" value="${it.manual ? it.g : ''}" placeholder="${it.suggested}"> ${it.livre ? '<small class="rx-free">à vontade</small>' : ''}</td>
                <td>${Math.round(it.kcal)}</td><td>${it.prot.toFixed(0)}</td><td>${it.carb.toFixed(0)}</td><td>${it.gord.toFixed(0)}</td>
              </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    `;
  }

  main.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.k) {
      st[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    } else if (el.dataset.slot != null) {
      const s = st.slots[Number(el.dataset.slot)];
      s[el.dataset.f] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) : el.value);
    } else if (el.dataset.model != null) {
      const i = Number(el.dataset.model);
      st.models[i] = el.value;
      st.edits[i] = {};
    } else if (el.dataset.swap) {
      const [i, idx] = el.dataset.swap.split(':').map(Number);
      const ed = st.edits[i] = st.edits[i] || {};
      ed.swaps = ed.swaps || {};
      ed.grams = ed.grams || {};
      if (el.value) ed.swaps[idx] = Number(el.value); else delete ed.swaps[idx];
      delete ed.grams[idx];
    } else if (el.dataset.grams) {
      const [i, idx] = el.dataset.grams.split(':').map(Number);
      const ed = st.edits[i] = st.edits[i] || {};
      ed.grams = ed.grams || {};
      if (el.value === '') delete ed.grams[idx]; else ed.grams[idx] = Number(el.value);
    } else {
      return;
    }
    save();
    render();
  });

  main.addEventListener('click', (e) => {
    if (e.target.id !== 'rx-reset') return;
    st.models = null;
    st.edits = {};
    save();
    render();
  });

  render();
}

function age(birth) {
  const b = new Date(birth + 'T00:00:00'), n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
