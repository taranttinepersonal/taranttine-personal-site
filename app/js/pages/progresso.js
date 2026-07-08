import { signOut } from '../auth.js';
import { fetchEntries, saveEntry, fetchPhotos, uploadPhoto } from '../lib/progress.js';

const MEASUREMENT_FIELDS = [
  { key: 'cintura', label: 'Cintura (cm)' },
  { key: 'quadril', label: 'Quadril (cm)' },
  { key: 'braco', label: 'Braço (cm)' },
  { key: 'coxa', label: 'Coxa (cm)' },
];

export async function renderProgress(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando sua evolução...</div>`;

  const clientId = session.user.id;
  const [entries, photos] = await Promise.all([fetchEntries(clientId), fetchPhotos(clientId)]);

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">📈 Evolução</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-treino">🏋 Treino</button>
      <button class="logout-link" id="nav-indicacao" style="margin-left:12px;">🎁 Indicação</button>
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main">
      ${renderChart(entries)}
      <div class="ex-card">
        <div class="ex-name" style="margin-bottom:12px;">Registrar hoje</div>
        <form id="entry-form">
          <label class="form-label">Data</label>
          <input type="date" id="f-date" class="load-input" style="text-align:left;margin-bottom:10px;" value="${todayISO()}">
          <div class="ex-stats" style="grid-template-columns:1fr 1fr;margin-bottom:10px;">
            <div class="stat-box" style="text-align:left;padding:10px;">
              <label class="form-label">Peso (kg)</label>
              <input type="number" step="0.1" id="f-weight" class="load-input" style="text-align:left;">
            </div>
            <div class="stat-box" style="text-align:left;padding:10px;">
              <label class="form-label">% Gordura</label>
              <input type="number" step="0.1" id="f-bodyfat" class="load-input" style="text-align:left;">
            </div>
          </div>
          <div class="ex-stats" style="grid-template-columns:1fr 1fr;margin-bottom:10px;">
            ${MEASUREMENT_FIELDS.map(f => `
              <div class="stat-box" style="text-align:left;padding:10px;">
                <label class="form-label">${f.label}</label>
                <input type="number" step="0.1" id="f-${f.key}" class="load-input" style="text-align:left;">
              </div>
            `).join('')}
          </div>
          <label class="form-label">Observação</label>
          <input type="text" id="f-note" class="load-input" style="text-align:left;margin-bottom:10px;" placeholder="Como você está se sentindo?">
          <label class="form-label">Foto (opcional)</label>
          <input type="file" accept="image/*" id="f-photo" style="margin-bottom:14px;color:var(--muted);font-size:12px;">
          <button type="submit" class="send-btn" id="save-btn">Salvar registro</button>
          <div class="login-message" id="entry-msg"></div>
        </form>
      </div>

      <div class="note-box" style="margin-top:24px;">
        <b>Histórico</b>
      </div>
      ${entries.length ? entries.map(renderEntryCard).join('') : '<div class="loading-state">Nenhum registro ainda.</div>'}

      ${photos.length ? `
        <div class="note-box" style="margin-top:24px;"><b>Fotos</b></div>
        <div class="photo-grid">
          ${photos.map(p => `
            <div class="photo-thumb">
              ${p.url ? `<img src="${p.url}" alt="Foto de progresso">` : ''}
              <div class="photo-date">${formatDate(p.recorded_at)}</div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => signOut());
  document.getElementById('nav-treino').addEventListener('click', () => { window.location.hash = '/treino'; });
  document.getElementById('nav-indicacao').addEventListener('click', () => { window.location.hash = '/indicacao'; });

  document.getElementById('entry-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    const msg = document.getElementById('entry-msg');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    msg.textContent = '';

    const recordedAt = document.getElementById('f-date').value || todayISO();
    const measurements = {};
    for (const f of MEASUREMENT_FIELDS) {
      const val = document.getElementById(`f-${f.key}`).value;
      if (val) measurements[f.key] = Number(val);
    }

    try {
      await saveEntry(clientId, {
        recordedAt,
        weightKg: document.getElementById('f-weight').value || null,
        bodyFatPct: document.getElementById('f-bodyfat').value || null,
        measurements: Object.keys(measurements).length ? measurements : null,
        note: document.getElementById('f-note').value.trim() || null,
      });

      const photoFile = document.getElementById('f-photo').files[0];
      if (photoFile) {
        await uploadPhoto(clientId, photoFile, recordedAt);
      }

      renderProgress(session);
    } catch (err) {
      console.error('save progress entry failed', err);
      msg.textContent = 'Não consegui salvar. Tente de novo.';
      msg.classList.add('error');
      btn.disabled = false;
      btn.textContent = 'Salvar registro';
    }
  });
}

function renderChart(entries) {
  const withWeight = entries.filter(e => e.weight_kg != null).slice().reverse();
  if (withWeight.length < 2) return '';

  const values = withWeight.map(e => Number(e.weight_kg));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 320;
  const h = 100;
  const step = w / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 20) - 10;
    return `${x},${y}`;
  }).join(' ');

  return `
    <div class="ex-card">
      <div class="ex-name" style="margin-bottom:10px;">Peso (kg)</div>
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:100px;">
        <polyline points="${points}" fill="none" stroke="var(--green)" stroke-width="2"/>
        ${values.map((v, i) => {
          const x = i * step;
          const y = h - ((v - min) / range) * (h - 20) - 10;
          return `<circle cx="${x}" cy="${y}" r="3" fill="var(--green)"/>`;
        }).join('')}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--faint);margin-top:4px;">
        <span>${formatDate(withWeight[0].recorded_at)}</span>
        <span>${formatDate(withWeight[withWeight.length - 1].recorded_at)}</span>
      </div>
    </div>
  `;
}

function renderEntryCard(entry) {
  const stats = [];
  if (entry.weight_kg != null) stats.push(`⚖️ ${entry.weight_kg}kg`);
  if (entry.body_fat_pct != null) stats.push(`% Gordura: ${entry.body_fat_pct}%`);
  if (entry.measurements) {
    for (const f of MEASUREMENT_FIELDS) {
      if (entry.measurements[f.key] != null) stats.push(`${f.label}: ${entry.measurements[f.key]}`);
    }
  }
  return `
    <div class="ex-card">
      <div class="ex-head">
        <div class="ex-name">${formatDate(entry.recorded_at)}</div>
      </div>
      ${stats.length ? `<div style="font-size:12px;color:var(--muted);margin-top:6px;">${stats.join(' · ')}</div>` : ''}
      ${entry.note ? `<div class="ex-tip">💬 ${escapeHtml(entry.note)}</div>` : ''}
    </div>
  `;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
