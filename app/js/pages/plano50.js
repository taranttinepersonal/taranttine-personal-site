import { signOut } from '../auth.js';
import { CONSENT_SECTIONS, CONSENT_VERSION, saveConsent } from '../lib/consent.js';
import { TRAINER_WHATSAPP, submitOnboarding } from '../lib/plano50.js';

const PARQ = [
  ['parq_coracao', 'Algum médico já disse que você tem problema de coração ou pressão alta?'],
  ['parq_peito', 'Sente dor no peito quando faz atividade física?'],
  ['parq_tontura', 'Já perdeu o equilíbrio por tontura ou desmaiou nos últimos 12 meses?'],
  ['parq_articular', 'Tem algum problema ósseo ou articular que piora com exercício?'],
  ['parq_remedio', 'Toma remédio para pressão ou coração?'],
  ['parq_gestante', 'Está grávida ou teve bebê nos últimos 3 meses?'],
  ['parq_medico', 'Algum médico já recomendou não fazer exercício, ou só com supervisão?'],
];

function waLink(text) {
  return `https://wa.me/${TRAINER_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

function shell(inner) {
  return `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">Plano 50 Dias</h1>
    </div>
    <div class="main">${inner}</div>`;
}

function wireLogout() {
  const b = document.getElementById('p50-logout');
  if (b) b.addEventListener('click', () => signOut());
}

// ---------- Questionário do primeiro acesso ----------
export function renderPlano50Inicio(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = shell(`
    <div class="ex-card">
      <div class="ex-name" style="margin-bottom:6px;">Vamos montar o seu treino</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.5;">
        Responda com calma, são 2 minutos. Com isso o app entrega a ficha certa pra você.
      </div>
    </div>

    <div class="ex-card">
      <label class="form-label">Onde você vai treinar?</label>
      <select id="p50-local" class="load-input" style="text-align:left;margin-bottom:12px;">
        <option value="">Escolha...</option>
        <option value="academia">Academia</option>
        <option value="casa">Em casa (só peso do corpo e elástico)</option>
      </select>
      <label class="form-label">Qual o seu nível hoje?</label>
      <select id="p50-nivel" class="load-input" style="text-align:left;margin-bottom:6px;">
        <option value="">Escolha...</option>
        <option value="iniciante">Iniciante — treino há menos de 6 meses, ou estou voltando agora</option>
        <option value="intermediario">Intermediário — treino com regularidade há 6 meses a 2 anos</option>
        <option value="avancado">Avançado — treino firme há mais de 2 anos e conheço bem os exercícios</option>
      </select>
      <div id="p50-nivel-aviso" style="font-size:11.5px;color:var(--faint);margin-bottom:12px;display:none;">
        Em casa, o nível avançado recebe o modelo intermediário (os mais difíceis precisam de equipamento).
      </div>
      <label class="form-label">Seu principal objetivo</label>
      <input id="p50-objetivo" class="load-input" style="text-align:left;margin-bottom:12px;" placeholder="Ex.: ganhar massa, emagrecer, ter constância">
      <label class="form-label">Data de nascimento</label>
      <input id="p50-nasc" type="date" class="load-input" style="text-align:left;margin-bottom:12px;">
      <label class="form-label">Sexo</label>
      <select id="p50-sexo" class="load-input" style="text-align:left;">
        <option value="">Prefiro não informar</option>
        <option value="F">Feminino</option>
        <option value="M">Masculino</option>
      </select>
    </div>

    <div class="ex-card">
      <div class="ex-name" style="margin-bottom:8px;">Sua saúde</div>
      <div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">Marque <b>sim</b> só se a pergunta se aplica a você.</div>
      ${PARQ.map(([k, q]) => `
        <label class="tm-check" style="align-items:flex-start;"><input type="checkbox" data-parq="${k}"> <span>${q}</span></label>
      `).join('')}
      <label class="form-label" style="margin-top:12px;">Dores ou lesões que você tem hoje</label>
      <textarea id="p50-lesoes" class="load-input" style="text-align:left;min-height:64px;margin-bottom:10px;" placeholder="Ex.: dor no joelho direito, hérnia de disco... (ou deixe em branco)"></textarea>
      <label class="form-label">Intensidade dessa dor (0 = sem dor · 10 = máxima)</label>
      <input id="p50-dor" type="number" min="0" max="10" class="load-input" style="text-align:left;margin-bottom:10px;" value="0">
      <label class="form-label">Remédios que usa (opcional)</label>
      <input id="p50-med" class="load-input" style="text-align:left;" placeholder="Nenhum">
    </div>

    <div class="ex-card">
      <div class="ex-name" style="margin-bottom:4px;">Seus dados</div>
      <div style="font-size:11.5px;color:var(--faint);margin-bottom:8px;">Termo de consentimento · versão ${CONSENT_VERSION}</div>
      ${CONSENT_SECTIONS.slice(0, 5).map(([t, txt]) => `<div class="tm-sec"><b>${t}</b><p>${txt}</p></div>`).join('')}
      <label class="tm-check" style="margin-top:8px;"><input type="checkbox" id="p50-consent"> <span><b>Autorizo</b> o uso dos meus dados de saúde para montar e acompanhar o meu treino, como descrito acima. <em>(obrigatório)</em></span></label>
      <button class="send-btn" id="p50-send" style="margin-top:12px;">Receber meu treino</button>
      <div class="login-message" id="p50-msg"></div>
      <button class="logout-link" id="p50-logout" style="margin-top:12px;">Sair</button>
    </div>
  `);
  wireLogout();

  const nivel = document.getElementById('p50-nivel');
  const local = document.getElementById('p50-local');
  const aviso = document.getElementById('p50-nivel-aviso');
  const syncAviso = () => { aviso.style.display = local.value === 'casa' && nivel.value === 'avancado' ? 'block' : 'none'; };
  nivel.addEventListener('change', syncAviso);
  local.addEventListener('change', syncAviso);

  document.getElementById('p50-send').addEventListener('click', async () => {
    const msg = document.getElementById('p50-msg');
    const btn = document.getElementById('p50-send');
    msg.classList.add('error');
    if (!local.value || !nivel.value) { msg.textContent = 'Escolha onde vai treinar e o seu nível.'; return; }
    if (!document.getElementById('p50-consent').checked) { msg.textContent = 'Para receber o treino, é preciso autorizar o uso dos dados de saúde.'; return; }
    const payload = {
      local: local.value,
      nivel: nivel.value,
      objetivo: document.getElementById('p50-objetivo').value.trim(),
      nascimento: document.getElementById('p50-nasc').value,
      sexo: document.getElementById('p50-sexo').value,
      lesoes: document.getElementById('p50-lesoes').value.trim(),
      dor: Number(document.getElementById('p50-dor').value) || 0,
      medicamentos: document.getElementById('p50-med').value.trim(),
      consentimento: true,
    };
    document.querySelectorAll('[data-parq]').forEach((c) => { payload[c.dataset.parq] = c.checked; });

    btn.disabled = true; btn.textContent = 'Montando o seu treino...'; msg.textContent = '';
    try {
      await saveConsent(session.user.id, { usoIa: false, usoIaExames: false });
      const result = await submitOnboarding(payload);
      if (result.status === 'hold') { renderPlano50Hold(); return; }
      window.location.hash = '/treino';
    } catch (err) {
      console.error('plano50 onboarding failed', err);
      msg.textContent = err.message || 'Não consegui enviar agora. Confira a internet e tente de novo.';
      btn.disabled = false; btn.textContent = 'Receber meu treino';
    }
  });
}

// ---------- Triagem positiva: espera o treinador ----------
export function renderPlano50Hold() {
  const root = document.getElementById('app-root');
  root.innerHTML = shell(`
    <div class="ex-card">
      <div class="ex-name" style="margin-bottom:8px;">Recebi as suas respostas</div>
      <div style="font-size:13.5px;line-height:1.6;">
        Pelo que você marcou na parte de saúde, antes de liberar o seu treino eu preciso conversar com você, pra montar tudo com segurança.<br><br>
        Me chame no WhatsApp que a gente resolve rápido.
      </div>
      <a class="send-btn" style="display:block;text-align:center;text-decoration:none;margin-top:14px;" href="${waLink('Oi! Sou do Plano 50 Dias e preciso conversar sobre a minha saúde antes de começar o treino.')}">Falar no WhatsApp</a>
      <button class="logout-link" id="p50-logout" style="margin-top:12px;">Sair</button>
    </div>`);
  wireLogout();
}

// ---------- Fim dos 50 dias (ou acesso encerrado) ----------
export function renderPlano50Expirado() {
  const root = document.getElementById('app-root');
  root.innerHTML = shell(`
    <div class="ex-card">
      <div class="ex-name" style="margin-bottom:8px;">O seu Plano de 50 dias terminou</div>
      <div style="font-size:13.5px;line-height:1.6;">
        Obrigado por treinar comigo! Se você quer continuar evoluindo, o próximo passo é virar <b>aluno com acompanhamento</b>:
        treino pensado pra você, ajustes, e devolutiva a cada 4 semanas.<br><br>
        Me chame no WhatsApp e eu te explico como funciona.
      </div>
      <a class="send-btn" style="display:block;text-align:center;text-decoration:none;margin-top:14px;" href="${waLink('Oi! Terminei o Plano 50 Dias e quero continuar como aluno.')}">Quero continuar como aluno</a>
      <button class="logout-link" id="p50-logout" style="margin-top:12px;">Sair</button>
    </div>`);
  wireLogout();
}
