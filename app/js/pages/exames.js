import { signOut } from '../auth.js';
import { supabase } from '../supabaseClient.js';
import { requireConsent } from './termo.js';
import { mountLabs, ageFrom } from '../lib/labsUi.js';

export async function renderExames(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando...</div>`;
  const clientId = session.user.id;
  if (!(await requireConsent(clientId, '/exames'))) return;
  const { data: prof } = await supabase.from('profiles').select('birth_date, sexo').eq('id', clientId).maybeSingle();

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">🧪 Meus exames</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-back">← Voltar para Nutrição</button>
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main"><div id="labs-root"></div></div>`;
  document.getElementById('nav-back').addEventListener('click', () => { window.location.hash = '/nutricao'; });
  document.getElementById('logout-btn').addEventListener('click', () => signOut());
  mountLabs(document.getElementById('labs-root'), { clientId, idade: ageFrom(prof?.birth_date), sexo: prof?.sexo, mode: 'app' });
}
