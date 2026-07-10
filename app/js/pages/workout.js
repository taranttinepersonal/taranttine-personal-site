import { supabase, exerciseGifUrl } from '../supabaseClient.js';
import { signOut } from '../auth.js';
import {
  fetchHistoryForProgram, saveLoad, renderHistoryText,
  fetchCompletions, toggleCompletion,
} from '../lib/loadHistory.js';
import { enablePushNotifications, isPushConfigured, getNotificationPermission } from '../push.js';
import { fetchVisibleDiet } from '../lib/diet.js';
import { isBirthdayToday, getMotivationalQuote } from '../lib/birthday.js';
import { getNutritionTip } from '../lib/nutritionTips.js';

const TRAINER_WHATSAPP = '5567992567211';

export async function renderWorkout(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando seu treino...</div>`;

  const clientId = session.user.id;

  const { data: profile } = await supabase
    .from('profiles').select('full_name, birth_date, show_gifs').eq('id', clientId).single();

  const { data: program, error: programError } = await supabase
    .from('workout_programs')
    .select('id, title, subtitle, health_note')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .single();

  if (programError || !program) {
    root.innerHTML = `
      <div class="loading-state">
        Nenhum treino ativo encontrado ainda.<br>Fale com seu treinador.
        <br><br><button class="logout-link" id="logout-btn">Sair</button>
      </div>`;
    document.getElementById('logout-btn').addEventListener('click', () => { signOut(); });
    return;
  }

  const { data: days } = await supabase
    .from('workout_days')
    .select('id, label, title, sort_order')
    .eq('program_id', program.id)
    .order('sort_order');

  const dayIds = days.map(d => d.id);

  const { data: sections } = await supabase
    .from('workout_sections')
    .select('id, workout_day_id, title, icon, sort_order')
    .in('workout_day_id', dayIds)
    .order('sort_order');

  const { data: workoutExercises } = await supabase
    .from('workout_exercises')
    .select(`
      id, workout_day_id, section_id, sets, reps, rest_seconds, method, tip, display_group, sort_order,
      exercises ( name, gif_path, muscle_groups ( name ) )
    `)
    .in('workout_day_id', dayIds)
    .order('sort_order');

  const exerciseIds = workoutExercises.map(we => we.id);
  const historyByExercise = await fetchHistoryForProgram(clientId, exerciseIds);
  const completedToday = await fetchCompletions(clientId, exerciseIds);
  const diet = await fetchVisibleDiet(clientId);

  const sectionsByDay = groupBy(sections, 'workout_day_id');
  const exercisesByDay = groupBy(workoutExercises, 'workout_day_id');

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <div class="client-badge">👤 ${escapeHtml(profile?.full_name || '')}</div>
      ${isBirthdayToday(profile?.birth_date) ? `
        <div class="health-note" style="background:rgba(0,184,148,0.08);border-color:rgba(0,184,148,0.25);color:var(--green);">
          🎉 Feliz aniversário! ${escapeHtml(getMotivationalQuote())}
        </div>
      ` : ''}
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">${escapeHtml(program.title)}</h1>
      ${program.subtitle ? `<p style="font-size:12px;color:var(--muted);margin-top:6px;">${escapeHtml(program.subtitle)}</p>` : ''}
      ${program.health_note ? `<div class="health-note">⚠️ ${escapeHtml(program.health_note)}</div>` : ''}
      ${isPushConfigured() && getNotificationPermission() === 'default' ? `
        <button class="logout-link" id="enable-push-btn" style="margin-top:8px;">🔔 Ativar notificações</button>
      ` : ''}
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-progresso">📈 Evolução</button>
      <button class="logout-link" id="nav-indicacao" style="margin-left:12px;">🎁 Indicação</button>
      ${diet ? `<button class="logout-link" id="nav-dieta" style="margin-left:12px;">🍎 Dieta</button>` : ''}
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="tabs">
      ${days.map((d, i) => `<button class="tab-btn${i === 0 ? ' active' : ''}" data-day="${d.id}">Treino ${escapeHtml(d.label)}</button>`).join('')}
    </div>
    <div class="main">
      ${days.map((d, i) => renderDay(d, sectionsByDay[d.id] || [], exercisesByDay[d.id] || [], historyByExercise, completedToday, i === 0, i, profile?.show_gifs !== false)).join('')}
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => signOut());
  document.getElementById('nav-progresso').addEventListener('click', () => { window.location.hash = '/progresso'; });
  document.getElementById('nav-indicacao').addEventListener('click', () => { window.location.hash = '/indicacao'; });
  const navDieta = document.getElementById('nav-dieta');
  if (navDieta) navDieta.addEventListener('click', () => { window.location.hash = '/dieta'; });

  const pushBtn = document.getElementById('enable-push-btn');
  if (pushBtn) {
    pushBtn.addEventListener('click', async () => {
      pushBtn.textContent = 'Ativando...';
      const result = await enablePushNotifications(clientId);
      if (result.ok) {
        pushBtn.textContent = '✅ Notificações ativadas';
        pushBtn.disabled = true;
      } else {
        pushBtn.textContent = '🔔 Ativar notificações';
        if (result.reason === 'denied') alert('Permissão negada. Ative notificações nas configurações do navegador para receber avisos.');
      }
    });
  }

  root.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      root.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`day-${btn.dataset.day}`).classList.add('active');
    });
  });

  wireExerciseCards(root, clientId, program.title, profile?.full_name || '');
}

function renderDay(day, sections, exercises, historyByExercise, completedToday, isActive, dayIndex, showGifs) {
  const total = exercises.length;
  const done = exercises.filter(e => completedToday.has(e.id)).length;
  const sectionsById = {};
  for (const s of sections) sectionsById[s.id] = s;

  const bySection = {};
  const noSection = [];
  for (const ex of exercises) {
    if (ex.section_id && sectionsById[ex.section_id]) {
      (bySection[ex.section_id] ||= []).push(ex);
    } else {
      noSection.push(ex);
    }
  }

  let html = `<div class="tab-content${isActive ? ' active' : ''}" id="day-${day.id}">
    <div class="day-label">Treino ${escapeHtml(day.label)} · ${escapeHtml(day.title)}</div>
    <div class="progress-summary">
      <svg class="progress-ring" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r="18" fill="none" stroke="#2A2A2A" stroke-width="4"/>
        <circle class="ring-fill" data-day="${day.id}" cx="22" cy="22" r="18" fill="none" stroke="#00B894" stroke-width="4"
          stroke-dasharray="113" stroke-dashoffset="${113 - (113 * done / (total || 1))}" stroke-linecap="round" transform="rotate(-90 22 22)"/>
      </svg>
      <div class="progress-text">
        <div class="pt-num" data-count="${day.id}">${done}/${total}</div>
        <div class="pt-lbl">exercícios concluídos</div>
      </div>
    </div>`;

  for (const sectionId of Object.keys(bySection)) {
    const section = sectionsById[sectionId];
    const cls = /ativa/i.test(section.title) ? 'section-atv' : 'section-main';
    html += `<div class="section-header ${cls}"><span class="section-icon">${section.icon || ''}</span>${escapeHtml(section.title)}</div>`;
    for (const ex of bySection[sectionId]) {
      html += renderExerciseCard(ex, day.id, historyByExercise[ex.id], completedToday.has(ex.id), showGifs);
    }
  }
  for (const ex of noSection) {
    html += renderExerciseCard(ex, day.id, historyByExercise[ex.id], completedToday.has(ex.id), showGifs);
  }

  html += renderNutritionTip(dayIndex);
  html += `<button class="send-btn" data-send-day="${day.id}" data-day-label="${escapeHtml(day.label)}">📤 Enviar treino de hoje</button>`;
  html += `</div>`;
  return html;
}

function renderNutritionTip(dayIndex) {
  const tip = getNutritionTip(dayIndex);
  return `
    <div class="nutrition-tip-card">
      <div class="nutrition-tip-label">🍎 Dica de Nutrição</div>
      <div class="nutrition-tip-row"><b>Pré-treino</b><span>${escapeHtml(tip.pre)}</span></div>
      <div class="nutrition-tip-row"><b>Pós-treino</b><span>${escapeHtml(tip.pos)}</span></div>
      <div class="nutrition-tip-row"><b>Dica geral</b><span>${escapeHtml(tip.regra)}</span></div>
      <div class="nutrition-tip-note">Orientação geral — não substitui um plano alimentar individual.</div>
    </div>`;
}

function renderExerciseCard(ex, dayId, history, isDone, showGifs) {
  const groupLabel = ex.display_group || ex.exercises?.muscle_groups?.name || '';
  const gifUrl = showGifs && ex.exercises?.gif_path ? exerciseGifUrl(ex.exercises.gif_path) : null;
  const historyText = renderHistoryText(history);
  return `
    <div class="ex-card${isDone ? ' done' : ''}" data-ex-id="${ex.id}">
      <div class="ex-head">
        <div><div class="ex-name">${escapeHtml(ex.exercises?.name || '')}</div><span class="ex-group">${escapeHtml(groupLabel)}</span></div>
        <div class="check-circle${isDone ? ' checked' : ''}" data-check="${ex.id}" data-day="${dayId}">✓</div>
      </div>
      <div class="ex-stats">
        <div class="stat-box"><div class="stat-val">${escapeHtml(ex.sets || '—')}</div><div class="stat-lbl">Séries</div></div>
        <div class="stat-box"><div class="stat-val">${escapeHtml(ex.reps || '—')}</div><div class="stat-lbl">Reps</div></div>
        <div class="stat-box"><div class="stat-val">${ex.rest_seconds ? ex.rest_seconds + 's' : '—'}</div><div class="stat-lbl">Descanso</div></div>
        <div class="stat-box rir-box"><div class="stat-val">${escapeHtml(ex.method || '—')}</div><div class="stat-lbl">Método</div></div>
      </div>
      <input class="load-input" type="text" placeholder="Carga utilizada (kg)" data-load="${ex.id}">
      <div class="history-box${historyText ? ' has-data' : ''}">${historyText}</div>
      ${ex.tip ? `<div class="ex-tip">💡 ${escapeHtml(ex.tip)}</div>` : ''}
      ${gifUrl ? `
        <button class="gif-toggle" data-gif-toggle="${ex.id}">▶ Ver execução</button>
        <div class="gif-box" style="display:none" data-gif-box="${ex.id}"><img src="${gifUrl}" alt="${escapeHtml(ex.exercises?.name || '')}"></div>
      ` : ''}
    </div>`;
}

function wireExerciseCards(root, clientId, programTitle, clientName) {
  root.querySelectorAll('[data-check]').forEach(el => {
    el.addEventListener('click', async () => {
      const exId = el.dataset.check;
      const dayId = el.dataset.day;
      const willBeDone = !el.classList.contains('checked');
      el.classList.toggle('checked', willBeDone);
      el.closest('.ex-card').classList.toggle('done', willBeDone);
      try {
        await toggleCompletion(clientId, exId, willBeDone);
      } catch (err) {
        console.error('toggleCompletion failed', err);
      }
      updateDayProgress(root, dayId);
    });
  });

  root.querySelectorAll('[data-load]').forEach(el => {
    el.addEventListener('change', async () => {
      const exId = el.dataset.load;
      const value = el.value.trim();
      if (!value) return;
      try {
        await saveLoad(clientId, exId, value);
        const box = el.closest('.ex-card').querySelector('.history-box');
        const today = new Date().toLocaleDateString('pt-BR');
        box.textContent = `📊 Histórico: ${value}kg (${today})`;
        box.classList.add('has-data');
      } catch (err) {
        console.error('saveLoad failed', err);
      }
    });
  });

  root.querySelectorAll('[data-gif-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const box = root.querySelector(`[data-gif-box="${btn.dataset.gifToggle}"]`);
      const visible = box.style.display !== 'none';
      box.style.display = visible ? 'none' : 'block';
      btn.textContent = visible ? '▶ Ver execução' : '▼ Fechar';
    });
  });

  root.querySelectorAll('[data-send-day]').forEach(btn => {
    btn.addEventListener('click', () => sendWeeklyLoad(root, btn.dataset.sendDay, btn.dataset.dayLabel, clientName));
  });
}

function updateDayProgress(root, dayId) {
  const dayEl = document.getElementById(`day-${dayId}`);
  const cards = dayEl.querySelectorAll('.ex-card');
  const done = dayEl.querySelectorAll('.ex-card.done').length;
  const total = cards.length;
  root.querySelector(`[data-count="${dayId}"]`).textContent = `${done}/${total}`;
  const ring = root.querySelector(`.ring-fill[data-day="${dayId}"]`);
  ring.style.strokeDashoffset = 113 - (113 * done / (total || 1));
}

function sendWeeklyLoad(root, dayId, dayLabel, clientName) {
  const dayEl = document.getElementById(`day-${dayId}`);
  const cards = dayEl.querySelectorAll('.ex-card');
  const today = new Date().toLocaleDateString('pt-BR');
  let msg = `🏋️ *TARANTTINE PERSONAL*\n`;
  msg += `*Registro de Treino ${dayLabel} — ${clientName}*\n`;
  msg += `📅 ${today}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  let doneCount = 0;
  cards.forEach(card => {
    const name = card.querySelector('.ex-name').textContent;
    const isDone = card.classList.contains('done');
    const load = card.querySelector('.load-input').value.trim();
    if (isDone) doneCount++;
    msg += `${isDone ? '✅' : '⬜'} *${name}*`;
    if (load) msg += ` — ${load}kg`;
    msg += `\n`;
  });
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Concluídos: ${doneCount}/${cards.length}\n`;
  msg += `_Enviado via app Taranttine Personal_`;
  const encoded = encodeURIComponent(msg);
  window.open(`https://wa.me/${TRAINER_WHATSAPP}?text=${encoded}`, '_blank');
}

function groupBy(arr, key) {
  const out = {};
  for (const item of arr) {
    (out[item[key]] ||= []).push(item);
  }
  return out;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
