import { signOut } from '../auth.js';
import { ETAPA1, renderBlocks, collectBlocks, fetchNutritionAnamneses, saveNutritionAnamnese } from '../lib/nutritionAnamnese.js';

export async function renderAnamneseNutri(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando...</div>`;

  const clientId = session.user.id;
  const { etapa1 } = await fetchNutritionAnamneses(clientId);

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">📝 Anamnese nutricional</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-nutricao">← Voltar para Nutrição</button>
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main">
      <div class="ex-card">
        <div class="ex-name" style="margin-bottom:6px;">Antes da consulta</div>
        <div style="font-size:13px;color:var(--muted);line-height:1.5;">
          Responda com calma, do jeito que é a sua rotina hoje. Não existe resposta certa ou errada: quanto mais real, melhor o seu plano.
          ${etapa1 ? `<br><br>Você respondeu em ${formatDate(etapa1.recorded_at)}. Pode atualizar e salvar de novo.` : ''}
        </div>
      </div>
      ${renderBlocks(ETAPA1, 'na1', etapa1?.respostas || {}, {
        blockClass: 'ex-card nf-block',
        titleClass: 'ex-name nf-title',
        hintClass: 'nf-hint',
        labelClass: 'form-label nf-label',
        inputClass: 'nf-input',
      })}
      <button class="send-btn" id="save-na1">Enviar respostas</button>
      <div class="login-message" id="na1-msg"></div>
    </div>
  `;

  document.getElementById('nav-nutricao').addEventListener('click', () => { window.location.hash = '/nutricao'; });
  document.getElementById('logout-btn').addEventListener('click', () => signOut());

  const btn = document.getElementById('save-na1');
  const msg = document.getElementById('na1-msg');
  btn.addEventListener('click', async () => {
    const respostas = collectBlocks(ETAPA1, 'na1');
    if (Object.keys(respostas).length < 5) {
      msg.textContent = 'Responda pelo menos a rotina e o que comeu ontem antes de enviar.';
      return;
    }
    btn.disabled = true;
    msg.textContent = 'Enviando...';
    try {
      await saveNutritionAnamnese(clientId, 1, respostas);
      msg.textContent = 'Respostas enviadas! O Taranttine vai usar na sua consulta.';
      setTimeout(() => { window.location.hash = '/nutricao'; }, 1200);
    } catch (e) {
      console.error('save etapa 1 failed', e);
      msg.textContent = 'Não consegui enviar. Confira a internet e tente de novo.';
      btn.disabled = false;
    }
  });
}

function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('pt-BR');
}
