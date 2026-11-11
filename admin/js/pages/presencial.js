import { supabase } from '../../../app/js/supabaseClient.js';
import {
  LEVEL_BANDS, FEELINGS, feelingLabel, validatePhases, parseNum, parseRepsRange, fmt, weeklyVolume, bandFor, volumeStatus,
} from '../../../app/js/lib/progression.js';
import { loadPresencialClient, loadEvolutionExtras, isMissingColumn } from '../lib/presencialData.js';
import { buildEvolution, evolutionHtml, evolutionToWhatsApp, PERIODS } from '../../../app/js/lib/evolutionDoc.js';
import { suggestRotation, defaultBlockWeeks, blockInfo, peakLoad, startLoad, DEFAULT_START_PCT, patternOf, ROTATION_BANK } from '../../../app/js/lib/rotation.js';
import { applySwaps, createNextCycle, loadArchivedExerciseIds } from '../lib/rotationActions.js';
import { addExercise, removeExtra, moveExercise, setExtraIndex } from '../lib/sessionActions.js';
import { moveFlat, insertFlat, mergeExtras, swapMerged, extraKey, nextTie } from '../../../app/js/lib/ordering.js';
import { getExerciseLibrary } from '../lib/exerciseLibrary.js';
import { TECHNIQUES, techniqueByKey, techniqueLabel, aboveLevel, LEVEL_NAME } from '../../../app/js/lib/techniques.js';

const ACTIONS = {
  subir:     { cls: 'up',    icon: '↑', label: 'Subir' },
  manter:    { cls: 'keep',  icon: '=', label: 'Manter' },
  reduzir:   { cls: 'down',  icon: '↓', label: 'Reduzir' },
  plato:     { cls: 'warn',  icon: '⚠', label: 'Sem progresso' },
  deload:    { cls: 'deload', icon: '↓', label: 'Deload' },
  registrar: { cls: 'muted', icon: '…', label: 'Registrar reps' },
  'sem-dado': { cls: 'muted', icon: '–', label: 'Sem histórico' },
};
const MIGRATION_MSG = `<div class="admin-empty">Falta rodar as migrações <b>0037</b> a <b>0044</b> no Supabase (SQL Editor) pra liberar o painel dos presenciais.</div>`;

export async function renderPresencial(main, clientId) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const ui = { tab: 'lancar', dayIdx: 0, date: todayLocal(), draft: {}, sub: {}, level: null, period: 'inicio', comment: '', extras: null,
    rot: { ok: new Set(), pick: {}, pct: DEFAULT_START_PCT, withSwaps: true, archived: null } };
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
    const tab = main.querySelector('.pc-tab.active'); // 5 abas: no celular a ativa fica à vista
    if (tab?.parentElement) tab.parentElement.scrollLeft = tab.offsetLeft - (tab.parentElement.clientWidth - tab.offsetWidth) / 2;
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

  // ----- ajustes na hora: trocar aparelho / adicionar exercício -----
  async function openExerciseModal({ mode, exId }) {
    const day = d.days[Math.min(ui.dayIdx, d.days.length - 1)];
    const ex = exId ? findExercise(d, exId) : null;
    const library = await getExerciseLibrary();
    const pat = ex ? patternOf(ex.exerciseId) : null;
    const quick = pat ? pat.options.filter(o => o.id !== ex.exerciseId && !o.aliases.includes(ex.exerciseId)) : [];
    const ref = [...(day?.exercises || [])].reverse().find(e => parseRepsRange(e.reps)); // último com faixa de reps (pula alongamento/mobilidade)
    const modal = document.createElement('div');
    modal.className = 'pc-modal';
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    const pickStage = () => {
      modal.innerHTML = `<div class="pc-modal-card">
        <div class="pc-sum-title">${mode === 'sub' ? `Trocar aparelho: ${esc(ex.name)}` : `Adicionar exercício em ${esc(day.label)} · ${esc(day.title)}`}</div>
        ${quick.length ? `<div class="admin-row-sub">Mesmo padrão de movimento</div><div class="pc-quick">${quick.map(o => `<button class="pc-chip" data-pick="${o.id}" data-name="${esc(o.name)}">${esc(o.name)}</button>`).join('')}</div>` : ''}
        <input type="search" id="pc-ex-search" class="pc-in" placeholder="Buscar na biblioteca (${library.length} exercícios)..." autocomplete="off">
        <div class="pc-pick-list" id="pc-pick-list"></div>
        <button class="admin-btn" data-close>Cancelar</button>
      </div>`;
      const list = modal.querySelector('#pc-pick-list');
      const fill = (q) => {
        const f = norm(q);
        const rows = (f ? library.filter(e => norm(e.name).includes(f)) : library).slice(0, 60);
        list.innerHTML = rows.map(e => `<button class="pc-pick" data-pick="${e.id}" data-name="${esc(e.name)}">${esc(e.name)}<small>${esc(e.muscle_groups?.name || '')}</small></button>`).join('') || '<div class="admin-row-sub">Nenhum resultado.</div>';
      };
      fill('');
      modal.querySelector('#pc-ex-search').addEventListener('input', (e) => fill(e.target.value));
      modal.querySelector('#pc-ex-search').focus();
    };

    const confirmStage = (picked) => {
      if (mode === 'sub') {
        modal.innerHTML = `<div class="pc-modal-card">
          <div class="pc-sum-title">${esc(picked.name)}</div>
          <div class="admin-row-sub">no lugar de <b>${esc(ex.name)}</b></div>
          <div class="pc-modal-opt"><b>Só hoje</b><span>A ficha continua igual. A carga lançada hoje fica registrada com o aparelho trocado e não entra na progressão de ${esc(ex.name)}.</span><button class="admin-btn primary" data-sub-today>Só hoje</button></div>
          <div class="pc-modal-opt"><b>Trocar na ficha</b><span>Definitivo: o novo ocupa o lugar, com as mesmas séries, reps e descanso. O antigo vai pro arquivo com o histórico.</span><button class="admin-btn" data-sub-ficha>Trocar na ficha</button></div>
          <button class="admin-btn" data-back>Voltar</button>
        </div>`;
      } else {
        modal.innerHTML = `<div class="pc-modal-card admin-form">
          <div class="pc-sum-title">${esc(picked.name)}</div>
          <div class="pc-modal-grid">
            <label>Séries<input id="pc-add-sets" value="${esc(ref?.sets || '3')}" inputmode="numeric"></label>
            <label>Reps<input id="pc-add-reps" value="${esc(ref?.reps || '10-12')}"></label>
            <label>Descanso (s)<input id="pc-add-rest" value="${esc(ref?.rest || 60)}" inputmode="numeric"></label>
          </div>
          <label>Posição no treino<select id="pc-add-pos">
            <option value="end">No fim do treino${day.exercises.length ? ` (depois de ${esc(day.exercises[day.exercises.length - 1].name)})` : ''}</option>
            ${day.exercises.length ? '<option value="start">No começo</option>' : ''}
            ${day.exercises.map(e => `<option value="after:${e.id}">Depois de: ${esc(e.name)}</option>`).join('')}
          </select></label>
          <div class="pc-modal-opt"><b>Quando vale?</b>
            <label class="pc-radio"><input type="radio" name="pc-add-when" value="today" checked> Só hoje (não entra na ficha do cliente)</label>
            <label class="pc-radio"><input type="radio" name="pc-add-when" value="ficha"> Fica na ficha (${esc(day.label)})</label>
          </div>
          <div class="pc-modal-actions"><button class="admin-btn" data-back>Voltar</button><button class="admin-btn primary" data-add-go>Adicionar</button></div>
        </div>`;
      }
      modal.dataset.pickId = picked.id;
    };

    modal.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-close')) return close();
      if (b.hasAttribute('data-back')) return pickStage();
      if (b.dataset.pick) return confirmStage({ id: b.dataset.pick, name: b.dataset.name });
      const id = modal.dataset.pickId;
      const name = modal.querySelector('.pc-sum-title')?.textContent || '';
      if (b.hasAttribute('data-sub-today')) { ui.sub[ex.id] = { id, name }; close(); paint(); toast(main, 'Troca só de hoje: ela é salva junto com a carga.'); return; }
      b.disabled = true;
      try {
        if (b.hasAttribute('data-sub-ficha')) {
          if (!confirm(`Trocar "${ex.name}" por "${name}" na ficha, definitivamente?`)) { b.disabled = false; return; }
          await applySwaps(clientId, d.program.id, [{ rowId: ex.id, toId: id }], { restartBlock: false });
          delete ui.draft[ex.id]; delete ui.sub[ex.id];
          close(); if (await reload()) { paint(); toast(main, 'Trocado na ficha. O antigo foi pro arquivo.'); }
        } else if (b.hasAttribute('data-add-go')) {
          const when = modal.querySelector('input[name="pc-add-when"]:checked').value;
          const posVal = modal.querySelector('#pc-add-pos').value;
          const pos = posVal === 'start' ? { mode: 'start' } : posVal.startsWith('after:') ? { mode: 'after', refId: posVal.slice(6) } : { mode: 'end' };
          const vis = day.exercises;
          const common = { dayId: day.id, exerciseId: id, sets: modal.querySelector('#pc-add-sets').value.trim(), reps: modal.querySelector('#pc-add-reps').value.trim(), rest: modal.querySelector('#pc-add-rest').value.trim() };
          if (when === 'today') {
            const index = pos.mode === 'start' ? 0 : pos.mode === 'after' ? vis.findIndex(e => e.id === pos.refId) + 1 : vis.length;
            await addExercise(clientId, { ...common, onlyToday: true, date: ui.date, sortOrder: extraKey(index, nextTie(extrasOfDay(d, ui, day), index)) });
          } else {
            const probe = insertFlat(day.rows, { id: '__new' }, pos).find(r => r.id === '__new');   // seção do exercício de referência
            await addExercise(clientId, { ...common, onlyToday: false, insertAt: { sectionId: probe.section_id, build: (newId) => ({ flatBefore: day.rows, flatAfter: insertFlat(day.rows, { id: newId }, pos) }) } });
          }
          close(); if (await reload()) { paint(); toast(main, when === 'today' ? 'Exercício extra de hoje adicionado.' : 'Exercício adicionado na ficha.'); }
        }
      } catch (err) {
        console.error(err); alert('Erro: ' + (err.message || err)); b.disabled = false;
      }
    });
    pickStage();
  }

  if (!(await reload())) return;
  paint();

  main.addEventListener('input', (ev) => {
    if (ev.target.id === 'pc-comment') { ui.comment = ev.target.value; return; }
    const el = ev.target.closest('.pc-in');
    if (!el) return;
    const id = el.dataset.we;
    ui.draft[id] = { ...(ui.draft[id] || {}), [el.dataset.f]: el.value };
    const n = countDraft(d, ui);
    const btn = main.querySelector('[data-save]');
    if (btn) btn.textContent = n ? `Salvar treino (${n})` : 'Salvar treino';
  });

  main.addEventListener('change', (ev) => {
    if (ev.target.id === 'pc-date') { ui.date = ev.target.value || todayLocal(); ui.draft = {}; ui.sub = {}; paint(); }
    if (ev.target.id === 'pc-level') { ui.level = ev.target.value; paint(); }
    if (ev.target.id === 'pc-period') { ui.period = ev.target.value; refreshPreview(); }
    if (ev.target.id === 'pc-comment') { ui.comment = ev.target.value; refreshPreview(); }
    if (ev.target.dataset?.f === 'technique') { paint(); return; } // atualiza a dica da técnica
    const ok = ev.target.closest('[data-rot-ok]');
    if (ok) { ok.checked ? ui.rot.ok.add(ok.dataset.rotOk) : ui.rot.ok.delete(ok.dataset.rotOk); paint(); return; }
    const pickEl = ev.target.closest('[data-rot-pick]');
    if (pickEl) { ui.rot.pick[pickEl.dataset.rotPick] = pickEl.value; paint(); return; }
    if (ev.target.id === 'pc-pct') { ui.rot.pct = Math.min(100, Math.max(40, Number(ev.target.value) || DEFAULT_START_PCT)); paint(); return; }
    if (ev.target.id === 'pc-cycle-swaps') { ui.rot.withSwaps = ev.target.checked; paint(); }
  });

  main.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-tab],[data-day],[data-use],[data-fillall],[data-save],[data-week],[data-sig-save],[data-phases-save],[data-phases-reset],[data-pdf],[data-wa],[data-copy],[data-block-save],[data-rot-apply],[data-cycle-new],[data-sub-open],[data-sub-clear],[data-add-open],[data-extra-del],[data-move]');
    if (!t) return;

    if (t.dataset.tab) {
      ui.tab = t.dataset.tab; paint();
      if (ui.tab === 'apresentacao' && !ui.extras) { ui.extras = await loadEvolutionExtras(clientId); paint(); }
      if (ui.tab === 'rotacao' && !ui.rot.archived) {
        try { ui.rot.archived = await loadArchivedExerciseIds(clientId); } catch (e) { console.error(e); ui.rot.archived = new Set(); }
        paint();
      }
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
      ui.draft = {}; ui.sub = {};
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

    if (t.dataset.subOpen) { openExerciseModal({ mode: 'sub', exId: t.dataset.subOpen }); return; }
    if (t.dataset.subClear) { ui.sub[t.dataset.subClear] = null; paint(); return; }
    if (t.hasAttribute('data-add-open')) { openExerciseModal({ mode: 'add' }); return; }
    if (t.dataset.move) {
      const [dir, id] = t.dataset.move.split(':'), delta = dir === 'up' ? -1 : 1;
      const day = d.days[Math.min(ui.dayIdx, d.days.length - 1)];
      const extras = extrasOfDay(d, ui, day), isX = (x) => extras.some(e => e.id === x.id);
      const r = swapMerged(mergeExtras(day.exercises, extras), id, delta, isX);
      if (!r) return;
      const tasks = [];
      if (r.ficha) {
        const before = day.rows, after = moveFlat(day.rows, id, delta);
        if (!after) return;
        applyFlat(d, day, after);                                   // mostra já (otimista) e grava em seguida
        tasks.push(() => moveExercise(before, after));
      }
      for (const u of r.extraUpdates) { extras.find(e => e.id === u.id).sortOrder = u.sortOrder; tasks.push(() => setExtraIndex(u.id, u.sortOrder)); }
      paint();
      ui.q = (ui.q || Promise.resolve()).then(async () => { for (const f of tasks) await f(); }).catch(async (err) => {   // fila: gravações em ordem
        console.error(err); alert('Erro ao mudar a ordem: ' + (err.message || err)); if (await reload()) paint();
      });
      return;
    }
    if (t.dataset.extraDel) {
      if (!confirm('Remover este exercício extra de hoje (e o lançamento dele)?')) return;
      try { await removeExtra(t.dataset.extraDel); delete ui.draft[t.dataset.extraDel]; if (await reload()) paint(); }
      catch (e) { console.error(e); alert('Erro ao remover: ' + (e.message || e)); }
      return;
    }

    if (t.hasAttribute('data-block-save')) {
      const start = main.querySelector('#pc-block-start').value;
      const weeks = parseInt(main.querySelector('#pc-block-weeks').value, 10);
      if (!start || !(weeks >= 2 && weeks <= 12)) { alert('Informe o início do bloco e a duração (2 a 12 semanas).'); return; }
      if (await updateProgram(d.program.id, { last_adjusted_at: `${start}T12:00:00Z`, block_weeks: weeks }) && await reload()) { paint(); toast(main, 'Bloco salvo.'); }
      return;
    }

    if (t.hasAttribute('data-rot-apply')) {
      const swaps = rotationPlan(d, ui).swaps;
      if (!swaps.length) return;
      if (!confirm(`Trocar ${swaps.length} exercício(s) agora? A prescrição (séries, reps, descanso) fica igual; o exercício antigo vai pro arquivo com o histórico de cargas.`)) return;
      t.disabled = true; t.textContent = 'Trocando...';
      try {
        const n = await applySwaps(clientId, d.program.id, swaps.map(x => ({ rowId: x.rowId, toId: x.toId })));
        ui.rot.ok.clear(); ui.rot.pick = {};
        try { ui.rot.archived = await loadArchivedExerciseIds(clientId); } catch { ui.rot.archived = new Set(); } // o que saiu não volta na próxima sugestão
        if (await reload()) { paint(); toast(main, `${n} troca(s) feita(s). Novo bloco começa hoje.`); }
      } catch (e) {
        console.error(e); alert('Erro ao trocar: ' + (e.message || e));
        if (await reload()) paint();
      }
      return;
    }

    if (t.hasAttribute('data-cycle-new')) {
      const plan = rotationPlan(d, ui);
      const swaps = ui.rot.withSwaps ? plan.swaps : [];
      const starts = cycleStarts(d, ui.rot.pct);
      const nStart = Object.keys(starts).length;
      if (!confirm(`Criar o ciclo ${d.cycleNo + 1} agora?\n\n• Ficha copiada, semana 1 (Adaptação)\n• ${nStart} carga(s) de partida a ${ui.rot.pct}% do pico do ciclo atual\n• ${swaps.length} troca(s) de exercício aplicada(s)\n\nO ciclo atual fica guardado (inativo) com todo o histórico.`)) return;
      t.disabled = true; t.textContent = 'Criando ciclo...';
      try {
        const r = await createNextCycle(clientId, d.program.id, { starts, swaps: swaps.map(x => ({ rowId: x.rowId, toId: x.toId })) });
        ui.rot = { ok: new Set(), pick: {}, pct: ui.rot.pct, withSwaps: true, archived: null }; ui.draft = {}; ui.sub = {}; ui.dayIdx = 0;
        if (await reload()) { paint(); toast(main, `Ciclo ${r.cycleNo} criado: ${r.seeded} cargas de partida, ${r.swapped} troca(s).`); }
      } catch (e) {
        console.error(e); alert('Erro ao criar o ciclo (nada foi alterado): ' + (e.message || e));
        if (await reload()) paint();
      }
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

// carga efetiva da linha: a digitada ou, se não mexeu, a já lançada nesse dia
function effLoad(d, ui, id, v) {
  const today = findExercise(d, id)?.history.find(h => h.logged_on === ui.date);
  return String(v.load ?? today?.load_value ?? '').trim();
}
function countDraft(d, ui) {
  return Object.entries(ui.draft).filter(([id, v]) => effLoad(d, ui, id, v) !== '').length;
}

function buildRows(d, ui, clientId) {
  const rows = [];
  for (const [id, v] of Object.entries(ui.draft)) {
    const raw = effLoad(d, ui, id, v);
    if (!raw) continue;
    const ex = findExercise(d, id);
    const today = ex?.history.find(h => h.logged_on === ui.date) || null; // reeditar o dia não apaga o que já estava lançado
    const n = parseNum(raw);
    const reps = parseNum(v.reps !== undefined ? v.reps : today?.reps_done);
    const rir = parseNum(v.rir !== undefined ? v.rir : today?.rir_done);
    const feeling = v.feeling !== undefined ? v.feeling : today?.feeling;
    const technique = v.technique !== undefined ? v.technique : (today ? today.technique : ex?.defaultTechnique);
    const sub = ui.sub[id] !== undefined ? ui.sub[id]?.id : today?.substitute_exercise_id;
    rows.push({
      client_id: clientId,
      workout_exercise_id: id,
      load_value: n != null ? String(n) : raw, // "PC" (peso do corpo) fica como texto
      logged_on: ui.date,
      reps_done: reps != null ? Math.round(reps) : null,
      rir_done: rir != null ? Math.round(rir) : null,
      feeling: FEELINGS.some(f => f.key === feeling) ? feeling : null,
      technique: techniqueByKey(technique) ? technique : null,
      substitute_exercise_id: sub || null,
      estimated: false, // lançamento real substitui uma carga estimada do mesmo dia
      week_no: d.program.current_week || null,
    });
  }
  return rows;
}

function findExercise(d, id) {
  for (const day of d.days) for (const ex of day.exercises) if (ex.id === id) return ex;
  return (d.extras || []).find(ex => ex.id === id) || null;
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
          ${d.cycleNo > 1 ? `<span class="pc-badge">Ciclo ${d.cycleNo}</span>` : ''}
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
      ${[['lancar', 'Lançar treino'], ['progressao', 'Progressão'], ['volume', 'Volume'], ['rotacao', 'Rotação'], ['apresentacao', 'Apresentação']].map(([k, l]) =>
        `<button class="pc-tab ${ui.tab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}
    </div>
    ${ui.tab === 'lancar' ? lancarHtml(d, ui) : ui.tab === 'progressao' ? progressaoHtml(d) : ui.tab === 'apresentacao' ? presentationHtml(d, ui) : ui.tab === 'rotacao' ? rotacaoHtml(d, ui) : volumeHtml(d, ui)}
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
  const n = countDraft(d, ui);
  return `
    <div class="pc-bar">
      <div class="pc-pills">
        ${d.days.map((x, i) => `<button class="pc-pill ${i === ui.dayIdx ? 'active' : ''}" data-day="${i}">${esc(x.label)} · ${esc(x.title)}</button>`).join('')}
      </div>
      <div class="pc-date"><label for="pc-date">Data</label><input type="date" id="pc-date" value="${ui.date}"></div>
    </div>
    ${phaseBanners(d)}
    <div class="pc-list">
      ${listHtml(d, ui, day)}
    </div>
    ${day.hiddenStretch ? `<div class="admin-row-sub pc-hid">${day.hiddenStretch} alongamento(s) deste dia ficam só na ficha do aluno e não aparecem aqui.</div>` : ''}
    <div class="pc-actions">
      <button class="admin-btn" data-add-open>+ Adicionar exercício</button>
      <button class="admin-btn" data-fillall>Preencher com as metas</button>
      <button class="admin-btn primary" data-save>${n ? `Salvar treino (${n})` : 'Salvar treino'}</button>
    </div>`;
}

// reflete localmente a nova ordem/seção (a tela atualiza antes da gravação terminar)
function applyFlat(d, day, flat) {
  const byId = Object.fromEntries(day.exercises.map(e => [e.id, e]));
  day.rows = flat;
  day.exercises = flat.filter(r => !r.hidden).map(r => {
    const e = byId[r.id];
    e.sectionId = r.section_id; e.sectionTitle = d.sectionTitles?.[r.section_id] || e.sectionTitle; e.sortOrder = r.sort_order;
    return e;
  });
}

function extrasOfDay(d, ui, day) { return (d.extras || []).filter(x => x.dayId === day.id && x.extraOn === ui.date); }

// ficha + extras "só hoje" na ordem do treino; com mais de um bloco (ativação, treino...) mostra o nome do bloco
function listHtml(d, ui, day) {
  const extras = extrasOfDay(d, ui, day);
  const merged = mergeExtras(day.exercises, extras);
  if (!merged.length) return '<div class="admin-empty">Sem exercícios nesse dia.</div>';
  const isX = new Set(extras.map(x => x.id));
  const multi = new Set(day.exercises.map(e => e.sectionId)).size > 1;
  let lastSec;
  return merged.map((ex, i) => {
    const extra = isX.has(ex.id);
    const head = !extra && multi && ex.sectionId !== lastSec ? `<div class="pc-sec">${esc(ex.sectionTitle || 'Treino')}</div>` : '';
    if (!extra) lastSec = ex.sectionId;
    return head + exerciseRow(ex, ui, d, extra, { up: i > 0, down: i < merged.length - 1 });
  }).join('');
}

function exerciseRow(ex, ui, d, isExtra = false, mv = { up: false, down: false }) {
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
  const tech = dr.technique ?? (todays ? todays.technique : ex.defaultTechnique) ?? '';
  const sub = ui.sub[ex.id] !== undefined ? ui.sub[ex.id]
    : (todays?.substitute_exercise_id ? { id: todays.substitute_exercise_id, name: todays.substitute_name || 'outro exercício' } : null);
  return `
    <div class="pc-ex${isExtra ? ' extra' : ''}">
      <div class="pc-ex-head">
        <div>
          <div class="pc-ex-name">${esc(ex.name)}${isExtra ? ' <span class="pc-badge warn">Só hoje</span>' : ''}</div>
          ${sub ? `<div class="pc-sub">Hoje: <b>${esc(sub.name)}</b> no lugar deste · <button class="pc-link" data-sub-clear="${ex.id}">desfazer</button></div>` : ''}
          <div class="pc-ex-meta">${esc(presc)}${delta && ex.range ? ` <span class="pc-dim">(ficha ${esc(ex.baseReps)})</span>` : ''}${ex.method && !/^\s*RIR\s*[\d-]+\s*$/i.test(ex.method) ? ` · ${esc(ex.method)}` : ''}</div>
        </div>
        ${s.nextLoad != null ? `<div class="pc-target ${a.cls}"><span>${a.icon} Meta</span><b>${fmtKg(s.nextLoad)} kg</b>
          ${['sem-dado', 'registrar'].includes(s.action) ? '' : `<button class="pc-use" data-use="${ex.id}">usar</button>`}</div>` : ''}
      </div>
      <div class="pc-ex-last">${previous ? `Última: <b>${esc(fmtLoad(previous.load_value))} kg</b>${previous.reps_done != null ? ` × ${previous.reps_done}` : ''}${previous.rir_done != null ? ` @RIR ${previous.rir_done}` : ''}${previous.feeling ? ` · ${esc(feelingLabel(previous.feeling))}` : ''}${previous.technique ? ` · ${esc(techniqueLabel(previous.technique))}` : ''}${previous.substitute_name ? ` · <i>feito em ${esc(previous.substitute_name)}</i>` : ''} <span${previous.estimated ? ' title="Data aproximada: carga importada da planilha"' : ''}>(${previous.estimated ? '~' : ''}${fmtDate(previous.logged_on)})</span>` : 'Sem lançamentos anteriores.'}</div>
      <div class="pc-ex-why ${a.cls}">${a.label}: ${esc(s.reason)}</div>
      <div class="pc-inputs">
        <label>Carga (kg)<input class="pc-in" data-we="${ex.id}" data-f="load" inputmode="decimal" placeholder="${s.nextLoad != null ? fmtKg(s.nextLoad) : '—'}" value="${val('load', todays?.load_value)}"></label>
        <label>Reps${wheel(ex.id, 'reps', dr.reps ?? todays?.reps_done, 1, 40)}</label>
        <label>RIR${wheel(ex.id, 'rir', dr.rir ?? todays?.rir_done, 0, 6)}</label>
        <label class="pc-feel">Sensação do exercício${feelSelect(ex.id, dr.feeling ?? todays?.feeling)}</label>
        <label class="pc-tech">Técnica${techSelect(ex.id, tech)}</label>
      </div>
      ${techHint(tech, ui)}
      ${sub ? `<div class="pc-ex-why muted">Carga e reps de hoje não entram na progressão de ${esc(ex.name)} (aparelho diferente).</div>` : ''}
      <div class="pc-ex-tools">
        <span class="pc-move"><button class="pc-mv" data-move="up:${ex.id}" ${mv.up ? '' : 'disabled'} title="Subir na ordem do treino">↑</button><button class="pc-mv" data-move="down:${ex.id}" ${mv.down ? '' : 'disabled'} title="Descer na ordem do treino">↓</button></span>
        ${isExtra ? `<button class="pc-link" data-extra-del="${ex.id}">Remover exercício extra</button>` : `<button class="pc-link" data-sub-open="${ex.id}">Trocar aparelho</button>`}
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

function techSelect(weId, current) {
  const groups = [...new Set(TECHNIQUES.map(t => t.group))];
  return `<select class="pc-in pc-tech-sel ${current ? 'on' : ''}" data-we="${weId}" data-f="technique"><option value="">Sem técnica</option>${groups.map(g =>
    `<optgroup label="${esc(g)}">${TECHNIQUES.filter(t => t.group === g).map(t => `<option value="${t.key}"${t.key === current ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}</select>`;
}

function techHint(key, ui) {
  const t = techniqueByKey(key);
  if (!t) return '';
  const warn = aboveLevel(key, ui.level) ? ` <span class="pc-feel-warn">⚠ costuma ser liberada a partir de ${LEVEL_NAME[t.level] || t.level}; o nível usado aqui é ${LEVEL_NAME[ui.level] || ui.level}.</span>` : '';
  return `<div class="pc-tech-hint"><b>${esc(t.label)}:</b> ${esc(t.how)} <i>Melhor momento: ${esc(t.when.toLowerCase())}.</i>${t.comparable ? '' : ' A próxima carga sugerida fica em "manter" (as reps não são comparáveis com a faixa).'}${warn}</div>`;
}

function norm(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

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

// ---------- Rotação de exercícios + novo ciclo ----------

function rotationPlan(d, ui) {
  const all = d.days.flatMap(day => day.exercises);
  const items = all.map(ex => ({ rowId: ex.id, exerciseId: ex.exerciseId, name: ex.name, last: ex.last, notWorking: ex.notWorking, suggestion: ex.suggestion }));
  const plan = suggestRotation(items, { avoid: ui.rot.archived || new Set() });
  const swaps = plan.suggestions.filter(s => ui.rot.ok.has(s.rowId)).map(s => {
    const toId = ui.rot.pick[s.rowId] || s.to.id;
    const to = s.alternatives.find(a => a.id === toId) || s.to;
    return { rowId: s.rowId, toId: to.id, toName: to.name, fromName: s.from.name };
  });
  return { ...plan, swaps, total: all.length, outside: all.length - plan.eligible };
}

// carga de partida do ciclo novo: % do pico de cada exercício no ciclo atual (fora do deload)
function cycleStarts(d, pct) {
  const out = {};
  for (const ex of d.days.flatMap(day => day.exercises)) {
    const v = startLoad(peakLoad(ex.history, d.deloadWeeks), pct);
    if (v != null) out[ex.id] = v;
  }
  return out;
}

function daysLabel(b) {
  if (b.daysLeft === 0) return 'hoje';
  return b.daysLeft > 0 ? `em ${b.daysLeft} dia${b.daysLeft === 1 ? '' : 's'}` : `atrasada há ${-b.daysLeft} dia${b.daysLeft === -1 ? '' : 's'}`;
}

function rotacaoHtml(d, ui) {
  const b = d.block;
  const plan = rotationPlan(d, ui);
  const p = d.program;
  const defWeeks = defaultBlockWeeks(d.level?.nivel_final, d.info?.phase?.key);
  const weeks = p.block_weeks || defWeeks;
  const startIso = b?.start || '';
  const starts = cycleStarts(d, ui.rot.pct);
  const weeksLeft = p.current_week ? p.total_weeks - p.current_week : null;
  const endSoon = weeksLeft != null && weeksLeft <= 3;

  const blockCard = `<div class="admin-card admin-form pc-block">
    <div class="pc-meso-row">
      <div>
        <div class="pc-sum-title">Bloco de rotação${b ? ` · próxima troca ${fmtDate(b.next)}` : ''}</div>
        <div class="admin-row-sub">${b ? `Bloco de ${b.blockWeeks} semanas desde ${fmtDate(b.start)}.` : 'Informe o início do bloco.'} Padrão do método: 4 semanas (iniciante ou fase de adaptação) e 6 (intermediário/avançado).</div>
      </div>
      ${b ? `<span class="pc-badge ${b.status === 'atrasada' || b.status === 'hoje' ? 'warn' : b.status === 'proxima' ? 'deload' : 'muted'}">${daysLabel(b)}</span>` : ''}
    </div>
    <div class="pc-block-grid">
      <label>Início do bloco<input type="date" id="pc-block-start" value="${esc(startIso)}"></label>
      <label>Duração (semanas)<input type="number" id="pc-block-weeks" min="2" max="12" value="${weeks}"></label>
      <button class="admin-btn" data-block-save>Salvar bloco</button>
    </div>
    <div class="admin-row-sub">O início do bloco é a data da última vez que a ficha foi ajustada. Ao aplicar trocas, ele passa a ser hoje.</div>
  </div>`;

  const sugCard = `<div class="admin-card pc-rot">
    <div class="pc-sum-title">Trocas sugeridas</div>
    <div class="admin-row-sub">Mesmo padrão de movimento, mesma prescrição. Máximo de 50% dos exercícios do banco por troca (aqui: ${plan.limit} de ${plan.eligible}). ${plan.outside ? `${plan.outside} exercício(s) da ficha ficam fora da rotação (mobilidade, cadeiras, ponte de glúteo...).` : ''}</div>
    ${plan.suggestions.length ? plan.suggestions.map(s => {
      const on = ui.rot.ok.has(s.rowId);
      const picked = ui.rot.pick[s.rowId];
      const cur = s.alternatives.some(a => a.id === picked) ? picked : s.to.id;
      return `<div class="pc-rot-row ${on ? 'on' : ''}">
        <label class="pc-rot-ok"><input type="checkbox" data-rot-ok="${s.rowId}" ${on ? 'checked' : ''}> <span>Aprovar</span></label>
        <div class="pc-rot-main">
          <div class="pc-rot-names"><b>${esc(s.from.name)}</b> <span class="pc-dim">→</span>
            <select data-rot-pick="${s.rowId}">${s.alternatives.map(a => `<option value="${a.id}" ${a.id === cur ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
          <div class="pc-rot-why ${s.priority >= 3 ? 'warn' : ''}">${esc(s.pattern)} · ${esc(s.reason)}</div>
        </div>
      </div>`;
    }).join('') : `<div class="admin-row-sub" style="padding-top:10px;">Nada a sugerir: sem exercícios do banco com alternativa disponível.</div>`}
    <div class="pc-phase-actions">
      <button class="admin-btn primary" data-rot-apply ${plan.swaps.length ? '' : 'disabled'}>${plan.swaps.length ? `Aplicar ${plan.swaps.length} troca(s) aprovada(s)` : 'Aprove ao menos uma troca'}</button>
    </div>
    <div class="admin-row-sub">O exercício novo entra na mesma posição, com as mesmas séries, reps e descanso, e sem carga lançada: use a primeira sessão pra achar a carga. O antigo vai pro arquivo com todo o histórico.</div>
  </div>`;

  const startRows = d.days.flatMap(day => day.exercises).map(ex => {
    const sw = plan.swaps.find(x => x.rowId === ex.id);
    const peak = peakLoad(ex.history, d.deloadWeeks);
    return { ex, sw, peak, start: starts[ex.id] };
  });
  const cycleCard = `<div class="admin-card admin-form pc-cycle ${endSoon ? 'soon' : ''}">
    <div class="pc-sum-title">Novo ciclo (ciclo ${d.cycleNo + 1})</div>
    <div class="admin-row-sub">${weeksLeft == null ? 'Defina a semana atual na aba Progressão.' : weeksLeft > 0 ? `Faltam ${weeksLeft} semana(s) pro fim do ciclo atual.` : 'Ciclo atual na última semana.'} O ciclo novo copia a ficha, volta pra semana 1 (Adaptação) e parte de uma porcentagem do pico de cada carga.</div>
    <div class="pc-block-grid">
      <label>Carga de partida (% do pico)<input type="number" id="pc-pct" min="40" max="100" step="5" value="${ui.rot.pct}"></label>
      <label class="pc-check"><input type="checkbox" id="pc-cycle-swaps" ${ui.rot.withSwaps ? 'checked' : ''}> Incluir as ${plan.swaps.length} troca(s) aprovada(s)</label>
    </div>
    <div class="admin-row-sub">Sugestão: ${DEFAULT_START_PCT}%. Na Adaptação a faixa de reps sobe cerca de 5 em relação à ficha, e o fim do ciclo foi trabalhado com 3 reps a menos; pela equivalência de repetições isso dá perto de 80% do pico. Ajuste se o cliente voltou de pausa ou quer começar mais leve.</div>
    <details class="pc-cycle-prev"><summary>Ver cargas de partida (${Object.keys(starts).length} de ${startRows.length} exercícios)</summary>
      <div class="pc-cycle-table pc-table">${startRows.map(r => `<div class="pc-trow"><div class="pc-tname">${esc(r.ex.name)}${r.sw && ui.rot.withSwaps ? `<small>troca → ${esc(r.sw.toName)} (sem carga)</small>` : ''}</div>
        <div class="pc-tsug">${r.sw && ui.rot.withSwaps ? '—' : r.peak != null ? `${fmtKg(r.peak)} → <b>${fmtKg(r.start)}</b> kg` : 'sem pico'}</div></div>`).join('')}</div>
    </details>
    <div class="pc-phase-actions"><button class="admin-btn ${endSoon ? 'primary' : ''}" data-cycle-new>Criar ciclo ${d.cycleNo + 1}</button></div>
    <div class="admin-row-sub">O ciclo atual fica guardado (inativo) com todo o histórico. Dê um deload ou semana de transição antes, se for o caso.</div>
  </div>`;

  return blockCard + sugCard + cycleCard;
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
