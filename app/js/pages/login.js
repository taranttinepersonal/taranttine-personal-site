import { sendMagicLink, verifyLoginCode } from '../auth.js';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function renderLogin() {
  const root = document.getElementById('app-root');
  const showInstallHint = !isStandalone();
  root.innerHTML = `
    <div class="login-screen">
      <img src="/app/icons/icon-192.png" class="login-logo" alt="Taranttine Personal">
      <div class="font-display login-brand">TARANTTINE</div>
      <div class="login-brand-sub">PERSONAL</div>
      <h1>Portal do Cliente</h1>
      ${showInstallHint ? `
        <div class="health-note">📲 Antes de entrar, adicione esta página à tela inicial do celular (compartilhar → "Adicionar à Tela de Início"). Depois, abra pelo ícone e faça login por ali — assim você não precisa entrar de novo toda vez.</div>
      ` : ''}
      <form id="login-form" class="login-form">
        <input type="email" id="login-email" placeholder="Seu e-mail" required autocomplete="email">
        <button type="submit" class="send-btn">Entrar</button>
      </form>
      <form id="code-form" class="login-form" style="display:none;">
        <input type="text" inputmode="numeric" id="login-code" placeholder="Código de 8 dígitos" required autocomplete="one-time-code">
        <button type="submit" class="send-btn">Confirmar código</button>
      </form>
      <div id="login-message" class="login-message"></div>
    </div>
  `;

  const emailForm = document.getElementById('login-form');
  const codeForm = document.getElementById('code-form');
  const message = document.getElementById('login-message');
  let sentToEmail = '';

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    if (!email) return;
    const button = emailForm.querySelector('button');
    button.disabled = true;
    button.textContent = 'Enviando...';
    message.textContent = '';
    try {
      await sendMagicLink(email);
      sentToEmail = email;
      message.textContent = `Código enviado para ${email}. Digite o código abaixo ou toque no link do e-mail.`;
      message.classList.remove('error');
      emailForm.style.display = 'none';
      codeForm.style.display = 'flex';
      document.getElementById('login-code').focus();
    } catch (err) {
      message.textContent = 'Não consegui enviar o código. Confira o e-mail e tente de novo.';
      message.classList.add('error');
      console.error(err);
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('login-code').value.trim();
    if (!code) return;
    const button = codeForm.querySelector('button');
    button.disabled = true;
    button.textContent = 'Confirmando...';
    message.textContent = '';
    try {
      await verifyLoginCode(sentToEmail, code);
      message.textContent = 'Confirmado! Entrando...';
      message.classList.remove('error');
    } catch (err) {
      message.textContent = 'Código inválido ou expirado. Confira e tente de novo.';
      message.classList.add('error');
      console.error(err);
    } finally {
      button.disabled = false;
      button.textContent = 'Confirmar código';
    }
  });
}
