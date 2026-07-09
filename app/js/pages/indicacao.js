import { signOut } from '../auth.js';
import { fetchReferralProfile, fetchReferrals } from '../lib/referrals.js';
import { fetchVisibleDiet } from '../lib/diet.js';

const TRAINER_WHATSAPP = '5567992567211';

const STATUS_LABELS = {
  pendente: '⏳ Pendente',
  contatado: '📞 Contatado',
  convertido: '✅ Convertido',
  recompensado: '🎁 Recompensado',
};

export async function renderReferrals(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando...</div>`;

  const clientId = session.user.id;
  const [profile, referrals, diet] = await Promise.all([
    fetchReferralProfile(clientId),
    fetchReferrals(clientId),
    fetchVisibleDiet(clientId),
  ]);

  const code = profile?.referral_code || '';
  const shareMsg = `Ei! Estou treinando com o Taranttine Personal e super recomendo 💪 Manda uma mensagem pra ele e fala que foi eu quem indicou — meu código é *${code}*.`;
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareMsg)}`;

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">🎁 Indicação</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-treino">🏋 Treino</button>
      <button class="logout-link" id="nav-progresso" style="margin-left:12px;">📈 Evolução</button>
      ${diet ? `<button class="logout-link" id="nav-dieta" style="margin-left:12px;">🍎 Dieta</button>` : ''}
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main">
      <div class="ex-card" style="text-align:center;">
        <div class="ex-group" style="font-size:11px;">SEU CÓDIGO</div>
        <div class="font-display" style="font-size:32px;color:var(--green);letter-spacing:.08em;margin:10px 0;">${escapeHtml(code)}</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:14px;">
          Indique amigos e familiares — quando alguém chegar mencionando seu código, você entra na lista de indicações abaixo.
        </div>
        <a class="send-btn" href="${shareUrl}" target="_blank" style="display:block;text-decoration:none;">📤 Compartilhar pelo WhatsApp</a>
      </div>

      <div class="note-box" style="margin-top:24px;"><b>Suas indicações</b></div>
      ${referrals.length ? referrals.map(renderReferralRow).join('') : '<div class="loading-state">Nenhuma indicação registrada ainda.</div>'}
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => signOut());
  document.getElementById('nav-treino').addEventListener('click', () => { window.location.hash = '/treino'; });
  document.getElementById('nav-progresso').addEventListener('click', () => { window.location.hash = '/progresso'; });
  const navDieta = document.getElementById('nav-dieta');
  if (navDieta) navDieta.addEventListener('click', () => { window.location.hash = '/dieta'; });
}

function renderReferralRow(r) {
  return `
    <div class="ex-card">
      <div class="ex-head">
        <div class="ex-name">${escapeHtml(r.referred_name)}</div>
        <span class="ex-group">${STATUS_LABELS[r.status] || r.status}</span>
      </div>
      <div style="font-size:11px;color:var(--faint);margin-top:6px;">${new Date(r.created_at).toLocaleDateString('pt-BR')}</div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
