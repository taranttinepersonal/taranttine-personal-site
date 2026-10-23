import { LAB_GROUPS, LABS } from '../../../app/js/lib/labs.js';

// Pedido (ou sugestão) de exames: escolhe os exames, imprime em A4 com a
// marca e/ou manda pelo WhatsApp com o preparo.
const PANELS = {
  padrao: ['glicemia', 'hba1c', 'insulina', 'ct', 'ldl', 'hdl', 'tg', 'tgo', 'tgp', 'ggt', 'creatinina', 'ureia', 'acido_urico', 'hemoglobina', 'ferritina', 'ferro', 'b12', 'vitd', 'tsh', 't4l', 'pcr'],
  basico: ['glicemia', 'hba1c', 'ct', 'ldl', 'hdl', 'tg', 'tgp', 'creatinina', 'hemoglobina', 'ferritina', 'vitd', 'tsh'],
};
const REQ_NAME = { hemoglobina: 'Hemograma completo', ct: 'Perfil lipídico (colesterol total e frações, triglicerídeos)', ldl: null, hdl: null, tg: null };
const PREPARO = [
  'Jejum de 8 horas (água liberada) para glicemia e insulina. Siga a orientação do laboratório para os demais.',
  'Evite treino intenso e bebida alcoólica nas 24 horas antes da coleta.',
  'Se você usa creatina, avise o laboratório e o seu médico: ela pode aumentar a creatinina sem indicar problema nos rins.',
  'Leve a lista dos remédios e suplementos que usa. Biotina em dose alta pode alterar exames de tireoide: pergunte ao laboratório se precisa suspender antes.',
];

export function mountLabRequest(el, { nome, phone }) {
  const sel = new Set(PANELS.padrao);
  let titulo = 'Sugestão de exames';
  let assinatura = 'Taranttine Junior · Personal Trainer · Nutrição';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const items = () => {
    const out = [];
    LABS.forEach(l => {
      if (!sel.has(l.code)) return;
      const n = l.code in REQ_NAME ? REQ_NAME[l.code] : l.nome;
      if (n) out.push(n);
      else if (['ldl', 'hdl', 'tg'].includes(l.code) && !sel.has('ct')) out.push(l.nome);
    });
    return out;
  };

  function render() {
    el.innerHTML = `<div class="admin-card">
      <div class="admin-section-title" style="margin-top:0;">📝 Pedido de exames</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="admin-btn" data-panel="padrao">Painel completo</button>
        <button class="admin-btn" data-panel="basico">Painel básico</button>
        <button class="admin-btn" data-panel="nenhum">Limpar</button>
      </div>
      ${LAB_GROUPS.map(([g, gname]) => `<div class="admin-row-sub" style="margin:8px 0 4px;text-transform:uppercase;letter-spacing:.06em;">${gname}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px 14px;">${LABS.filter(l => l.grupo === g).map(l => `<label style="font-size:13px;display:flex;gap:6px;align-items:center;cursor:pointer;"><input type="checkbox" data-req="${l.code}" ${sel.has(l.code) ? 'checked' : ''}>${esc(l.nome)}</label>`).join('')}</div>`).join('')}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-top:12px;">
        <label class="admin-row-sub" style="display:grid;gap:4px;">Título do documento<select id="rq-title">${['Sugestão de exames', 'Solicitação de exames'].map(t => `<option ${t === titulo ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="admin-row-sub" style="display:grid;gap:4px;">Assinatura<input id="rq-sign" value="${esc(assinatura)}"></label>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="admin-btn primary" id="rq-pdf">📄 Gerar PDF</button>
        <button class="admin-btn primary" id="rq-wa">💬 WhatsApp</button>
        <span class="admin-row-sub" style="align-self:center;">${items().length} exame(s)</span>
      </div></div>`;
  }
  render();

  el.addEventListener('change', (e) => {
    if (e.target.dataset.req) { e.target.checked ? sel.add(e.target.dataset.req) : sel.delete(e.target.dataset.req); render(); }
    if (e.target.id === 'rq-title') titulo = e.target.value;
  });
  el.addEventListener('input', (e) => { if (e.target.id === 'rq-sign') assinatura = e.target.value; });
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-panel]');
    if (p) { sel.clear(); (PANELS[p.dataset.panel] || []).forEach(c => sel.add(c)); render(); return; }
    if (e.target.id === 'rq-pdf') {
      const w = window.open('', '_blank');
      w.document.write(requestHtml({ nome, titulo, assinatura, exames: items(), logo: `${location.origin}/app/icons/icon-512.png` }));
      w.document.close();
      setTimeout(() => w.print(), 600);
    }
    if (e.target.id === 'rq-wa') {
      const first = String(nome || '').trim().split(/\s+/)[0] || '';
      const text = [`Oi, ${first}! 👊`, '', `Segue a ${titulo.toLowerCase()} para acompanharmos o seu plano:`, '', ...items().map(x => `✅ ${x}`), '', '*Preparo:*', ...PREPARO.map(x => `• ${x}`), '', 'Quando sair o resultado, envie o PDF pelo app em Nutrição → 🧪 Meus exames.'].join('\n');
      const digits = String(phone || '').replace(/\D/g, '');
      const to = digits ? (digits.startsWith('55') ? digits : `55${digits}`) : '';
      window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank');
    }
  });
}

function requestHtml({ nome, titulo, assinatura, exames, logo }) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoje = new Date().toLocaleDateString('pt-BR');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)} · ${esc(nome)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:16mm}
@media screen{body{padding:16px 24px;max-width:820px;margin:0 auto}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,Arial,sans-serif;color:#17171a;font-size:11pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cover{background:radial-gradient(ellipse 70% 120% at 85% 20%,#2c2c31 0%,#121214 55%,#08080a 100%);color:#fff;border-radius:6px;padding:20px 24px;display:grid;grid-template-columns:72px 1fr auto;gap:18px;align-items:center}
.cover img{width:72px;height:72px;border-radius:50%;box-shadow:0 0 0 2px rgba(216,181,110,.7)}
.eyebrow{font-family:'Barlow Condensed';font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#d8b56e;font-size:9pt}
h1{font-family:'Barlow Condensed';font-weight:800;text-transform:uppercase;font-size:26pt;line-height:1;color:#e9eaec;margin:4px 0}
.who{font-size:10.5pt;color:#cfcfcf}.who b{color:#fff}
.date{text-align:right;font-size:9pt;color:#bdbdbd}.date b{display:block;color:#d8b56e;font-family:'Barlow Condensed';font-size:12pt}
h2{font-family:'Barlow Condensed';font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#b8924a;font-size:11pt;margin:18px 0 8px}
ol{padding-left:20px;display:grid;grid-template-columns:1fr 1fr;gap:6px 24px}
li{padding:2px 0;border-bottom:1px solid #eee}
.prep{background:#f6f4f0;border-left:3px solid #b8924a;padding:10px 14px;border-radius:0 6px 6px 0}
.prep ul{padding-left:16px;display:grid;gap:4px;font-size:10pt}
.sign{margin-top:48px;display:flex;justify-content:flex-end}
.sign div{border-top:1px solid #17171a;width:280px;padding-top:6px;text-align:center;font-size:10pt}
.foot{margin-top:24px;font-size:8.5pt;color:#8a877f}
</style></head><body>
<header class="cover"><img src="${esc(logo)}"><div><div class="eyebrow">Taranttine Personal · Consultoria</div><h1>${esc(titulo)}</h1><div class="who">Paciente: <b>${esc(nome)}</b></div></div><div class="date">Data<b>${hoje}</b></div></header>
<h2>Exames</h2>
<ol>${exames.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
<h2>Preparo</h2>
<div class="prep"><ul>${PREPARO.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
<div class="sign"><div>${esc(assinatura)}</div></div>
<p class="foot">Quando o resultado sair, envie o PDF pelo app (Nutrição → 🧪 Meus exames). Valores alterados devem ser avaliados também pelo seu médico.</p>
</body></html>`;
}
