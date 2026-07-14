import { supabase } from '../../../app/js/supabaseClient.js';

let exerciseLibrary = null;

async function getExerciseLibrary() {
  if (exerciseLibrary) return exerciseLibrary;
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_groups(name)')
    .order('name');
  if (error) { console.error(error); return []; }
  exerciseLibrary = data;
  return data;
}

export async function renderWorkoutEditor(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;

  const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();

  const { data: program } = await supabase
    .from('workout_programs')
    .select('id, title, subtitle, health_note')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();

  if (!program) {
    main.innerHTML = `
      <div class="admin-header"><div class="admin-title">${escapeHtml(profile?.full_name || '')}</div></div>
      <div class="admin-card">
        <p style="color:var(--muted);font-size:13px;margin-bottom:12px;">Este cliente ainda não tem um programa de treino ativo.</p>
        <button class="admin-btn primary" id="create-program">Criar programa de treino</button>
      </div>`;
    document.getElementById('create-program').addEventListener('click', async () => {
      const { error } = await supabase.from('workout_programs').insert({
        client_id: clientId, title: 'Programa de Treino', subtitle: '', is_active: true,
      });
      if (error) { alert('Erro ao criar programa: ' + error.message); return; }
      renderWorkoutEditor(main, clientId);
    });
    return;
  }

  await getExerciseLibrary();

  const { data: days } = await supabase
    .from('workout_days').select('id, label, title, sort_order')
    .eq('program_id', program.id).order('sort_order');

  const dayIds = days.map(d => d.id);
  const { data: sections } = dayIds.length
    ? await supabase.from('workout_sections').select('id, workout_day_id, title, icon, sort_order').in('workout_day_id', dayIds).order('sort_order')
    : { data: [] };
  const { data: workoutExercises } = dayIds.length
    ? await supabase.from('workout_exercises')
        .select('id, workout_day_id, section_id, sets, reps, rest_seconds, method, tip, display_group, sort_order, exercises(name)')
        .in('workout_day_id', dayIds).order('sort_order')
    : { data: [] };

  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${escapeHtml(profile?.full_name || '')}</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>

    <div class="admin-section-title">Dados do programa</div>
    <div class="admin-card admin-form">
      <label>Título</label>
      <input type="text" id="program-title" value="${escapeHtml(program.title)}">
      <label>Subtítulo</label>
      <input type="text" id="program-subtitle" value="${escapeHtml(program.subtitle || '')}">
      <label>Aviso de saúde (opcional)</label>
      <textarea id="program-health-note">${escapeHtml(program.health_note || '')}</textarea>
      <button class="admin-btn primary" id="save-program" style="margin-top:12px;">Salvar</button>
      <div class="admin-msg" id="program-msg"></div>
    </div>

    <div class="admin-section-title">Treinos</div>
    <div id="days-container"></div>
    <button class="admin-btn primary" id="add-day">+ Adicionar Treino (dia)</button>
  `;

  document.getElementById('save-program').addEventListener('click', async () => {
    const msg = document.getElementById('program-msg');
    const { error } = await supabase.from('workout_programs').update({
      title: document.getElementById('program-title').value.trim(),
      subtitle: document.getElementById('program-subtitle').value.trim(),
      health_note: document.getElementById('program-health-note').value.trim() || null,
    }).eq('id', program.id);
    msg.textContent = error ? 'Erro ao salvar.' : 'Salvo.';
    msg.classList.toggle('error', !!error);
  });

  document.getElementById('add-day').addEventListener('click', async () => {
    const label = prompt('Letra do treino (ex: A, B, C):');
    if (!label) return;
    const title = prompt('Título do treino (ex: Peito, Ombro e Tríceps):') || '';
    const { error } = await supabase.from('workout_days').insert({
      program_id: program.id, label, title, sort_order: days.length,
    });
    if (error) { alert('Erro: ' + error.message); return; }
    renderWorkoutEditor(main, clientId);
  });

  const sectionsByDay = groupBy(sections, 'workout_day_id');
  const exercisesByDay = groupBy(workoutExercises, 'workout_day_id');
  const container = document.getElementById('days-container');
  container.innerHTML = days.map(day => renderDayBlock(day, sectionsByDay[day.id] || [], exercisesByDay[day.id] || [])).join('');
  wireDayBlocks(main, clientId, program.id, days);
}

function renderDayBlock(day, sections, exercises) {
  const exercisesBySection = groupBy(exercises, 'section_id');
  return `
    <div class="admin-day-block" data-day="${day.id}">
      <div class="admin-day-header">
        <strong>Treino ${escapeHtml(day.label)} · ${escapeHtml(day.title)}</strong>
        <button class="admin-btn danger" data-remove-day="${day.id}">Remover dia</button>
      </div>
      <div class="admin-day-body">
        ${sections.map(section => `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;">${section.icon || ''} ${escapeHtml(section.title)}</span>
              <button class="admin-btn" data-remove-section="${section.id}" style="font-size:11px;padding:4px 8px;">Remover seção</button>
            </div>
            ${(exercisesBySection[section.id] || []).map(ex => `
              <div class="admin-ex-row">
                <span>${escapeHtml(ex.exercises?.name || '')} — ${escapeHtml(ex.sets || '')}x${escapeHtml(ex.reps || '')}</span>
                <button class="admin-btn danger" data-remove-ex="${ex.id}" style="font-size:11px;padding:3px 7px;">Remover</button>
              </div>
            `).join('') || '<div class="admin-row-sub">Nenhum exercício ainda.</div>'}
            <button class="admin-btn" data-add-ex-to-section="${section.id}" style="margin-top:8px;font-size:11px;">+ Exercício</button>
          </div>
        `).join('')}
        <button class="admin-btn" data-add-section="${day.id}">+ Adicionar seção</button>
      </div>
    </div>
  `;
}

function wireDayBlocks(main, clientId, programId, days) {
  main.querySelectorAll('[data-remove-day]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover este dia de treino e todos os exercícios dele?')) return;
      await supabase.from('workout_days').delete().eq('id', btn.dataset.removeDay);
      renderWorkoutEditor(main, clientId);
    });
  });

  main.querySelectorAll('[data-remove-section]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remover esta seção e os exercícios dela?')) return;
      await supabase.from('workout_sections').delete().eq('id', btn.dataset.removeSection);
      renderWorkoutEditor(main, clientId);
    });
  });

  main.querySelectorAll('[data-remove-ex]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await supabase.from('workout_exercises').delete().eq('id', btn.dataset.removeEx);
      renderWorkoutEditor(main, clientId);
    });
  });

  main.querySelectorAll('[data-add-section]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const dayId = btn.dataset.addSection;
      const title = prompt('Título da seção (ex: Ativação, Treino Principal):');
      if (!title) return;
      const icon = prompt('Ícone (opcional, ex: ⚡ 🏋 🧘):') || '';
      await supabase.from('workout_sections').insert({ workout_day_id: dayId, title, icon, sort_order: 0 });
      renderWorkoutEditor(main, clientId);
    });
  });

  main.querySelectorAll('[data-add-ex-to-section]').forEach(btn => {
    btn.addEventListener('click', () => openExercisePicker(main, clientId, btn.dataset.addExToSection));
  });
}

async function openExercisePicker(main, clientId, sectionId) {
  const { data: sectionRow } = await supabase.from('workout_sections').select('workout_day_id').eq('id', sectionId).single();
  const library = await getExerciseLibrary();

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:flex-end;';
  modal.innerHTML = `
    <div style="background:var(--black2);width:100%;max-height:80vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:16px;">
      <input type="text" id="ex-search" placeholder="Buscar exercício..." style="width:100%;background:var(--black3);border:1.5px solid var(--border2);border-radius:8px;padding:10px;color:var(--text);margin-bottom:10px;">
      <div class="exercise-picker" id="ex-picker-list"></div>
      <button class="admin-btn" id="ex-picker-cancel" style="margin-top:10px;width:100%;">Cancelar</button>
    </div>
  `;
  document.body.appendChild(modal);

  const listEl = modal.querySelector('#ex-picker-list');
  function renderList(filter) {
    const f = (filter || '').toLowerCase();
    const filtered = library.filter(e => e.name.toLowerCase().includes(f)).slice(0, 80);
    listEl.innerHTML = filtered.map(e => `
      <div class="exercise-picker-item" data-ex-id="${e.id}">
        ${escapeHtml(e.name)}<div class="muscle">${escapeHtml(e.muscle_groups?.name || '')}</div>
      </div>
    `).join('') || '<div class="admin-row-sub" style="padding:10px;">Nenhum resultado.</div>';
    listEl.querySelectorAll('[data-ex-id]').forEach(item => {
      item.addEventListener('click', () => {
        document.body.removeChild(modal);
        openExerciseForm(main, clientId, sectionId, sectionRow.workout_day_id, item.dataset.exId, library.find(e => e.id === item.dataset.exId));
      });
    });
  }
  renderList('');
  modal.querySelector('#ex-search').addEventListener('input', (e) => renderList(e.target.value));
  modal.querySelector('#ex-picker-cancel').addEventListener('click', () => document.body.removeChild(modal));
}

function openExerciseForm(main, clientId, sectionId, dayId, exerciseId, exercise) {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div class="admin-card admin-form" style="width:100%;max-width:360px;">
      <div class="admin-section-title" style="margin-top:0;">${escapeHtml(exercise.name)}</div>
      <div class="field-row">
        <div><label>Séries</label><input type="text" id="f-sets" placeholder="4"></div>
        <div><label>Reps</label><input type="text" id="f-reps" placeholder="8-10"></div>
      </div>
      <label>Descanso (segundos)</label>
      <input type="number" id="f-rest">
      <label>Método / RIR</label>
      <input type="text" id="f-method" list="method-options" placeholder="RIR 2, Tradicional, Ativação...">
      <datalist id="method-options">
        <option value="Tradicional">
        <option value="RIR 1">
        <option value="RIR 2">
        <option value="RIR 3">
        <option value="Falha concêntrica">
        <option value="Rest-Pause">
        <option value="Cluster Set">
        <option value="Dropset">
        <option value="Stripset">
        <option value="Superbomba (GVT)">
        <option value="Pirâmide Crescente">
        <option value="Pirâmide Decrescente">
        <option value="Método Decrescente">
        <option value="Superset Agonista-Antagonista">
        <option value="Superset por Segmento">
        <option value="Circuito">
        <option value="Método de Prioridade">
        <option value="Ordem Variável">
        <option value="Excêntrico">
        <option value="Repetições Parciais">
        <option value="Repetições Forçadas">
        <option value="Roubada">
        <option value="Biset">
        <option value="Triset">
        <option value="Série Gigante">
      </datalist>
      <label>Grupo (opcional, sobrescreve o padrão)</label>
      <input type="text" id="f-group" placeholder="${escapeHtml(exercise.muscle_groups?.name || '')}">
      <label>Dica (opcional)</label>
      <textarea id="f-tip"></textarea>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button class="admin-btn" id="f-cancel" style="flex:1;">Cancelar</button>
        <button class="admin-btn primary" id="f-save" style="flex:1;">Adicionar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#f-cancel').addEventListener('click', () => document.body.removeChild(modal));
  modal.querySelector('#f-save').addEventListener('click', async () => {
    const { data: existing } = await supabase.from('workout_exercises').select('id').eq('section_id', sectionId);
    const { error } = await supabase.from('workout_exercises').insert({
      workout_day_id: dayId,
      section_id: sectionId,
      exercise_id: exerciseId,
      sets: modal.querySelector('#f-sets').value.trim() || null,
      reps: modal.querySelector('#f-reps').value.trim() || null,
      rest_seconds: parseInt(modal.querySelector('#f-rest').value, 10) || null,
      method: modal.querySelector('#f-method').value.trim() || null,
      display_group: modal.querySelector('#f-group').value.trim() || null,
      tip: modal.querySelector('#f-tip').value.trim() || null,
      sort_order: (existing || []).length,
    });
    if (error) { alert('Erro: ' + error.message); return; }
    document.body.removeChild(modal);
    renderWorkoutEditor(main, clientId);
  });
}

function groupBy(arr, key) {
  const out = {};
  for (const item of arr || []) (out[item[key]] ||= []).push(item);
  return out;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
