import { getSession } from '../../../app/js/auth.js';
import { navigate } from '../../../app/js/router.js';

export function renderNewClient(main) {
  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">Novo Cliente</div>
      <a href="#/clientes" class="admin-btn">← Voltar</a>
    </div>

    <div class="admin-card admin-form">
      <label>Nome completo</label>
      <input type="text" id="nc-name" placeholder="Nome do aluno">
      <label>E-mail (login do cliente)</label>
      <input type="email" id="nc-email" placeholder="email@exemplo.com">
      <label>Telefone</label>
      <input type="text" id="nc-phone" placeholder="Ex: 67999999999">
      <label>Data de nascimento</label>
      <input type="date" id="nc-birth">
      <button class="admin-btn primary" id="nc-save" style="margin-top:12px;">Criar cliente</button>
      <div class="admin-msg" id="nc-msg"></div>
    </div>
  `;

  document.getElementById('nc-save').addEventListener('click', async () => {
    const msg = document.getElementById('nc-msg');
    const btn = document.getElementById('nc-save');
    const full_name = document.getElementById('nc-name').value.trim();
    const email = document.getElementById('nc-email').value.trim();
    const phone = document.getElementById('nc-phone').value.trim();
    const birth_date = document.getElementById('nc-birth').value;

    if (!full_name || !email) {
      msg.textContent = 'Preencha nome e e-mail.';
      msg.classList.add('error');
      return;
    }

    btn.disabled = true;
    msg.textContent = '';
    msg.classList.remove('error');

    try {
      const session = await getSession();
      const res = await fetch('/.netlify/functions/create-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ full_name, email, phone, birth_date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar cliente');

      navigate(`/cliente/${data.id}/avaliacao`);
    } catch (err) {
      msg.textContent = 'Erro: ' + err.message;
      msg.classList.add('error');
      btn.disabled = false;
    }
  });
}
