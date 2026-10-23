import { supabase } from '../../../app/js/supabaseClient.js';
import { mountLabs, ageFrom } from '../../../app/js/lib/labsUi.js';

// Exames do aluno no painel: mesma tela do app, com encaminhamentos.
export async function renderLabs(main, clientId) {
  main.innerHTML = `<div class="admin-empty">Carregando...</div>`;
  const { data: profile } = await supabase.from('profiles').select('full_name, birth_date, sexo').eq('id', clientId).single();
  main.innerHTML = `
    <div class="admin-header">
      <div class="admin-title">${esc(profile?.full_name || '')} · Exames</div>
      <a href="#/cliente/${clientId}/nutricao" class="admin-btn">← Nutrição</a>
    </div>
    ${profile?.birth_date && profile?.sexo ? '' : '<div class="admin-msg error" style="margin-bottom:12px;">Cadastre a data de nascimento e o sexo do aluno para calcular a filtração renal.</div>'}
    <div id="labs-root"></div>`;
  mountLabs(document.getElementById('labs-root'), { clientId, idade: ageFrom(profile?.birth_date), sexo: profile?.sexo, mode: 'admin' });
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
