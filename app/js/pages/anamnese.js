import { signOut } from '../auth.js';
import { supabase } from '../supabaseClient.js';
import { fetchVisibleDiet } from '../lib/diet.js';

export async function renderAnamnese(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando sua anamnese...</div>`;

  const clientId = session.user.id;
  const [{ data: history }, diet] = await Promise.all([
    supabase.from('anamneses').select('id, source, recorded_at, respostas').eq('client_id', clientId).order('recorded_at', { ascending: false }),
    fetchVisibleDiet(clientId),
  ]);

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">📋 Anamnese</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-treino">🏋 Treino</button>
      <button class="logout-link" id="nav-progresso" style="margin-left:12px;">📈 Evolução</button>
      <button class="logout-link" id="nav-indicacao" style="margin-left:12px;">🎁 Indicação</button>
      ${diet ? `<button class="logout-link" id="nav-dieta" style="margin-left:12px;">🍎 Dieta</button>` : ''}
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main">
      ${history && history.length ? history.map(h => `
        <div class="ex-card" style="margin-bottom:14px;">
          <div class="ex-name" style="margin-bottom:6px;">${formatDate(h.recorded_at)} · ${h.source === 'presencial' ? 'Avaliação presencial' : 'Formulário online'}</div>
          ${Object.entries(h.respostas || {}).filter(([, v]) => v != null && String(v).length).map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
              <span style="color:var(--muted);">${escapeHtml(k)}</span>
              <span style="text-align:right;">${escapeHtml(Array.isArray(v) ? v.join(', ') : v)}</span>
            </div>
          `).join('')}
        </div>
      `).join('') : `<div class="ex-card"><div class="ex-name">Nenhuma anamnese registrada ainda.</div></div>`}
    </div>
  `;

  document.getElementById('nav-treino').addEventListener('click', () => { window.location.hash = '/treino'; });
  document.getElementById('nav-progresso').addEventListener('click', () => { window.location.hash = '/progresso'; });
  document.getElementById('nav-indicacao').addEventListener('click', () => { window.location.hash = '/indicacao'; });
  const navDieta = document.getElementById('nav-dieta');
  if (navDieta) navDieta.addEventListener('click', () => { window.location.hash = '/dieta'; });
  document.getElementById('logout-btn').addEventListener('click', () => signOut());
}

function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate.length > 10 ? isoDate : isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
