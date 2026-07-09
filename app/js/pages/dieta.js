import { signOut } from '../auth.js';
import { fetchVisibleDiet, getDietFileUrl } from '../lib/diet.js';

export async function renderDiet(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando...</div>`;

  const clientId = session.user.id;
  const diet = await fetchVisibleDiet(clientId);

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">🍎 Dieta</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-treino">🏋 Treino</button>
      <button class="logout-link" id="nav-progresso" style="margin-left:12px;">📈 Evolução</button>
      <button class="logout-link" id="nav-indicacao" style="margin-left:12px;">🎁 Indicação</button>
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main">
      ${diet ? renderDietCard(diet) : '<div class="loading-state">Nenhum plano alimentar disponível ainda.</div>'}
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => signOut());
  document.getElementById('nav-treino').addEventListener('click', () => { window.location.hash = '/treino'; });
  document.getElementById('nav-progresso').addEventListener('click', () => { window.location.hash = '/progresso'; });
  document.getElementById('nav-indicacao').addEventListener('click', () => { window.location.hash = '/indicacao'; });

  const pdfBtn = document.getElementById('diet-pdf-btn');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
      pdfBtn.textContent = 'Abrindo...';
      const url = await getDietFileUrl(pdfBtn.dataset.path);
      pdfBtn.textContent = '📄 Ver arquivo PDF';
      if (url) window.open(url, '_blank');
      else alert('Não consegui abrir o arquivo. Tente novamente.');
    });
  }
}

function renderDietCard(diet) {
  return `
    <div class="ex-card">
      ${diet.title ? `<div class="ex-name" style="font-size:18px;margin-bottom:10px;">${escapeHtml(diet.title)}</div>` : ''}
      ${diet.content_text ? `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--text);">${escapeHtml(diet.content_text)}</div>` : ''}
      ${diet.content_url ? `<button class="send-btn" id="diet-pdf-btn" data-path="${escapeHtml(diet.content_url)}" style="margin-top:16px;">📄 Ver arquivo PDF</button>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
