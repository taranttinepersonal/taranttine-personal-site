import { signOut } from '../auth.js';
import { CONSENT_SECTIONS, CONSENT_VERSION, fetchConsent, saveConsent } from '../lib/consent.js';

export async function renderTermo(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando...</div>`;
  const clientId = session.user.id;
  const current = await fetchConsent(clientId);
  let back = '/nutricao';
  try { back = sessionStorage.getItem('termo-voltar') || back; } catch { /* ignore */ }

  root.innerHTML = `<div class="tm-wrap">
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">🔒 Seus dados</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-back">← Voltar</button>
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main">
      <div class="ex-card">
        <div class="ex-name" style="margin-bottom:4px;">Termo de consentimento</div>
        <div style="font-size:11.5px;color:var(--faint);margin-bottom:10px;">Versão ${CONSENT_VERSION}${current ? ` · aceito em ${new Date(current.aceito_em).toLocaleDateString('pt-BR')}` : ''}</div>
        ${CONSENT_SECTIONS.map(([t, txt]) => `<div class="tm-sec"><b>${t}</b><p>${txt}</p></div>`).join('')}
      </div>
      <div class="ex-card">
        <label class="tm-check"><input type="checkbox" id="tm-saude" ${current ? 'checked' : ''}> <span><b>Autorizo</b> o uso dos meus dados de saúde para a consultoria de treino e nutrição, como descrito acima. <em>(obrigatório)</em></span></label>
        <label class="tm-check"><input type="checkbox" id="tm-ia" ${current?.uso_ia ? 'checked' : ''}> <span><b>Autorizo</b> o envio da descrição das minhas refeições, sem o meu nome, para a estimativa por inteligência artificial. <em>(opcional)</em></span></label>
        <button class="send-btn" id="tm-save" style="margin-top:12px;">${current ? 'Salvar minhas escolhas' : 'Aceitar e continuar'}</button>
        <div class="login-message" id="tm-msg"></div>
      </div>
    </div>
  </div>`;

  root.querySelector('.tm-wrap').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'nav-back') { window.location.hash = '/nutricao'; return; }
    if (b.id === 'logout-btn') { signOut(); return; }
    if (b.id === 'tm-save') {
      const msg = document.getElementById('tm-msg');
      if (!document.getElementById('tm-saude').checked) { msg.textContent = 'Para usar a consultoria, é preciso autorizar o uso dos dados de saúde.'; return; }
      b.disabled = true; b.textContent = 'Salvando...';
      try {
        await saveConsent(clientId, { usoIa: document.getElementById('tm-ia').checked });
        try { sessionStorage.removeItem('termo-voltar'); } catch { /* ignore */ }
        window.location.hash = back;
      } catch (err) {
        console.error('saveConsent failed', err);
        msg.textContent = 'Não consegui salvar. Confira a internet e tente de novo.';
        b.disabled = false; b.textContent = 'Aceitar e continuar';
      }
    }
  });
}

// Redireciona para o termo se ainda não foi aceito; devolve o consentimento.
export async function requireConsent(clientId, returnTo) {
  const c = await fetchConsent(clientId);
  if (c) return c;
  try { sessionStorage.setItem('termo-voltar', returnTo); } catch { /* ignore */ }
  window.location.hash = '/termo';
  return null;
}
