import { sendMagicLink } from '../auth.js';

export function renderLogin() {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div class="login-screen">
      <img src="/app/icons/icon-192.png" class="login-logo" alt="Taranttine Personal">
      <div class="font-display login-brand">TARANTTINE</div>
      <div class="login-brand-sub">PERSONAL</div>
      <h1>Portal do Cliente</h1>
      <form id="login-form" class="login-form">
        <input type="email" id="login-email" placeholder="Seu e-mail" required autocomplete="email">
        <button type="submit" class="send-btn">Entrar</button>
      </form>
      <div id="login-message" class="login-message"></div>
    </div>
  `;

  const form = document.getElementById('login-form');
  const message = document.getElementById('login-message');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    if (!email) return;
    const button = form.querySelector('button');
    button.disabled = true;
    button.textContent = 'Enviando...';
    message.textContent = '';
    try {
      await sendMagicLink(email);
      message.textContent = `Link enviado para ${email} — confira sua caixa de entrada.`;
      message.classList.remove('error');
    } catch (err) {
      message.textContent = 'Não consegui enviar o link. Confira o e-mail e tente de novo.';
      message.classList.add('error');
      console.error(err);
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });
}
