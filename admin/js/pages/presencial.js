import { supabase } from '../../../app/js/supabaseClient.js';
import { LEVEL_BANDS, DELOAD, parseNum, fmt, weeklyVolume, bandFor, volumeStatus } from '../../../app/js/lib/progression.js';
import { loadPresencialClient, isMissingColumn, isDeloadWeek } from '../lib/presencialData.js';

const ACTIONS = {
  subir:     { cls: 'up',    icon: '↑', label: 'Subir' },
  manter:    { cls: 'keep',  icon: '=', label: 'Manter' },
  reduzir:   { cls: 'down',  icon: '↓', label: 'Reduzir' },
  plato:     { cls: 'warn',  icon: '⚠', label: 'Platô' },
  deload:    { cls: 'deload', icon: '↓', label: 'Deload' },
  registrar: { cls: 'muted', icon: '…', label: 'Registrar reps' },
  'sem-dado': { cls: 'muted', icon: '–', label: 'Sem histórico' },
};

export async function renderPresencial(main, clientId) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const ui = { tab: 'lancar', dayIdx: 0, date: todayLocal(), draft: {}, level: null };
  let d;

  async function reload() {
    try {
      d = await loadPresencialClient(clientId);
    } catch (e) {
      console.error(e);
      main.innerHTML = isMissingColumn(e)
        ? `<div class="admin-empty">Falta rodar a migração <b>0037</b> no Supabase (SQL Editor) pra liberar o painel dos presenciais.</div>`
        : `<div class="admin-empty">Erro ao carregar o cliente.</div>`;
      return false;
    }
    if (ui.level == null) ui.level = d.level?.nivel_final && LEVEL_BANDS[d.level.nivel_final] ? d.level.nivel_final : 'intermediario';
    return true;
  }

  function paint() {
    const y = window.scrollY;
    main.innerHTML = pageHtml(d, ui);
    window.scrollTo(0, y);
  }

  if (!(await reload())) return;
  paint();

  main.addEventListener('input', (ev) => {
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
  });

  main.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-tab],[data-day],[data-use],[data-fillall],[data-save],[data-week],[data-meso-save]');
    if (!t) return;

    if (t.dataset.tab) { ui.tab = t.dataset.tab; paint(); return; }
    if (t.dataset.day != null) { ui.dayIdx = Number(t.dataset.day); paint(); return; }

    if (t.dataset.use) {
      const ex = findExercise(d, t.dataset.use);
      if (ex?.suggestion.nextLoad != null) {
        ui.draft[ex.id] = { ...(ui.draft[ex.id] || {}), load: String(ex.suggestion.nextLoad).replace('.', ',') };
        paint();
      }
      return;
    }

    if (t.hasAttribute('data-fillall')) {
      for (const ex of d.days[ui.dayIdx]?.exercises || []) {
        if (ex.suggestion.nextLoad != null && !ui.draft[ex.id]?.load) {
          ui.draft[ex.id] = { ...(ui.draft[ex.id] || {}), load: String(ex.suggestion.nextLoad).replace('.', ',') };
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
        alert(isMissingColumn(error) ? 'Falta rodar a migração 0037 no Supabase.' : 'Erro ao salvar: ' + error.message);
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
      await updateProgram(p.id, { current_week: next });
      if (await reload()) paint();
      return;
    }

    if (t.hasAttribute('data-meso-save')) {
      const len = Number(main.querySelector('#pc-meso-len').value);
      const deload = main.querySelector('#pc-meso-deload').checked;
      const total = Number(main.querySelector('#pc-total').value);
      await updateProgram(d.program.id, { meso_length: len, meso_deload: deload, total_weeks: total });
      if (await reload()) { paint(); toast(main, 'Mesociclo salvo.'); }
    }
  });
}

async function updateProgram(id, patch) {
  const { error } = await supabase.from('workout_programs').update(patch).eq('id', id);
  if (error) { console.error(error); alert('Erro ao salvar: ' + error.message); }
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
  const pos = d.pos;
  const levelLabel = d.level?.nivel_final && LEVEL_BANDS[d.level.nivel_final] ? LEVEL_BANDS[d.level.nivel_final].label : null;
  const id = d.profile.id;
  return `
    <div class="admin-header">
      <div>
        <div class="admin-title">${name}</div>
        <div class="pc-badges">
          ${pos ? `<span class="pc-badge">Semana ${pos.week}/${d.program.total_weeks}</span>
                   <span class="pc-badge">Bloco ${pos.cycle} · sem. ${pos.pos}/${pos.length}</span>
                   ${pos.isDeload ? `<span class="pc-badge deload">Deload</span>` : ''}`
               : `<span class="pc-badge warn">Semana não definida</span>`}
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
      ${[['lancar', 'Lançar treino'], ['progressao', 'Progressão'], ['volume', 'Volume']].map(([k, l]) =>
        `<button class="pc-tab ${ui.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}
    </div>
    ${ui.tab === 'lancar' ? lancarHtml(d, ui) : ui.tab === 'progressao' ? progressaoHtml(d) : volumeHtml(d, ui)}
    <div class="pc-toast" id="pc-toast"></div>
  `;
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
    ${d.pos?.isDeload ? `<div class="pc-note deload">Semana de <b>deload</b>: as metas abaixo já vêm com carga −${Math.round((1 - DELOAD.loadFactor) * 100)}%. Faça cerca de metade das séries prescritas.</div>` : ''}
    <div class="pc-list">
      ${day.exercises.map(ex => exerciseRow(ex, ui)).join('') || '<div class="admin-empty">Sem exercícios nesse dia.</div>'}
    </div>
    <div class="pc-actions">
      <button class="admin-btn" data-fillall>Preencher com as metas</button>
      <button class="admin-btn primary" data-save>${n ? `Salvar treino (${n})` : 'Salvar treino'}</button>
    </div>`;
}

function exerciseRow(ex, ui) {
  const todays = ex.history.find(h => h.logged_on === ui.date);
  const previous = ex.history.find(h => h.logged_on !== ui.date);
  const dr = ui.draft[ex.id] || {};
  const val = (f, fallback) => esc(dr[f] ?? fallback ?? '');
  const s = ex.suggestion;
  const a = ACTIONS[s.action];
  const presc = [`${ex.sets || '?'}×${ex.reps || '?'}`, ex.targetRir != null ? `RIR ${ex.targetRir}` : null, ex.rest ? `${ex.rest}s` : null].filter(Boolean).join(' · ');
  return `
    <div class="pc-ex">
      <div class="pc-ex-head">
        <div>
          <div class="pc-ex-name">${esc(ex.name)}</div>
          <div class="pc-ex-meta">${esc(presc)}${ex.method && !/^\s*RIR\s*[\d-]+\s*$/i.test(ex.method) ? ` · ${esc(ex.method)}` : ''}</div>
        </div>
        ${s.nextLoad != null ? `<div class="pc-target ${a.cls}"><span>${a.icon} Meta</span><b>${fmtKg(s.nextLoad)} kg</b>
          ${['sem-dado', 'registrar'].includes(s.action) ? '' : `<button class="pc-use" data-use="${ex.id}">usar</button>`}</div>` : ''}
      </div>
      <div class="pc-ex-last">${previous ? `Última: <b>${esc(fmtLoad(previous.load_value))} kg</b>${previous.reps_done != null ? ` × ${previous.reps_done}` : ''}${previous.rir_done != null ? ` @RIR ${previous.rir_done}` : ''} <span>(${fmtDate(previous.logged_on)})</span>` : 'Sem lançamentos anteriores.'}</div>
      <div class="pc-ex-why ${a.cls}">${a.label}: ${esc(s.reason)}</div>
      <div class="pc-inputs">
        <label>Carga (kg)<input class="pc-in" data-we="${ex.id}" data-f="load" inputmode="decimal" placeholder="${s.nextLoad != null ? fmtKg(s.nextLoad) : '—'}" value="${val('load', todays?.load_value)}"></label>
        <label>Reps<input class="pc-in" data-we="${ex.id}" data-f="reps" inputmode="numeric" value="${val('reps', todays?.reps_done)}"></label>
        <label>RIR<input class="pc-in" data-we="${ex.id}" data-f="rir" inputmode="numeric" value="${val('rir', todays?.rir_done)}"></label>
      </div>
    </div>`;
}

function progressaoHtml(d) {
  const p = d.program;
  const all = d.days.flatMap(day => day.exercises.map(ex => ({ ...ex, day })));
  const count = (k) => all.filter(e => e.suggestion.action === k).length;
  return `
    <div class="admin-card pc-meso">
      <div class="pc-meso-row">
        <div>
          <div class="admin-row-name">${d.pos ? `Semana ${d.pos.week} de ${p.total_weeks}` : 'Semana ainda não definida'}</div>
          <div class="admin-row-sub">${d.pos ? `Bloco ${d.pos.cycle} · semana ${d.pos.pos} de ${d.pos.length}${p.meso_deload ? (d.pos.isDeload ? ' · DELOAD' : ` · deload em ${d.pos.weeksToDeload} semana(s)`) : ' · sem deload'}` : 'Defina a semana pra o sistema calcular o mesociclo.'}</div>
        </div>
        <div class="pc-week-btns">
          ${d.pos ? `<button class="admin-btn" data-week="-1">− semana</button><button class="admin-btn primary" data-week="1">Avançar semana +</button>`
                  : `<button class="admin-btn primary" data-week="start">Iniciar na semana 1</button>`}
        </div>
      </div>
      <div class="pc-meso-form admin-form">
        <label>Semanas do bloco<select id="pc-meso-len">${[3, 4, 5, 6, 7, 8].map(n => `<option value="${n}" ${n === p.meso_length ? 'selected' : ''}>${n} semanas</option>`).join('')}</select></label>
        <label>Total do programa<input type="number" id="pc-total" min="1" max="52" value="${p.total_weeks}"></label>
        <label class="pc-check"><input type="checkbox" id="pc-meso-deload" ${p.meso_deload ? 'checked' : ''}> Última semana do bloco é deload</label>
        <button class="admin-btn" data-meso-save>Salvar mesociclo</button>
      </div>
    </div>

    <div class="pc-summary">
      <div class="up"><b>${count('subir')}</b><span>subir</span></div>
      <div class="keep"><b>${count('manter')}</b><span>manter</span></div>
      <div class="down"><b>${count('reduzir')}</b><span>reduzir</span></div>
      <div class="warn"><b>${count('plato')}</b><span>platô</span></div>
      <div class="muted"><b>${count('registrar') + count('sem-dado')}</b><span>sem dado</span></div>
    </div>

    ${d.days.map(day => `
      <div class="admin-section-title">${esc(day.label)} · ${esc(day.title)}</div>
      <div class="admin-card pc-table">
        ${day.exercises.map(ex => {
          const a = ACTIONS[ex.suggestion.action];
          return `<div class="pc-trow">
            <div class="pc-tname">${esc(ex.name)}<small>${ex.last ? `${esc(fmtLoad(ex.last.load_value))} kg${ex.last.reps_done != null ? ` × ${ex.last.reps_done}` : ''}${ex.last.rir_done != null ? ` @RIR ${ex.last.rir_done}` : ''} · ${fmtDate(ex.last.logged_on)}` : 'sem lançamentos'}</small></div>
            <div class="pc-tsug ${a.cls}" title="${esc(ex.suggestion.reason)}">${a.icon} ${a.label}${ex.suggestion.nextLoad != null && !['sem-dado', 'registrar'].includes(ex.suggestion.action) ? ` · ${fmtKg(ex.suggestion.nextLoad)} kg` : ''}</div>
          </div>`;
        }).join('')}
      </div>`).join('')}

    <div class="admin-section-title">Controle de carga por semana</div>
    ${matrixHtml(d)}
  `;
}

function matrixHtml(d) {
  const weeks = [...new Set(d.logs.map(l => l.week_no).filter(w => w != null))].sort((a, b) => a - b);
  if (!weeks.length) {
    return `<div class="admin-card"><div class="admin-row-sub">Os lançamentos feitos aqui entram por semana (S1, S2, …). Ainda não há nenhum com semana definida.</div></div>`;
  }
  const rows = d.days.flatMap(day => day.exercises);
  return `<div class="admin-card pc-matrix-wrap"><table class="pc-matrix">
    <thead><tr><th>Exercício</th>${weeks.map(w => `<th>S${w}${isDeloadWeek(w, d.program) ? ' <i>D</i>' : ''}</th>`).join('')}</tr></thead>
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

// ---------- utilidades ----------

function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
// "32.5" → "32,5"; texto como "PC" fica como está
function fmtLoad(v) { const n = parseNum(v); return n != null ? fmt(Math.round(n * 10) / 10) : String(v); }
function fmtKg(n) { return String(Math.round(Number(n) * 10) / 10).replace('.', ','); }
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
