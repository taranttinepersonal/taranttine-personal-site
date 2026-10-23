import { signOut } from '../auth.js';
import { fetchVisibleDiet, getDietFileUrl } from '../lib/diet.js';
import { fetchEntriesForDate, saveEntry } from '../lib/nutrition.js';

export async function renderDiet(session) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div class="loading-state">Carregando...</div>`;

  const clientId = session.user.id;
  const diet = await fetchVisibleDiet(clientId);

  root.innerHTML = `
    <div class="hero">
      <div class="brand-name font-display">Taranttine</div>
      <div class="brand-sub">Personal</div>
      <h1 class="font-display" style="font-size:22px;text-transform:uppercase;color:var(--white);margin-top:10px;">🍎 ${diet?.kind === 'plan' ? 'Seu plano' : 'Dieta'}</h1>
    </div>
    <div class="top-bar">
      <button class="logout-link" id="nav-treino">🏋 Treino</button>
      <button class="logout-link" id="nav-anamnese" style="margin-left:12px;">📋 Anamnese</button>
      <button class="logout-link" id="nav-progresso" style="margin-left:12px;">📈 Evolução</button>
      <button class="logout-link" id="nav-indicacao" style="margin-left:12px;">🎁 Indicação</button>
      <button class="logout-link" id="nav-nutricao" style="margin-left:12px;">🍽 Nutrição</button>
      <button class="logout-link" id="logout-btn" style="margin-left:12px;">Sair</button>
    </div>
    <div class="main" id="diet-main">
      ${!diet ? '<div class="loading-state">Nenhum plano alimentar disponível ainda.</div>' : diet.kind === 'legacy' ? renderDietCard(diet) : ''}
    </div>
  `;

  document.getElementById('logout-btn').addEventListener('click', () => signOut());
  document.getElementById('nav-treino').addEventListener('click', () => { window.location.hash = '/treino'; });
  document.getElementById('nav-anamnese').addEventListener('click', () => { window.location.hash = '/anamnese'; });
  document.getElementById('nav-progresso').addEventListener('click', () => { window.location.hash = '/progresso'; });
  document.getElementById('nav-indicacao').addEventListener('click', () => { window.location.hash = '/indicacao'; });
  document.getElementById('nav-nutricao').addEventListener('click', () => { window.location.hash = '/nutricao'; });

  if (diet?.kind === 'plan') {
    renderPlan(document.getElementById('diet-main'), clientId, diet.plan, session);
    return;
  }

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

// ---- Plano estruturado (tela futurista) ----

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function store(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* conveniência local */ }
}

function minutesOf(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
}

async function renderPlan(host, clientId, plan, session) {
  const day = todayISO();
  const swapsKey = `plano-trocas-${clientId}-${day}`;
  const doneKey = `plano-feitas-${clientId}-${day}`;
  let swaps = load(swapsKey, {});
  let done = load(doneKey, []);
  let openMeal = null;
  let entries = await fetchEntriesForDate(clientId, day);

  // Aplica as trocas que o aluno escolheu hoje sobre a refeição do plano.
  function mealView(r, mi) {
    const chosen = swaps[mi] || {};
    const itens = r.itens.map((it, ii) => {
      const t = r.trocas.find(x => x.item === ii);
      const opt = t && chosen[ii] != null ? t.opcoes[chosen[ii]] : null;
      return opt ? { ...it, nome: opt.nome, g: opt.g, qtd: null, medida: '', kcal: opt.kcal, prot: opt.prot, carb: opt.carb, gord: opt.gord, trocado: true } : it;
    });
    const tot = itens.reduce((a, i) => ({ kcal: a.kcal + (i.kcal || 0), prot: a.prot + (i.prot || 0), carb: a.carb + (i.carb || 0), gord: a.gord + (i.gord || 0) }), { kcal: 0, prot: 0, carb: 0, gord: 0 });
    return { ...r, itens, tot };
  }

  function nextMealIndex() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const pending = plan.refeicoes.map((r, i) => i).filter(i => !done.includes(i));
    return pending.find(i => minutesOf(plan.refeicoes[i].hora) + 60 >= mins) ?? pending[0] ?? null;
  }

  function render() {
    const consumed = entries.reduce((a, e) => ({
      kcal: a.kcal + (Number(e.calories) || 0), prot: a.prot + (Number(e.protein_g) || 0),
      carb: a.carb + (Number(e.carb_g) || 0), gord: a.gord + (Number(e.fat_g) || 0),
    }), { kcal: 0, prot: 0, carb: 0, gord: 0 });
    const m = plan.meta;
    const ni = nextMealIndex();

    if (openMeal != null) {
      host.innerHTML = `<div class="pl">${renderMealDetail(openMeal)}</div>`;
      return;
    }

    const next = ni != null ? mealView(plan.refeicoes[ni], ni) : null;
    host.innerHTML = `
      <div class="pl">
        <div class="pl-glass pl-ring">
          ${ring(Math.min(1, consumed.kcal / (m.kcal || 1)))}
          <div class="pl-ring-c"><b>${fmt(consumed.kcal)}</b><span>de ${fmt(m.kcal)} kcal</span></div>
          <div class="pl-macros">
            ${macroBar('Proteína', consumed.prot, m.prot, '#f0d08a')}
            ${macroBar('Carbo', consumed.carb, m.carb, '#c9a25a')}
            ${macroBar('Gordura', consumed.gord, m.gord, '#00B894')}
          </div>
        </div>
        ${next ? `
          <div class="pl-glass pl-next">
            <div class="pl-lbl">Próxima refeição · ${untilText(next.hora)}</div>
            <h3>${esc(next.hora)} · ${esc(next.nome)}</h3>
            <div class="pl-meta">${fmt(next.tot.kcal)} kcal · P ${fmt(next.tot.prot)} g · C ${fmt(next.tot.carb)} g · G ${fmt(next.tot.gord)} g</div>
            <div class="pl-items">${next.itens.map(i => `<div class="pl-it"><b>${esc(i.nome)}</b><span>${i.livre ? 'à vontade' : `${esc(i.qtd || `${i.g} g`)}${i.medida ? ` · ${esc(i.medida.replace('≈ ', ''))}` : ''}`}</span></div>`).join('')}</div>
            <div class="pl-btns"><button class="pl-b1" data-eat="${ni}">✓ Comi esta refeição</button><button class="pl-b2" data-open="${ni}">⇄ Trocar</button></div>
          </div>` : `<div class="pl-glass pl-next"><div class="pl-lbl">Dia completo</div><h3>Todas as refeições feitas ✅</h3></div>`}
        <div class="pl-tl">
          ${plan.refeicoes.map((r, i) => {
            const v = mealView(r, i);
            const cls = done.includes(i) ? 'done' : (i === ni ? 'now' : '');
            return `<button class="pl-ti ${cls}" data-open="${i}"><span class="pl-dot"></span><div><b>${esc(r.nome)}</b><span>${esc(r.hora)}${i === ni ? ' · agora' : ''}</span></div><em>${fmt(v.tot.kcal)}</em></button>`;
          }).join('')}
        </div>
        ${plan.suplementos?.length ? `<div class="pl-glass pl-orient"><div class="pl-lbl">Suplementação</div>${plan.suplementos.map(x => `<div class="pl-supp"><b>💊 ${esc(x.nome)}</b><span>${esc(x.dose)} · ${esc(x.horario)}</span></div>`).join('')}</div>` : ''}
        ${plan.orientacoes?.length ? `<div class="pl-glass pl-orient"><div class="pl-lbl">Orientações</div>${plan.orientacoes.map(o => `<p>✅ ${esc(o)}</p>`).join('')}</div>` : ''}
        <div class="pl-foot">${plan.agua_l ? `💧 Água: ${String(plan.agua_l).replace('.', ',')} L por dia` : ''}${plan.retorno ? ` · 📅 Retorno: ${fmtDate(plan.retorno)}` : ''}</div>
        <div class="login-message" id="pl-msg"></div>
      </div>
    `;
  }

  function renderMealDetail(mi) {
    const r = mealView(plan.refeicoes[mi], mi);
    const chosen = swaps[mi] || {};
    return `
      <div class="pl-hdr"><button class="pl-back" data-back>←</button><div class="pl-lbl">${esc(r.nome)} · ${esc(r.hora)}</div></div>
      <div class="pl-glass pl-hero"><h2>${esc(r.nome)}</h2>
        <div class="pl-pills"><div><b>${fmt(r.tot.kcal)}</b> kcal</div><div>P <b>${fmt(r.tot.prot)} g</b></div><div>C <b>${fmt(r.tot.carb)} g</b></div><div>G <b>${fmt(r.tot.gord)} g</b></div></div></div>
      ${r.itens.map((it, ii) => {
        const t = plan.refeicoes[mi].trocas.find(x => x.item === ii);
        const orig = plan.refeicoes[mi].itens[ii];
        return `
          <div class="pl-glass pl-food">
            <div class="pl-row"><b>${esc(it.nome)}</b><em class="${it.livre ? 'free' : ''}">${it.livre ? 'à vontade' : esc(it.qtd || `${it.g} g`)}</em></div>
            ${it.medida ? `<div class="pl-hm">${esc(it.medida)}</div>` : ''}
            ${t ? `<div class="pl-swap"><span class="k">Trocar por</span>
              <button class="${chosen[ii] == null ? 'sel' : ''}" data-swap="${mi}:${ii}:">${esc(orig.nome)} ${orig.g} g</button>
              ${t.opcoes.map((o, oi) => `<button class="${chosen[ii] === oi ? 'sel' : ''}" data-swap="${mi}:${ii}:${oi}">${esc(o.nome)} ${o.g} g</button>`).join('')}
            </div>` : ''}
          </div>`;
      }).join('')}
      <div class="pl-btns">${done.includes(mi) ? '<div class="pl-done">✅ Registrada hoje</div>' : `<button class="pl-b1" data-eat="${mi}">✓ Comi esta refeição</button>`}</div>
      <div class="login-message" id="pl-msg"></div>
    `;
  }

  host.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open != null) { openMeal = Number(b.dataset.open); render(); window.scrollTo(0, 0); return; }
    if (b.dataset.back != null) { openMeal = null; render(); return; }
    if (b.dataset.swap) {
      const [mi, ii, oi] = b.dataset.swap.split(':');
      swaps[mi] = swaps[mi] || {};
      if (oi === '') delete swaps[mi][ii]; else swaps[mi][ii] = Number(oi);
      store(swapsKey, swaps);
      render();
      return;
    }
    if (b.dataset.eat != null) {
      const mi = Number(b.dataset.eat);
      const r = mealView(plan.refeicoes[mi], mi);
      b.disabled = true;
      b.textContent = 'Registrando...';
      try {
        await saveEntry(clientId, {
          loggedAt: day, mealType: r.mealType || 'lanche',
          description: `Plano · ${r.nome}: ${r.itens.map(i => i.livre ? i.nome : `${i.nome} ${i.g} g`).join(', ')}`,
          calories: Math.round(r.tot.kcal), protein_g: Math.round(r.tot.prot), carb_g: Math.round(r.tot.carb), fat_g: Math.round(r.tot.gord),
          source: 'manual',
        });
        done = [...new Set([...done, mi])];
        store(doneKey, done);
        entries = await fetchEntriesForDate(clientId, day);
        openMeal = null;
        render();
      } catch (err) {
        console.error('registrar refeição do plano falhou', err);
        b.disabled = false;
        b.textContent = '✓ Comi esta refeição';
        const msg = document.getElementById('pl-msg');
        if (msg) msg.textContent = 'Não consegui registrar. Confira a internet e tente de novo.';
      }
    }
  });

  render();
}

function untilText(hora) {
  const now = new Date();
  const diff = minutesOf(hora) - (now.getHours() * 60 + now.getMinutes());
  if (diff <= 0) return 'agora';
  if (diff < 60) return `em ${diff} min`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return `em ${h}h${m ? String(m).padStart(2, '0') : ''}`;
}

function ring(pct) {
  const r = 56, C = 2 * Math.PI * r;
  return `<svg class="pl-ring-svg" width="132" height="132" viewBox="0 0 132 132" aria-hidden="true"><defs><linearGradient id="plg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f0d08a"/><stop offset="1" stop-color="#00B894"/></linearGradient></defs>
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>
    <circle cx="66" cy="66" r="${r}" fill="none" stroke="url(#plg)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C * pct).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 66 66)"/></svg>`;
}

function macroBar(label, val, goal, color) {
  const w = Math.min(100, Math.round((val / (goal || 1)) * 100));
  return `<div class="pl-mr"><div>${label}<b>${fmt(val)} / ${fmt(goal)} g</b></div><div class="pl-bar"><i style="width:${w}%;background:${color}"></i></div></div>`;
}

function fmt(x) { return Math.round(x || 0).toLocaleString('pt-BR'); }

function fmtDate(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

// ---- Plano antigo (texto/PDF) ----

function renderDietCard(diet) {
  return `
    <div class="ex-card">
      ${diet.title ? `<div class="ex-name" style="font-size:18px;margin-bottom:10px;">${esc(diet.title)}</div>` : ''}
      ${diet.content_text ? `<div style="white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--text);">${esc(diet.content_text)}</div>` : ''}
      ${diet.content_url ? `<button class="send-btn" id="diet-pdf-btn" data-path="${esc(diet.content_url)}" style="margin-top:16px;">📄 Ver arquivo PDF</button>` : ''}
    </div>
  `;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
