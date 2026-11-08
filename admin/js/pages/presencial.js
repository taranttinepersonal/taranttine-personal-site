import { supabase } from '../../../app/js/supabaseClient.js';
import {
  LEVEL_BANDS, FEELINGS, feelingLabel, validatePhases, parseNum, fmt, weeklyVolume, bandFor, volumeStatus,
} from '../../../app/js/lib/progression.js';
import { loadPresencialClient, loadEvolutionExtras, isMissingColumn } from '../lib/presencialData.js';
import { buildEvolution, evolutionHtml, evolutionToWhatsApp, PERIODS } from '../../../app/js/lib/evolutionDoc.js';

const ACTIONS = {
  subir:     { cls: 'up',    icon: '↑', label: 'Subir' },
  manter:    { cls: 'keep',  icon: '=', label: 'Manter' },
  reduzir:   { cls: 'down',  icon: '↓', label: 'Reduzir' },
  plato:     { cls: 'warn',  icon: '⚠', label: 'Sem progresso' },
  deload:    { cls: 'deload', icon: '↓', label: 'Deload' },
  registrar: { cls: 'muted', icon: '…', label: 'Registrar reps' },
  'sem-dado': { cls: 'muted', icon: '–', label: 'Sem histórico' },
};
const MIGRATION_MSG = `<div class="admin-empty">Falta rodar as migrações <b>0037</b> e <b>0038</b> no Supabase (SQL Editor) pra liberar o painel dos presenciais.</div>`;

export async function renderPresencial(main, clientId) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const ui = { tab: 'lancar', dayIdx: 0, date: todayLocal(), draft: {}, level: null, period: 'inicio', comment: '', extras: null };
  let d;

  async function reload() {
    try {
      d = await loadPresencialClient(clientId);
    } catch (e) {
      console.error(e);
      main.innerHTML = isMissingColumn(e) ? MIGRATION_MSG : `<div class="admin-empty">Erro ao carregar o cliente.</div>`;
      return false;
    }
    if (ui.level == null) ui.level = d.level?.nivel_final && LEVEL_BANDS[d.level.nivel_final] ? d.level.nivel_final : 'intermediario';
    return true;
  }

  function paint() {
    const y = window.scrollY;
    main.innerHTML = pageHtml(d, ui);
    window.scrollTo(0, y);
    if (ui.tab === 'apresentacao' && ui.extras) refreshPreview();
  }

  // ----- modo apresentação: o mesmo documento serve pra prévia na tela e pro PDF -----
  function currentDoc() {
    const m = buildEvolution(d, ui.extras, { period: ui.period, comment: ui.comment });
    return { m, html: evolutionHtml(m, `${location.origin}/app/icons/icon-512.png`) };
  }
  function refreshPreview() {
    const f = main.querySelector('#pc-preview');
    if (!f) return;
    const fit = () => { try { f.style.height = f.contentDocument.documentElement.scrollHeight + 'px'; } catch { /* sem acesso: mantém a altura */ } };
    f.onload = () => { fit(); setTimeout(fit, 700); }; // 2ª medida: depois das fontes
    f.srcdoc = currentDoc().html;
  }

  if (!(await reload())) return;
  paint();

  main.addEventListener('input', (ev) => {
    if (ev.target.id === 'pc-comment') { ui.comment = ev.target.value; return; }
    const el = ev.target.closest('.pc-in');
    if (!el) return;
    const id = el.dataset.we;
    ui.draft[id] = { ...(ui.draft[id] || {}), [el.dataset.f]: el.value };
    const n = countDraft(ui);
    const btn = main.querySelector('[data-save]');
    if (btn) btn.textContent = n ? `Salvar treino (${n})` : 'Salvar treino';
  });

  main.addEventListener('change', (ev) => {
    if (ev.target.id === 'pc-date') { ui.date = ev.target.value || todayLocal(); ui.draft = {}; paint(); }
    if (ev.target.id === 'pc-level') { ui.level = ev.target.value; paint(); }
    if (ev.target.id === 'pc-period') { ui.period = ev.target.value; refreshPreview(); }
    if (ev.target.id === 'pc-comment') { ui.comment = ev.target.value; refreshPreview(); }
  });

  main.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-tab],[data-day],[data-use],[data-fillall],[data-save],[data-week],[data-sig-save],[data-phases-save],[data-phases-reset],[data-pdf],[data-wa],[data-copy]');
    if (!t) return;

    if (t.dataset.tab) {
      ui.tab = t.dataset.tab; paint();
      if (ui.tab === 'apresentacao' && !ui.extras) { ui.extras = await loadEvolutionExtras(clientId); paint(); }
      return;
    }

    if (t.hasAttribute('data-pdf')) {
      const { html } = currentDoc();
      const w = window.open('', '_blank');
      if (!w) { alert('O navegador bloqueou a nova janela. Libere pop-ups para este site e tente de novo.'); return; }
      w.document.write(html); w.document.close();
      const go = () => setTimeout(() => w.print(), 300);
      w.onload = () => { const ready = w.document.fonts?.ready; ready ? ready.then(go) : go(); };
      toast(main, 'PDF aberto em outra janela. Escolha "Salvar como PDF".');
      return;
    }
    if (t.hasAttribute('data-wa')) {
      const text = evolutionToWhatsApp(currentDoc().m);
      let n = String(ui.extras?.phone || '').replace(/\D/g, '');
      if (n && n.length <= 11) n = '55' + n; // celular sem DDI
      window.open(`https://wa.me/${n}?text=${encodeURIComponent(text)}`, '_blank');
      return;
    }
    if (t.hasAttribute('data-copy')) {
      try { await navigator.clipboard.writeText(evolutionToWhatsApp(currentDoc().m)); toast(main, 'Texto copiado.'); }
      catch { alert('Não consegui copiar. Use o botão do WhatsApp.'); }
      return;
    }
    if (t.dataset.day != null) { ui.dayIdx = Number(t.dataset.day); paint(); return; }

    if (t.dataset.use) {
      const ex = findExercise(d, t.dataset.use);
      if (ex?.suggestion.nextLoad != null) {
        ui.draft[ex.id] = { ...(ui.draft[ex.id] || {}), load: fmt(ex.suggestion.nextLoad) };
        paint();
      }
      return;
    }

    if (t.hasAttribute('data-fillall')) {
      for (const ex of d.days[ui.dayIdx]?.exercises || []) {
        if (ex.suggestion.nextLoad != null && !ui.draft[ex.id]?.load) {
          ui.draft[ex.id] = { ...(ui.draft[ex.id] || {}), load: fmt(ex.suggestion.nextLoad) };
        }
      }
      paint();
      return;
    }

    if (t.hasAttribute('data-save')) {
      const rows = buildRows(d, ui, clientId);
      if (!rows.length) return;
      t.disabled = true; t.textContent = 'Salvando...';
      const { error } = await supabase.from('load_history').upsert(rows, { onConflict: 'workout_exercise_id,logged_on' });
      if (error) {
        console.error(error);
        alert(isMissingColumn(error) ? 'Falta rodar as migrações 0037 e 0038 no Supabase.' : 'Erro ao salvar: ' + error.message);
        t.disabled = false; t.textContent = `Salvar treino (${rows.length})`;
        return;
      }
      ui.draft = {};
      if (await reload()) { paint(); toast(main, `${rows.length} exercício(s) salvo(s).`); }
      return;
    }

    if (t.dataset.week) {
      const p = d.program;
      const next = t.dataset.week === 'start' ? 1 : (p.current_week || 0) + Number(t.dataset.week);
      if (next < 1 || next > p.total_weeks) return;
      if (await updateProgram(p.id, { current_week: next }) && await reload()) paint();
      return;
    }

    if (t.hasAttribute('data-sig-save')) {
      if (!d.program.current_week) { alert('Defina a semana atual antes de registrar os sinais.'); return; }
      const tri = (id) => { const v = main.querySelector(id).value; return v === 'sim' ? true : v === 'nao' ? false : null; };
      const row = {
        program_id: d.program.id, client_id: clientId, week_no: d.program.current_week,
        evoluiu: tri('#pc-sig-evoluiu'), seguiu_plano: tri('#pc-sig-seguiu'),
        recuperacao: main.querySelector('#pc-sig-recup').value || null,
        deload_aplicado: main.querySelector('#pc-sig-deload').checked,
        note: main.querySelector('#pc-sig-note').value.trim() || null,
      };
      t.disabled = true;
      const { error } = await supabase.from('weekly_signals').upsert(row, { onConflict: 'program_id,week_no' });
      if (error) { console.error(error); alert('Erro ao salvar: ' + error.message); t.disabled = false; return; }
      if (await reload()) { paint(); toast(main, 'Sinais salvos.'); }
      return;
    }

    if (t.hasAttribute('data-phases-save')) {
      const phases = d.phases.map((p, i) => {
        const g = (k) => main.querySelector(`[data-ph="${i}"][data-k="${k}"]`).value.trim();
        return { ...p, from: parseInt(g('from'), 10), to: parseInt(g('to'), 10), rir: g('rir'), volume: g('volume'), repsDelta: parseNum(g('repsDelta')) ?? 0, loadFactor: parseNum(g('loadFactor')) };
      });
      const total = parseInt(main.querySelector('#pc-total').value, 10);
      const err = validatePhases(phases) || (!(total >= 1 && total <= 52) ? 'Total do programa deve ficar entre 1 e 52 semanas.' : null);
      const msg = main.querySelector('#pc-phases-msg');
      if (err) { msg.textContent = err; msg.classList.add('error'); return; }
      if (await updateProgram(d.program.id, { periodization: phases, total_weeks: total }) && await reload()) { paint(); toast(main, 'Fases salvas.'); }
      return;
    }

    if (t.hasAttribute('data-phases-reset')) {
      if (!confirm('Voltar às fases padrão do FitPro (Adaptação 1–4, Desenvolvimento 5–10, Intensificação 11–15, Deload 16)?')) return;
      if (await updateProgram(d.program.id, { periodization: null, total_weeks: 16 }) && await reload()) { paint(); toast(main, 'Fases padrão restauradas.'); }
    }
  });
}

async function updateProgram(id, patch) {
  const { error } = await supabase.from('workout_programs').update(patch).eq('id', id);
  if (error) { console.error(error); alert('Erro ao salvar: ' + error.message); return false; }
  return true;
}

// ---------- montagem das linhas pra gravar ----------

function countDraft(ui) {
  return Object.values(ui.draft).filter(v => String(v.load ?? '').trim() !== '').length;
}

function buildRows(d, ui, clientId) {
  const rows = [];
  for (const [id, v] of Object.entries(ui.draft)) {
    const raw = String(v.load ?? '').trim();
    if (!raw) continue;
    const n = parseNum(raw);
    const reps = parseNum(v.reps);
    const rir = parseNum(v.rir);
    rows.push({
      client_id: clientId,
      workout_exercise_id: id,
      load_value: n != null ? String(n) : raw, // "PC" (peso do corpo) fica como texto
      logged_on: ui.date,
      reps_done: reps != null ? Math.round(reps) : null,
      rir_done: rir != null ? Math.round(rir) : null,
      feeling: FEELINGS.some(f => f.key === v.feeling) ? v.feeling : null,
      week_no: d.program.current_week || null,
    });
  }
  return rows;
}

function findExercise(d, id) {
  for (const day of d.days) for (const ex of day.exercises) if (ex.id === id) return ex;
  return null;
}

// ---------- HTML ----------

function pageHtml(d, ui) {
  const name = esc(d.profile.full_name);
  if (!d.program) {
    return `<div class="admin-header"><div class="admin-title">${name}</div><a href="#/presenciais" class="admin-btn">← Presenciais</a></div>
      <div class="admin-empty">Esse cliente não tem ficha ativa. Monte a ficha em <a href="#/cliente/${d.profile.id}/treino">Treino</a> pra liberar o painel.</div>`;
  }
  const info = d.info;
  const levelLabel = d.level?.nivel_final && LEVEL_BANDS[d.level.nivel_final] ? LEVEL_BANDS[d.level.nivel_final].label : null;
  const id = d.profile.id;
  return `
    <div class="admin-header">
      <div>
        <div class="admin-title">${name}</div>
        <div class="pc-badges">
          ${info ? `<span class="pc-badge">Semana ${info.week}/${d.program.total_weeks}</span>
                    <span class="pc-badge ${info.phase.isDeload ? 'deload' : 'phase'}">${esc(info.phase.label)} · Meso ${info.mesociclo}</span>
                    ${info.isChange ? `<span class="pc-badge warn">Troca de fase</span>` : ''}
                    ${d.deloadApplied ? `<span class="pc-badge deload">Deload aplicado</span>` : ''}`
                 : `<span class="pc-badge warn">${d.program.current_week ? `Semana ${d.program.current_week} fora das fases` : 'Semana não definida'}</span>`}
          ${levelLabel ? `<span class="pc-badge">${esc(levelLabel)}</span>` : `<span class="pc-badge muted">Nível não avaliado</span>`}
        </div>
      </div>
      <a href="#/presenciais" class="admin-btn">← Presenciais</a>
    </div>
    <div class="pc-links">
      <a class="admin-btn" href="#/cliente/${id}/treino">Editar ficha</a>
      <a class="admin-btn" href="#/cliente/${id}/evolucao">Evolução</a>
      <a class="admin-btn" href="#/cliente/${id}/avaliacao">Avaliação</a>
      <a class="admin-btn" href="#/cliente/${id}/relatorio">Relatório</a>
    </div>
    <div class="pc-tabs">
      ${[['lancar', 'Lançar treino'], ['progressao', 'Progressão'], ['volume', 'Volume'], ['apresentacao', 'Apresentação']].map(([k, l]) =>
        `<button class="pc-tab ${ui.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}
    </div>
    ${ui.tab === 'lancar' ? lancarHtml(d, ui) : ui.tab === 'progressao' ? progressaoHtml(d) : ui.tab === 'apresentacao' ? presentationHtml(d, ui) : volumeHtml(d, ui)}
    <div class="pc-toast" id="pc-toast"></div>
  `;
}

function phaseBanners(d) {
  const info = d.info;
  if (!info) return `<div class="pc-note warn">Defina a semana atual em <b>Progressão</b> pra ver a fase, o RIR alvo e as metas de carga e reps de cada fase.</div>`;
  const dl = d.phases.find(p => p.isDeload);
  const out = [];
  if (info.isChange) out.push(`<div class="pc-note change"><b>Troca de fase:</b> a partir desta semana é <b>${esc(info.phase.label)}</b> (${esc(info.phase.rir)}). Releia a ação recomendada em Progressão antes de seguir.</div>`);
  if (d.deloadApplied) out.push(`<div class="pc-note deload"><b>Deload aplicado nesta semana:</b> cargas ×${fmt(dl?.loadFactor ?? 0.65)} e menos volume (${esc(dl?.volume || 'reduzir 30-40%')}).</div>`);
  else if (info.phase.isDeload) out.push(`<div class="pc-note">Semana de <b>consolidação</b>: mantenha as cargas. O deload só entra se os sinais do cliente indicarem (decisão sua, em Progressão → Sinais).</div>`);
  else if (d.deloadSuggested) out.push(`<div class="pc-note warn">Os sinais das últimas semanas sugerem <b>considerar um deload</b>. A decisão é sua: registre em Progressão → Sinais.</div>`);
  return out.join('');
}

function lancarHtml(d, ui) {
  if (!d.days.length) return `<div class="admin-empty">A ficha ainda não tem dias de treino.</div>`;
  const day = d.days[Math.min(ui.dayIdx, d.days.length - 1)];
  const n = countDraft(ui);
  return `
    <div class="pc-bar">
      <div class="pc-pills">
        ${d.days.map((x, i) => `<button class="pc-pill ${i === ui.dayIdx ? 'active' : ''}" data-day="${i}">${esc(x.label)} · ${esc(x.title)}</button>`).join('')}
      </div>
      <div class="pc-date"><label for="pc-date">Data</label><input type="date" id="pc-date" value="${ui.date}"></div>
    </div>
    ${phaseBanners(d)}
    <div class="pc-list">
      ${day.exercises.map(ex => exerciseRow(ex, ui, d)).join('') || '<div class="admin-empty">Sem exercícios nesse dia.</div>'}
    </div>
    <div class="pc-actions">
      <button class="admin-btn" data-fillall>Preencher com as metas</button>
      <button class="admin-btn primary" data-save>${n ? `Salvar treino (${n})` : 'Salvar treino'}</button>
    </div>`;
}

function exerciseRow(ex, ui, d) {
  const todays = ex.history.find(h => h.logged_on === ui.date);
  const previous = ex.history.find(h => h.logged_on !== ui.date);
  const dr = ui.draft[ex.id] || {};
  const val = (f, fallback) => esc(dr[f] ?? fallback ?? '');
  const s = ex.suggestion;
  const a = ACTIONS[s.action];
  const phase = d.info?.phase;
  const delta = phase?.repsDelta || 0;
  const repsTxt = ex.range ? ex.repsLabel : (ex.baseReps || '?');
  const presc = [`${ex.sets || '?'}×${repsTxt}`, phase?.rir || null, ex.rest ? `${ex.rest}s` : null].filter(Boolean).join(' · ');
  return `
    <div class="pc-ex">
      <div class="pc-ex-head">
        <div>
          <div class="pc-ex-name">${esc(ex.name)}</div>
          <div class="pc-ex-meta">${esc(presc)}${delta && ex.range ? ` <span class="pc-dim">(ficha ${esc(ex.baseReps)})</span>` : ''}${ex.method && !/^\s*RIR\s*[\d-]+\s*$/i.test(ex.method) ? ` · ${esc(ex.method)}` : ''}</div>
        </div>
        ${s.nextLoad != null ? `<div class="pc-target ${a.cls}"><span>${a.icon} Meta</span><b>${fmtKg(s.nextLoad)} kg</b>
          ${['sem-dado', 'registrar'].includes(s.action) ? '' : `<button class="pc-use" data-use="${ex.id}">usar</button>`}</div>` : ''}
      </div>
      <div class="pc-ex-last">${previous ? `Última: <b>${esc(fmtLoad(previous.load_value))} kg</b>${previous.reps_done != null ? ` × ${previous.reps_done}` : ''}${previous.rir_done != null ? ` @RIR ${previous.rir_done}` : ''}${previous.feeling ? ` · ${esc(feelingLabel(previous.feeling))}` : ''} <span${previous.estimated ? ' title="Data aproximada: carga importada da planilha"' : ''}>(${previous.estimated ? '~' : ''}${fmtDate(previous.logged_on)})</span>` : 'Sem lançamentos anteriores.'}</div>
      <div class="pc-ex-why ${a.cls}">${a.label}: ${esc(s.reason)}</div>
      <div class="pc-inputs">
        <label>Carga (kg)<input class="pc-in" data-we="${ex.id}" data-f="load" inputmode="decimal" placeholder="${s.nextLoad != null ? fmtKg(s.nextLoad) : '—'}" value="${val('load', todays?.load_value)}"></label>
        <label>Reps${wheel(ex.id, 'reps', dr.reps ?? todays?.reps_done, 1, 40)}</label>
        <label>RIR${wheel(ex.id, 'rir', dr.rir ?? todays?.rir_done, 0, 6)}</label>
        <label class="pc-feel">Sensação do exercício${feelSelect(ex.id, dr.feeling ?? todays?.feeling)}</label>
      </div>
    </div>`;
}

// Roleta (select nativo: no iPad/iPhone abre a roleta do sistema) pra reps e RIR.
// Valor fora da lista (ex.: 60 reps lançadas antes) entra como opção extra, sem perder o dado.
function wheel(weId, field, current, min, max) {
  const cur = current == null ? '' : String(current);
  const opts = [];
  for (let i = min; i <= max; i++) opts.push(String(i));
  if (cur !== '' && !opts.includes(cur)) opts.push(cur);
  return `<select class="pc-in" data-we="${weId}" data-f="${field}"><option value="">—</option>${opts.map(o => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
}

function feelSelect(weId, current) {
  return `<select class="pc-in pc-feel-sel ${current || ''}" data-we="${weId}" data-f="feeling"><option value="">—</option>${FEELINGS.map(f => `<option value="${f.key}"${f.key === current ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}</select>`;
}

// ---------- Progressão: resumo da semana, sinais, fases, sugestões e matriz ----------

function progressaoHtml(d) {
  const all = d.days.flatMap(day => day.exercises.map(ex => ({ ...ex, day })));
  const count = (k) => all.filter(e => e.suggestion.action === k).length;
  return `
    ${summaryCard(d)}
    ${signalsCard(d)}
    ${phasesCard(d)}

    <div class="pc-summary">
      <div class="up"><b>${count('subir')}</b><span>subir</span></div>
      <div class="keep"><b>${count('manter')}</b><span>manter</span></div>
      <div class="down"><b>${count('reduzir')}</b><span>reduzir</span></div>
      <div class="warn"><b>${count('plato')}</b><span>sem progresso</span></div>
      <div class="muted"><b>${count('registrar') + count('sem-dado')}</b><span>sem dado</span></div>
    </div>

    ${d.days.map(day => `
      <div class="admin-section-title">${esc(day.label)} · ${esc(day.title)}</div>
      <div class="admin-card pc-table">
        ${day.exercises.map(ex => {
          const a = ACTIONS[ex.suggestion.action];
          return `<div class="pc-trow">
            <div class="pc-tname">${esc(ex.name)}<small>${ex.last ? `${esc(fmtLoad(ex.last.load_value))} kg${ex.last.reps_done != null ? ` × ${ex.last.reps_done}` : ''}${ex.last.rir_done != null ? ` @RIR ${ex.last.rir_done}` : ''} · ${ex.last.estimated ? '~' : ''}${fmtDate(ex.last.logged_on)}${ex.last.feeling ? ` · ${esc(feelingLabel(ex.last.feeling))}` : ''}` : 'sem lançamentos'}${ex.last?.feeling === 'dor' ? `<br><span class="pc-feel-warn">⚠ dor ou incômodo na última sessão</span>` : ''}${ex.notWorking >= 2 ? `<br><span class="pc-feel-warn">⚠ não pegou em ${ex.notWorking} sessões seguidas: considere trocar o exercício</span>` : ''}</small></div>
            <div class="pc-tsug ${a.cls}" title="${esc(ex.suggestion.reason)}">${a.icon} ${a.label}${ex.suggestion.nextLoad != null && !['sem-dado', 'registrar'].includes(ex.suggestion.action) ? ` · ${fmtKg(ex.suggestion.nextLoad)} kg` : ''}</div>
          </div>`;
        }).join('')}
      </div>`).join('')}

    <div class="admin-section-title">Controle de carga por semana</div>
    ${matrixHtml(d)}
  `;
}

function summaryCard(d) {
  const p = d.program;
  const info = d.info;
  const weekBtns = info
    ? `<button class="admin-btn" data-week="-1">− semana</button><button class="admin-btn primary" data-week="1">Avançar semana +</button>`
    : `<button class="admin-btn primary" data-week="start">Iniciar na semana 1</button>`;
  if (!info) {
    return `<div class="admin-card pc-meso">
      <div class="pc-meso-row">
        <div>
          <div class="admin-row-name">${p.current_week ? `Semana ${p.current_week} fora das fases definidas` : 'Semana ainda não definida'}</div>
          <div class="admin-row-sub">Defina a semana pra o app mostrar a fase, o RIR alvo e as metas de cada exercício.</div>
        </div>
        <div class="pc-week-btns">${weekBtns}</div>
      </div>
    </div>`;
  }
  const ph = info.phase;
  const dl = ph.repsDelta;
  return `<div class="admin-card pc-meso">
    <div class="pc-meso-row">
      <div>
        <div class="pc-sum-title">Semana ${info.week} de ${p.total_weeks} · ${esc(ph.label)}</div>
        <div class="admin-row-sub">Mesociclo ${info.mesociclo} · ${info.weeksLeft ? `faltam ${info.weeksLeft} semana(s) nesta fase` : 'última semana desta fase'}</div>
      </div>
      <div class="pc-week-btns">${weekBtns}</div>
    </div>
    ${info.isChange ? `<div class="pc-note change"><b>Troca de fase:</b> releia a ação recomendada antes de seguir.</div>` : ''}
    ${d.deloadSuggested && !d.deloadApplied ? `<div class="pc-note warn">Os sinais sugerem <b>considerar um deload</b>. Decisão sua, abaixo em Sinais.</div>` : ''}
    <div class="pc-facts">
      <div><span>RIR alvo</span><b>${esc(ph.rir)}</b></div>
      <div><span>Volume relativo</span><b>${esc(ph.volume)}</b></div>
      <div><span>Reps da fase</span><b>${dl === 0 ? 'faixa da ficha' : dl > 0 ? `+${dl} reps` : `−${Math.abs(dl)} reps`}</b></div>
      <div><span>Passo de carga</span><b>×${fmt(ph.loadFactor)}</b></div>
    </div>
    <div class="pc-action"><span>Ação recomendada</span>${esc(info.action)}</div>
  </div>`;
}

function signalsCard(d) {
  const week = d.program.current_week;
  const cur = d.currentSignal;
  const sel = (id, v, opts) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const tri = (b) => b === true ? 'sim' : b === false ? 'nao' : '';
  const yn = [['', '—'], ['sim', 'Sim'], ['nao', 'Não']];
  const past = d.signals.filter(s => s.week_no !== week).slice(0, 5);
  const lbl = (b) => b === true ? 'sim' : b === false ? 'não' : '—';
  return `<div class="admin-card admin-form pc-signals">
    <div class="admin-row-name">Sinais do cliente${week ? ` · semana ${week}` : ''}</div>
    <div class="admin-row-sub">Você observa e decide. O app só recomenda deload quando os sinais pedem.</div>
    <div class="pc-sig-grid">
      <label>Evoluiu?${sel('pc-sig-evoluiu', tri(cur?.evoluiu), yn)}</label>
      <label>Seguiu o plano?${sel('pc-sig-seguiu', tri(cur?.seguiu_plano), yn)}</label>
      <label>Recuperação${sel('pc-sig-recup', cur?.recuperacao || '', [['', '—'], ['boa', 'Boa'], ['regular', 'Regular'], ['ruim', 'Ruim']])}</label>
    </div>
    <label class="pc-check"><input type="checkbox" id="pc-sig-deload" ${cur?.deload_aplicado ? 'checked' : ''}> Aplicar deload nesta semana (decisão sua)</label>
    <label>Observação<textarea id="pc-sig-note" placeholder="O que você percebeu esta semana">${esc(cur?.note || '')}</textarea></label>
    <button class="admin-btn primary" data-sig-save>Salvar sinais</button>
    ${past.length ? `<div class="pc-sig-hist"><div class="admin-row-sub">Semanas anteriores</div>${past.map(s => `
      <div class="pc-sig-row"><b>S${s.week_no}</b><span>evoluiu ${lbl(s.evoluiu)} · seguiu ${lbl(s.seguiu_plano)} · recup. ${s.recuperacao || '—'}${s.deload_aplicado ? ' · <i>deload</i>' : ''}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

function phasesCard(d) {
  const custom = Array.isArray(d.program.periodization);
  return `<details class="admin-card pc-phases">
    <summary>Fases do macrociclo ${custom ? '<span class="pc-badge phase">personalizado</span>' : '<span class="pc-badge muted">padrão FitPro</span>'}</summary>
    <div class="pc-phase-wrap"><table class="pc-phase-table">
      <thead><tr><th>Fase</th><th>De</th><th>Até</th><th>RIR</th><th>Volume</th><th>Δ reps</th><th>× carga</th></tr></thead>
      <tbody>${d.phases.map((p, i) => `<tr>
        <td class="pc-ph-name">${esc(p.label)}</td>
        <td><input data-ph="${i}" data-k="from" inputmode="numeric" value="${p.from}"></td>
        <td><input data-ph="${i}" data-k="to" inputmode="numeric" value="${p.to}"></td>
        <td><input data-ph="${i}" data-k="rir" value="${esc(p.rir || '')}"></td>
        <td><input data-ph="${i}" data-k="volume" value="${esc(p.volume || '')}"></td>
        <td><input data-ph="${i}" data-k="repsDelta" inputmode="numeric" value="${p.repsDelta}"></td>
        <td><input data-ph="${i}" data-k="loadFactor" inputmode="decimal" value="${fmt(p.loadFactor)}"></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="admin-form pc-total"><label>Total do programa (semanas)<input type="number" id="pc-total" min="1" max="52" value="${d.program.total_weeks}"></label></div>
    <div class="pc-phase-actions">
      <button class="admin-btn primary" data-phases-save>Salvar fases</button>
      ${custom ? `<button class="admin-btn" data-phases-reset>Restaurar padrão</button>` : ''}
    </div>
    <div class="admin-msg" id="pc-phases-msg"></div>
    <div class="admin-row-sub">Δ reps soma ou subtrai da faixa de reps da ficha (que é a faixa do Desenvolvimento). × carga é o passo sugerido quando o cliente bate o teto da faixa.</div>
  </details>`;
}

function matrixHtml(d) {
  const weeks = [...new Set(d.logs.map(l => l.week_no).filter(w => w != null))].sort((a, b) => a - b);
  if (!weeks.length) {
    return `<div class="admin-card"><div class="admin-row-sub">Os lançamentos feitos aqui entram por semana (S1, S2, …). Ainda não há nenhum com semana definida.</div></div>`;
  }
  const rows = d.days.flatMap(day => day.exercises);
  return `<div class="admin-card pc-matrix-wrap"><table class="pc-matrix">
    <thead><tr><th>Exercício</th>${weeks.map(w => `<th>S${w}${d.deloadWeeks.has(w) ? ' <i>D</i>' : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(ex => {
      const byWeek = {};
      for (const l of ex.history) if (l.week_no != null && byWeek[l.week_no] == null) byWeek[l.week_no] = parseNum(l.load_value);
      let prev = null;
      const cells = weeks.map(w => {
        const v = byWeek[w];
        if (v == null) return `<td class="empty">·</td>`;
        const cls = prev == null ? '' : v > prev ? 'up' : v < prev ? 'down' : '';
        prev = v;
        return `<td class="${cls}">${fmtKg(v)}</td>`;
      }).join('');
      return `<tr><td>${esc(ex.name)}</td>${cells}</tr>`;
    }).join('')}</tbody></table></div>`;
}

function volumeHtml(d, ui) {
  const rows = d.days.flatMap(day => day.exercises.map(ex => ({ sets: ex.sets, muscle: ex.muscle })));
  const vol = weeklyVolume(rows);
  if (!vol.length) return `<div class="admin-empty">Sem séries prescritas pra calcular o volume.</div>`;
  const maxBand = Math.max(...vol.map(v => (bandFor(ui.level, v.muscle)?.max || 0)));
  const scale = Math.max(maxBand, ...vol.map(v => v.sets)) * 1.1;
  const pct = (n) => Math.min(100, (n / scale) * 100);
  const fromAssessment = d.level?.nivel_final === ui.level;
  return `
    ${d.info ? `<div class="pc-note">Volume relativo desta fase (<b>${esc(d.info.phase.label)}</b>): <b>${esc(d.info.phase.volume)}</b>.</div>` : ''}
    <div class="admin-card admin-form pc-level">
      <label for="pc-level">Nível usado na faixa-alvo</label>
      <select id="pc-level">${Object.entries(LEVEL_BANDS).map(([k, v]) => `<option value="${k}" ${k === ui.level ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <div class="admin-row-sub">${fromAssessment ? `Vem da última avaliação de nível (${fmtDate(d.level.recorded_at)}).` : d.level ? 'Você trocou o nível só pra visualizar (não grava).' : 'Cliente sem avaliação de nível: usando Intermediário como referência.'}</div>
    </div>
    <div class="admin-card">
      ${vol.map(v => {
        const band = bandFor(ui.level, v.muscle);
        const st = volumeStatus(v.sets, band);
        return `<div class="pc-vrow">
          <div class="pc-vname">${esc(v.muscle)}</div>
          <div class="pc-vbar">
            ${band ? `<div class="pc-vband" style="left:${pct(band.min)}%;width:${pct(band.max) - pct(band.min)}%"></div>` : ''}
            <div class="pc-vfill ${st}" style="width:${pct(v.sets)}%"></div>
          </div>
          <div class="pc-vnum ${st}"><b>${v.sets}</b> <small>${band ? `faixa ${band.min}–${band.max}` : ''}</small></div>
        </div>`;
      }).join('')}
      <div class="pc-legend"><span class="dentro">dentro da faixa</span><span class="abaixo">abaixo</span><span class="acima">acima</span></div>
    </div>
    <div class="admin-row-sub pc-foot">Séries por semana por grupo muscular, contando cada dia da ficha uma vez. Faixas do De Salles: iniciante 1–5 · intermediário 6–10 · avançado 10–30 (quadríceps até 45). Conta só o grupo principal de cada exercício: o método conta o músculo auxiliar como ≈½ série, e isso ainda não está mapeado na biblioteca.</div>`;
}

// ---------- Apresentação: prévia do relatório + PDF + WhatsApp ----------

function presentationHtml(d, ui) {
  if (!ui.extras) return `<div class="admin-empty">Carregando dados do relatório...</div>`;
  return `
    <div class="admin-card admin-form pc-pres-tools">
      <label for="pc-period">Período da evolução</label>
      <select id="pc-period">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${String(ui.period) === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label for="pc-comment">Observações do treinador (aparecem no relatório)</label>
      <textarea id="pc-comment" placeholder="Opcional: um recado pro cliente">${esc(ui.comment)}</textarea>
      <div class="pc-pres-actions">
        <button class="admin-btn primary" data-pdf>Gerar PDF</button>
        <button class="admin-btn" data-wa>Mensagem no WhatsApp</button>
        <button class="admin-btn" data-copy>Copiar texto</button>
      </div>
      <div class="admin-row-sub">Pra enviar: 1) <b>Gerar PDF</b> e, na impressão, escolher "Salvar como PDF". 2) <b>Mensagem no WhatsApp</b> abre a conversa com o texto pronto: é só anexar o PDF.</div>
    </div>
    <iframe id="pc-preview" class="pc-preview" title="Prévia do relatório de evolução"></iframe>`;
}

// ---------- utilidades ----------

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
// "32.5" → "32,5"; texto como "PC" fica como está
function fmtLoad(v) { const n = parseNum(v); return n != null ? fmt(Math.round(n * 10) / 10) : String(v); }
function fmtKg(n) { return fmt(Math.round(Number(n) * 10) / 10); }
function fmtDate(iso) { return new Date(String(iso).slice(0, 10) + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
function toast(main, text) {
  const el = main.querySelector('#pc-toast');
  if (!el) return;
  el.textContent = text; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
