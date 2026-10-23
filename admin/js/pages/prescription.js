import { supabase } from '../../../app/js/supabaseClient.js';
import {
  fetchBodyComposition, fetchAnamneseHints, calculateTargetSuggestion, bmrRange,
} from '../../../app/js/lib/nutrition.js';
import { fetchNutritionAnamneses } from '../../../app/js/lib/nutritionAnamnese.js';
import {
  loadTaco, registerCustomFoods, mergeModels, DEFAULT_SLOTS, excludedFoods, guessGoal, mealTargets, autoSelectModels,
  buildMeal, substitutionOptions, statusOf, foodName,
} from '../../../app/js/lib/prescription.js';
import { measureText, planToWhatsApp, planPrintHtml } from '../../../app/js/lib/planDoc.js';
import { SUPPLEMENTS, EVIDENCE_LABEL, defaultDose, supplementAlerts } from '../../../app/js/lib/supplements.js';
import { screen, screeningHtml } from '../../../app/js/lib/screening.js';
import { fetchCheckins } from '../../../app/js/lib/checkin.js';
import { fetchConsent } from '../../../app/js/lib/consent.js';
import { fetchLabs, latestByCode, labHealthText } from '../../../app/js/lib/labs.js';

const ACTIVITY = [['sedentario', 'Sedentário'], ['leve', 'Leve (1-3x/sem)'], ['moderado', 'Moderado (3-5x/sem)'], ['intenso', 'Intenso (5-7x/sem)']];
const GOALS = [['emagrecimento', 'Emagrecimento'], ['manutencao', 'Manutenção'], ['ganho_de_massa', 'Ganho de massa']];
const ROLE_LABEL = { P: 'proteína', C: 'carbo', G: 'gordura', L: 'livre', X: 'porção fixa' };
const STATUS_LABEL = { ok: '✅ ok', passou: '⚠️ passou', faltou: '⚠️ faltou' };

export async function renderPrescription(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando a prescrição...</div>`;
  main.closest('.admin-shell')?.classList.add('wide');

  const [{ data: profile }, bodyComp, hints, anam, taco, { data: customRows }, { data: modelRows }, recentCheckins, consent, labs] = await Promise.all([
    supabase.from('profiles').select('full_name, birth_date, sexo, phone').eq('id', clientId).single(),
    fetchBodyComposition(clientId),
    fetchAnamneseHints(clientId),
    fetchNutritionAnamneses(clientId),
    loadTaco(),
    supabase.from('custom_foods').select('*'),
    supabase.from('meal_models').select('*'),
    fetchCheckins(clientId, 6).catch(() => []),
    fetchConsent(clientId),
    fetchLabs(clientId).then(r => r || []),
  ]).then(r => r);
  registerCustomFoods(taco, customRows);
  const triagem = screen({
    idade: profile?.birth_date ? age(profile.birth_date) : null, sexo: profile?.sexo,
    saude: { medicamentos: hints.medicamentos, doencas: hints.doencas, cirurgias: hints.cirurgias },
    r1: anam.etapa1?.respostas, r2: anam.etapa2?.respostas, checkins: recentCheckins, labs,
  });
  const models = mergeModels(modelRows);
  const excluded = excludedFoods(anam.etapa1, taco, models);
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
    supps: {},
    ...deliveryDefaults(bodyComp.weightKg),
  });
  let st;
  try { st = JSON.parse(localStorage.getItem(draftKey)) || fresh(); } catch { st = fresh(); }
  st = { ...deliveryDefaults(st.weightKg), supps: {}, ...st };
  const healthText = [hints.medicamentos, hints.doencas, anam.etapa2?.respostas?.['Diagnóstico de transtorno alimentar'], anam.etapa2?.respostas?.['Alergias ou intolerâncias'], anam.etapa1?.respostas?.['Restrição por escolha'], labHealthText(latestByCode(labs), { idade: profile?.birth_date ? age(profile.birth_date) : null, sexo: profile?.sexo })].filter(x => x && !/^(nenhum|nenhuma|não|nao|-)$/i.test(String(x).trim())).join(' · ');

  function save() {
    try { localStorage.setItem(draftKey, JSON.stringify(st)); } catch { /* rascunho é só conveniência */ }
  }

  function compute() {
    const w = Number(st.weightKg), bf = Number(st.bodyFatPct);
    if (!w || !bf) return null;
    const target = calculateTargetSuggestion({ weightKg: w, bodyFatPct: bf, activityLevel: st.activity, goal: st.goal, hormoneUse: st.hormoneUse });
    const mts = mealTargets(target, st.slots);
    if (!st.models || st.models.length !== st.slots.length) st.models = autoSelectModels(st.slots, excluded, models);
    const meals = st.slots.map((s, i) => {
      if (!s.ativo) return null;
      const model = models.find(m => m.code === st.models[i]) || models.find(m => m.tipo === s.tipo);
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
      ${renderAme()}
      ${screeningHtml(triagem, esc)}
      <div class="rx-grid">
        ${renderClientCard()}
        ${renderTargetCard(c)}
      </div>
      ${renderDistribution(c)}
      ${c ? renderDayBar(c) : ''}
      ${c ? c.meals.map((m, i) => (m ? renderMeal(i, m, c.mts[i]) : '')).join('') : ''}
      ${c ? renderSupplements() : ''}
      ${c ? renderDelivery() : ''}
      <div class="admin-card rx-actions">
        <button class="admin-btn" id="rx-reset">↺ Remontar automaticamente</button>
        <button class="admin-btn primary" id="rx-pdf" ${c ? '' : 'disabled'}>📄 Gerar PDF</button>
        <button class="admin-btn primary" id="rx-send" ${c ? '' : 'disabled'}>📲 Enviar para o app</button>
        <button class="admin-btn primary" id="rx-wa" ${c ? '' : 'disabled'}>💬 WhatsApp</button>
        <span class="admin-row-sub">Rascunho salvo automaticamente neste navegador.</span>
        <div class="admin-msg" id="rx-msg"></div>
      </div>
    `;
    window.scrollTo(0, y);
  }

  // Roteiro da consulta pelo Protocolo A.M.E.: organização estratégica,
  // coleta de dados e condução do plano. Itens com "auto" se marcam sozinhos
  // a partir do que já está registrado.
  function renderAme() {
    const recent = bodyComp.recordedAt && (Date.now() - new Date(String(bodyComp.recordedAt).slice(0, 10) + 'T00:00:00')) / 86400000 <= 30;
    const auto = {
      termo: !!consent, etapa1: !!anam.etapa1, etapa2: !!anam.etapa2,
      triagem: triagem.every(t => t.nivel !== 'encaminhar'), medidas: !!recent,
      exames: !!labs[0] && (Date.now() - new Date(labs[0].data + 'T00:00:00')) / 86400000 <= 180,
    };
    const blocks = [
      ['Antes · organização', '10 min', [
        ['termo', 'Termo LGPD aceito no app'], ['etapa1', 'Etapa 1 da anamnese respondida pelo aluno'],
        ['revisar', 'Li a etapa 1, o recordatório de 24 h e os últimos check-ins'], ['exames', 'Exames de sangue dos últimos 6 meses registrados'], ['triagem', 'Triagem sem encaminhamento pendente'],
      ]],
      ['0–5 min · abertura', '5 min', [
        ['objetivo', 'Objetivo nas palavras do aluno e prazo que ele imagina'], ['expect', 'Combinei como funciona: plano hoje, check-in semanal, retorno mensal'],
      ]],
      ['5–25 min · coleta (anamnese)', '20 min', [
        ['etapa2', 'Etapa 2 preenchida no painel (saúde, relação com a comida, SCOFF, ciclo)'], ['rotina', 'Rotina real: horários, trabalho, treino, quem cozinha, orçamento'],
      ]],
      ['25–40 min · coleta (medidas)', '15 min', [
        ['medidas', 'Bioimpedância ou dobras dos últimos 30 dias (condições do protocolo conferidas)'], ['fotos', 'Fotos e circunferências, se combinado'],
      ]],
      ['40–55 min · condução do plano', '15 min', [
        ['meta', 'Meta calórica e de proteína explicadas em linguagem simples'], ['montar', 'Refeições montadas com ele: preferências, trocas e o que não come'],
        ['supps', 'Suplementos: só o que tem indicação, com dose e horário'],
      ]],
      ['55–60 min · combinados', '5 min', [
        ['agua', 'Água, data do retorno e check-in semanal combinados'], ['app', 'Mostrei o plano no app e o botão "Comi esta refeição"'],
      ]],
      ['Depois · entrega no mesmo dia', '', [
        ['entrega', 'Plano enviado para o app + PDF + WhatsApp'], ['ciclo', 'Ciclo de 12 semanas iniciado na aba Nutrição'],
      ]],
    ];
    st.ame = st.ame || {};
    const all = blocks.flatMap(b => b[2]);
    const isDone = k => (k in auto ? auto[k] : !!st.ame[k]);
    const done = all.filter(([k]) => isDone(k)).length;
    return `
      <details class="admin-card ame" ${done < all.length ? 'open' : ''}>
        <summary class="admin-section-title" style="margin-top:0;cursor:pointer;">🧭 Roteiro da consulta · Protocolo A.M.E. <span class="admin-row-sub" style="text-transform:none;font-family:Inter,sans-serif;">· ${done} de ${all.length}</span></summary>
        <div class="ame-grid">${blocks.map(([t, min, items]) => `
          <div class="ame-block"><div class="ame-head"><b>${t}</b>${min ? `<span>${min}</span>` : ''}</div>
            ${items.map(([k, label]) => `<label class="ame-item ${isDone(k) ? 'done' : ''}"><input type="checkbox" data-ame="${k}" ${isDone(k) ? 'checked' : ''} ${k in auto ? 'disabled' : ''}> <span>${label}${k in auto ? ' <em>auto</em>' : ''}</span></label>`).join('')}
          </div>`).join('')}
        </div>
      </details>`;
  }

  function renderSupplements() {
    const chosen = SUPPLEMENTS.filter(x => st.supps[x.id]?.on).length;
    return `
      <div class="admin-card">
        <div class="admin-section-title" style="margin-top:0;">Suplementação <span class="admin-row-sub" style="text-transform:none;font-family:Inter,sans-serif;">· do seu Guia de Bolso · ${chosen} selecionado(s)</span></div>
        ${healthText ? `<div class="admin-row-sub" style="margin-bottom:8px;">Lido da anamnese para os alertas: ${esc(healthText)}</div>` : '<div class="admin-row-sub" style="margin-bottom:8px;">Sem medicamentos ou doenças registrados na anamnese.</div>'}
        <div class="rx-scroll"><table class="rx-table rx-supps">
          <thead><tr><th></th><th>Suplemento</th><th>Dose</th><th>Quando</th></tr></thead>
          <tbody>${SUPPLEMENTS.map(x => {
            const cur = st.supps[x.id] || {};
            const alerts = supplementAlerts(x, healthText);
            return `
              <tr class="${cur.on ? '' : 'off'}">
                <td><input type="checkbox" data-supp="${x.id}" data-sf="on" ${cur.on ? 'checked' : ''}></td>
                <td><div class="rx-food">${esc(x.nome)}</div><span class="rx-evid ${x.evidencia}">${EVIDENCE_LABEL[x.evidencia]}</span>
                  ${alerts.map(a => `<div class="rx-supp-alert">⚠️ ${esc(a)}</div>`).join('')}
                  <div class="admin-row-sub">${esc(x.cuidado)}</div></td>
                <td><input class="rx-in wide" data-supp="${x.id}" data-sf="dose" value="${esc(cur.dose ?? defaultDose(x, st.weightKg))}"></td>
                <td><input class="rx-in wide" data-supp="${x.id}" data-sf="horario" value="${esc(cur.horario ?? x.horario)}"></td>
              </tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    `;
  }

  function renderDelivery() {
    return `
      <div class="admin-card admin-form">
        <div class="admin-section-title" style="margin-top:0;">Entrega</div>
        <div class="field-row">
          <div><label>Água (L por dia)</label><input type="number" step="0.1" data-k="agua" value="${esc(st.agua)}"></div>
          <div><label>Próximo retorno</label><input type="date" data-k="retorno" value="${esc(st.retorno)}"></div>
        </div>
        <label>Orientações (uma por linha)</label>
        <textarea data-k="orient" rows="4">${esc(st.orient)}</textarea>
        <label>Assinatura no PDF</label>
        <input type="text" data-k="assinatura" value="${esc(st.assinatura)}">
      </div>
    `;
  }

  // Fotografia do plano: tudo o que o PDF, o app e o WhatsApp precisam,
  // sem depender de recalcular depois.
  function buildPlan(c) {
    const MEAL_TYPE = { cafe: 'cafe', almoco: 'almoco', jantar: 'jantar' };
    const refeicoes = c.meals.map((m, i) => {
      if (!m) return null;
      const s = st.slots[i];
      const itens = m.items.filter(it => it.livre || it.g > 0);
      const trocas = itens.filter(it => !it.livre).map(it => {
        const opcoes = substitutionOptions(it, taco, excluded).slice(0, 3).map(o => {
          const f = taco.get(o.id);
          return { id: o.id, nome: o.nome, g: o.g, kcal: (f.kcal || 0) * o.g / 100, prot: f.prot * o.g / 100, carb: f.carb * o.g / 100, gord: f.gord * o.g / 100 };
        });
        return opcoes.length ? { item: itens.indexOf(it), de: `${it.nome} ${it.g} g`, opcoes } : null;
      }).filter(Boolean);
      return {
        key: s.key, nome: s.nome, hora: s.hora, mealType: MEAL_TYPE[s.key] || 'lanche',
        kcal: m.tot.kcal, prot: m.tot.prot, carb: m.tot.carb, gord: m.tot.gord,
        itens: itens.map(it => ({ id: it.id, nome: it.nome, g: it.g, livre: it.livre, qtd: unitQty(it), medida: it.livre ? '' : measureFor(it), kcal: it.kcal, prot: it.prot, carb: it.carb, gord: it.gord })),
        trocas,
      };
    }).filter(Boolean);
    return {
      versao: 1,
      entregue_em: localISO(),
      cliente: { nome: profile?.full_name || '', peso: Number(st.weightKg) || null, objetivo: st.goal },
      meta: { kcal: Math.round(c.day.kcal), prot: Math.round(c.day.prot), carb: Math.round(c.day.carb), gord: Math.round(c.day.gord) },
      alvo: { kcal: c.target.calories, prot: c.target.protein_g, carb: c.target.carb_g, gord: c.target.fat_g },
      agua_l: Number(st.agua) || null,
      retorno: st.retorno || null,
      orientacoes: String(st.orient || '').split('\n').map(x => x.trim()).filter(Boolean),
      profissional: st.assinatura,
      suplementos: SUPPLEMENTS.filter(x => st.supps[x.id]?.on).map(x => ({
        id: x.id, nome: x.nome, evidencia: x.evidencia,
        dose: st.supps[x.id].dose ?? defaultDose(x, st.weightKg), horario: st.supps[x.id].horario ?? x.horario, cuidado: x.cuidado,
      })),
      refeicoes,
    };
  }

  // Alimento próprio com unidade: receita aparece só em porções; os demais
  // ganham a medida caseira cadastrada.
  function unitQty(it) {
    const f = it.food;
    if (!f?.soUnidade || !f.unidadeG) return null;
    const n = Math.round(it.g / f.unidadeG * 2) / 2;
    return `${String(n).replace('.', ',')} ${f.unidadeNome || 'porção'}`;
  }
  function measureFor(it) {
    const f = it.food;
    if (f?.custom) {
      if (f.soUnidade || !f.unidadeG) return '';
      const n = Math.round(it.g / f.unidadeG * 2) / 2;
      return n > 0 ? `≈ ${String(n).replace('.', ',')} ${f.unidadeNome || ''}`.trim() : '';
    }
    return measureText(it.id, it.g);
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
    const opts = models.filter(x => x.tipo === s.tipo);
    return `
      <div class="admin-card rx-meal">
        <div class="rx-meal-head">
          <div><span class="rx-time">${esc(s.hora)}</span><span class="rx-meal-name">${esc(s.nome)}</span></div>
          <select data-model="${i}">${opts.map(x => `<option value="${x.code}" ${x.code === m.model.code ? 'selected' : ''}>${x.code} · ${esc(x.nome)}</option>`).join('')}</select>
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
    if (el.dataset.ame) {
      st.ame = st.ame || {};
      st.ame[el.dataset.ame] = el.checked;
    } else if (el.dataset.k) {
      st[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
    } else if (el.dataset.slot != null) {
      const s = st.slots[Number(el.dataset.slot)];
      s[el.dataset.f] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) : el.value);
    } else if (el.dataset.supp) {
      const cur = st.supps[el.dataset.supp] = st.supps[el.dataset.supp] || {};
      cur[el.dataset.sf] = el.type === 'checkbox' ? el.checked : el.value;
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

  main.addEventListener('click', async (e) => {
    const id = e.target.id;
    const msg = document.getElementById('rx-msg');
    if (id === 'rx-reset') {
      st.models = null;
      st.edits = {};
      save();
      render();
      return;
    }
    const c = compute();
    if (!c || !['rx-pdf', 'rx-send', 'rx-wa'].includes(id)) return;
    const plan = buildPlan(c);
    if (id === 'rx-pdf') {
      const w = window.open('', '_blank');
      if (!w) { msg.className = 'admin-msg error'; msg.textContent = 'O navegador bloqueou a nova janela. Libere pop-ups para este site e tente de novo.'; return; }
      w.document.write(planPrintHtml(plan, `${location.origin}/app/icons/icon-512.png`));
      w.document.close();
      w.onload = () => setTimeout(() => w.print(), 400);
      msg.className = 'admin-msg'; msg.textContent = 'PDF aberto em outra janela. Na impressão, escolha "Salvar como PDF" ou a sua impressora.';
    } else if (id === 'rx-send') {
      e.target.disabled = true;
      const { error } = await supabase.from('nutrition_plans').insert({ client_id: clientId, plan });
      e.target.disabled = false;
      if (error) {
        console.error('send plan failed', error);
        msg.className = 'admin-msg error';
        msg.textContent = 'Não consegui enviar. Confira se o comando do banco (0025 + 0026) já foi rodado no Supabase.';
        return;
      }
      msg.className = 'admin-msg'; msg.textContent = '✅ Plano enviado. O aluno já vê na aba Dieta do app.';
    } else if (id === 'rx-wa') {
      const digits = String(profile?.phone || '').replace(/\D/g, '');
      const phone = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(planToWhatsApp(plan))}`, '_blank');
      msg.className = 'admin-msg'; msg.textContent = phone ? 'WhatsApp aberto com a mensagem pronta.' : 'WhatsApp aberto. Este aluno não tem telefone cadastrado: escolha o contato lá.';
    }
  });

  render();
}

function deliveryDefaults(weightKg) {
  const ret = new Date();
  ret.setDate(ret.getDate() + 28);
  return {
    agua: weightKg ? Math.round(Number(weightKg) * 35 / 100) / 10 : '',
    retorno: localISO(ret),
    orient: [
      'Verduras e legumes crus estão liberados à vontade.',
      'Prefira temperos naturais: alho, cebola, ervas, limão.',
      'Prepare as marmitas da semana para não depender de improviso.',
      'Se sair do plano numa refeição, siga normalmente na próxima.',
      'Registre suas refeições na aba Nutrição do app.',
    ].join('\n'),
    assinatura: 'Nutricionista · CRN-3 nº ______',
  };
}

function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
