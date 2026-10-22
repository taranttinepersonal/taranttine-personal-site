// Saídas do plano alimentar: medida caseira, texto de WhatsApp e o
// documento de impressão (PDF) no layout aprovado. Recebe sempre o `plan`
// já montado (fotografia salva em nutrition_plans).

// Medidas caseiras aproximadas, só para alimentos de porção bem definida.
// [gramas por medida, singular, plural]
const MEASURES = {
  53: [50, 'unidade', 'unidades'], 52: [25, 'fatia', 'fatias'], 488: [50, 'unidade', 'unidades'],
  461: [30, 'fatia média', 'fatias médias'], 182: [90, 'unidade média', 'unidades médias'],
  222: [130, 'unidade média', 'unidades médias'], 214: [150, 'unidade média', 'unidades médias'],
  589: [5, 'unidade', 'unidades'], 3: [25, 'colher de sopa', 'colheres de sopa'],
  1: [25, 'colher de sopa', 'colheres de sopa'], 260: [5, 'colher de chá', 'colheres de chá'],
  7: [10, 'colher de sopa', 'colheres de sopa'], 507: [15, 'colher de sopa', 'colheres de sopa'],
  456: [10, 'colher de sopa', 'colheres de sopa'], 448: [170, 'pote', 'potes'], 594: [10, 'colher de sopa', 'colheres de sopa'],
};

export function measureText(id, g) {
  const m = MEASURES[id];
  if (!m || !g) return '';
  const n = Math.round((g / m[0]) * 2) / 2;
  if (n <= 0) return '';
  const num = String(n).replace('.', ',');
  return `≈ ${num} ${n > 1 ? m[2] : m[1]}`;
}

const GOAL_LABEL = { emagrecimento: 'emagrecimento', manutencao: 'manutenção', ganho_de_massa: 'ganho de massa muscular' };
export function goalLabel(g) { return GOAL_LABEL[g] || g || ''; }

function fmtBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function n0(x) { return Math.round(x || 0).toLocaleString('pt-BR'); }

export function planToWhatsApp(plan) {
  const lines = [];
  lines.push(`*Plano alimentar · ${plan.cliente.nome}*`);
  lines.push(`✅ Meta do dia: ${n0(plan.meta.kcal)} kcal · P ${n0(plan.meta.prot)} g · C ${n0(plan.meta.carb)} g · G ${n0(plan.meta.gord)} g`);
  if (plan.agua_l) lines.push(`💧 Água: ${String(plan.agua_l).replace('.', ',')} L por dia`);
  lines.push('');
  plan.refeicoes.forEach(r => {
    lines.push(`*${r.hora} · ${r.nome}*`);
    r.itens.forEach(i => lines.push(`✅ ${i.nome}: ${i.livre ? 'à vontade' : `${i.g} g`}${i.medida ? ` (${i.medida})` : ''}`));
    r.trocas.forEach(t => lines.push(`   ↔ ${t.de} pode trocar por: ${t.opcoes.map(o => `${o.nome} ${o.g} g`).join(' · ')}`));
    lines.push('');
  });
  if (plan.orientacoes?.length) {
    lines.push('*Orientações*');
    plan.orientacoes.forEach(o => lines.push(`✅ ${o}`));
    lines.push('');
  }
  if (plan.retorno) lines.push(`📅 Próximo retorno: ${fmtBR(plan.retorno)}`);
  lines.push('📲 Seu plano completo também está no app: https://taranttinepersonal.netlify.app/app/');
  return lines.join('\n');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function planPrintHtml(plan, logoUrl) {
  const m = plan.meta;
  const totalMacroKcal = (m.prot * 4 + m.carb * 4 + m.gord * 9) || 1;
  const pct = x => Math.round(x / totalMacroKcal * 100);
  const meals = plan.refeicoes.map(r => `
    <section class="meal"><div class="mh"><span class="time">${esc(r.hora)}</span><h3>${esc(r.nome)}</h3><span class="mac">${n0(r.kcal)} kcal · P ${n0(r.prot)} g · C ${n0(r.carb)} g · G ${n0(r.gord)} g</span></div>
    <table><thead><tr><th>Alimento</th><th>Quantidade</th><th>Medida caseira</th></tr></thead><tbody>
    ${r.itens.map(i => `<tr><td>${esc(i.nome)}</td><td class="q">${i.livre ? 'à vontade' : `${i.g} g`}</td><td class="m">${esc(i.medida || '—')}</td></tr>`).join('')}
    </tbody></table>
    ${r.trocas.length ? `<div class="subs"><div class="st">Pode trocar por</div><ul>${r.trocas.map(t => `<li><b>${esc(t.de)}</b><span>→ ${esc(t.opcoes.map(o => `${o.nome} ${o.g} g`).join(' · '))}</span></li>`).join('')}</ul></div>` : ''}
    </section>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano alimentar · ${esc(plan.cliente.nome)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm 14mm 18mm;@bottom-left{content:'Taranttine Personal · Treino e nutrição · seu plano também está no app';font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#8a877f}@bottom-right{content:'Página ' counter(page) ' de ' counter(pages);font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#b8924a}}
:root{--ink:#17171a;--chumbo:#2b2b30;--muted:#6f6c66;--line:#e3e0da;--soft:#f6f4f0;--gold:#b8924a;--gold2:#d8b56e}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,Arial,sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
.cover{background:radial-gradient(ellipse 70% 120% at 85% 20%,#2c2c31 0%,#121214 55%,#08080a 100%);color:#fff;border-radius:6px;padding:22px 26px;display:grid;grid-template-columns:86px 1fr auto;gap:20px;align-items:center}
.cover img{width:86px;height:86px;border-radius:50%;box-shadow:0 0 0 2px rgba(216,181,110,.7)}
.eyebrow{font-family:'Barlow Condensed';font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--gold2);font-size:9pt}
.cover h1{font-family:'Barlow Condensed';font-weight:800;text-transform:uppercase;font-size:30pt;line-height:1;color:#e9eaec;margin:4px 0}
.cover .who{font-size:10.5pt;color:#cfcfcf}.cover .who b{color:#fff}
.date{text-align:right;font-size:9pt;color:#bdbdbd;line-height:1.6}.date b{color:var(--gold2);font-family:'Barlow Condensed';font-size:11pt;letter-spacing:.06em}
.summary{display:grid;grid-template-columns:1.1fr 2fr;gap:14px;margin:14px 0 6px}
.goal,.macros{border:1px solid var(--line);border-radius:6px;padding:12px 14px;display:grid;gap:6px;align-content:start}
.lbl{font-family:'Barlow Condensed';font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);font-size:8.5pt}
.kcal{font-family:'Barlow Condensed';font-weight:800;font-size:30pt;line-height:1}.kcal small{font-size:12pt;color:var(--muted);font-weight:600}
.mrow{display:grid;grid-template-columns:82px 1fr 64px;gap:10px;align-items:center;font-size:9.5pt}
.bar{height:8px;border-radius:9px;background:var(--soft);overflow:hidden}.bar i{display:block;height:100%;border-radius:9px;background:linear-gradient(90deg,var(--gold),var(--gold2))}
.mrow b{text-align:right}
.howto{background:var(--soft);border-left:3px solid var(--gold);border-radius:0 6px 6px 0;padding:10px 14px;font-size:9.5pt;color:#3c3a36;margin:8px 0 16px}
.meal{break-inside:avoid;border:1px solid var(--line);border-radius:6px;margin-bottom:12px;overflow:hidden}
.mh{background:var(--chumbo);color:#fff;display:flex;align-items:baseline;gap:12px;padding:8px 14px}
.time{font-family:'Barlow Condensed';font-weight:800;color:var(--gold2);font-size:13pt}
.mh h3{font-family:'Barlow Condensed';font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:13pt;flex:1}
.mac{font-size:8.5pt;color:#c9c9c9}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;padding:7px 14px 4px;border-bottom:1px solid var(--line)}
td{padding:6px 14px;border-bottom:1px solid #f0ede7}td.q{font-weight:700;white-space:nowrap;width:90px}td.m{color:var(--muted);width:170px}
tr:last-child td{border-bottom:0}
.subs{background:var(--soft);padding:8px 14px 10px;border-top:1px solid var(--line)}
.st{font-family:'Barlow Condensed';font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-size:8.5pt;margin-bottom:3px}
.subs ul{list-style:none;display:grid;gap:2px;font-size:9pt}.subs li b{font-weight:600;margin-right:6px}.subs li span{color:#4b4943}
.orient{break-inside:avoid;margin-top:16px;border:1px solid var(--line);border-radius:6px;padding:12px 14px}
.orient h4{font-family:'Barlow Condensed';font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:12pt;margin-bottom:6px}
.orient ul{padding-left:16px;display:grid;gap:4px;font-size:9.5pt}
.sign{break-inside:avoid;margin-top:22px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.sign .line{border-top:1px solid var(--ink);width:260px;padding-top:6px;font-size:9pt;text-align:center}.sign .line b{display:block;font-size:10pt}
.next{font-size:9.5pt}.next b{font-family:'Barlow Condensed';font-size:13pt;color:var(--gold)}
</style></head><body>
<header class="cover"><img src="${esc(logoUrl)}"><div><div class="eyebrow">Taranttine Personal · Consultoria</div><h1>Plano alimentar</h1>
<div class="who"><b>${esc(plan.cliente.nome)}</b>${plan.cliente.peso ? ` · ${String(plan.cliente.peso).replace('.', ',')} kg` : ''}${plan.cliente.objetivo ? ` · objetivo: ${esc(goalLabel(plan.cliente.objetivo))}` : ''}</div></div>
<div class="date">Entregue em<br><b>${fmtBR(plan.entregue_em)}</b><br>Válido até o retorno</div></header>
<div class="summary"><div class="goal"><span class="lbl">Sua meta diária</span><span class="kcal">${n0(m.kcal)} <small>kcal</small></span>
<span style="font-size:9pt;color:var(--muted)">${plan.refeicoes.length} refeições${plan.agua_l ? ` · água: ${String(plan.agua_l).replace('.', ',')} L por dia` : ''}</span></div>
<div class="macros"><span class="lbl">Macronutrientes do dia</span>
<div class="mrow"><span>Proteína</span><div class="bar"><i style="width:${pct(m.prot * 4)}%"></i></div><b>${n0(m.prot)} g</b></div>
<div class="mrow"><span>Carboidrato</span><div class="bar"><i style="width:${pct(m.carb * 4)}%"></i></div><b>${n0(m.carb)} g</b></div>
<div class="mrow"><span>Gordura</span><div class="bar"><i style="width:${pct(m.gord * 9)}%"></i></div><b>${n0(m.gord)} g</b></div></div></div>
<div class="howto"><b>Como usar:</b> siga os horários como referência e não como regra rígida. Pese os alimentos nas primeiras semanas; depois a medida caseira basta. Sempre que quiser variar, use as opções de <b>"Pode trocar por"</b>: elas já estão calculadas na quantidade certa.</div>
${meals}
${plan.orientacoes?.length ? `<div class="orient"><h4>Orientações</h4><ul>${plan.orientacoes.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
<div class="sign"><div class="next">${plan.retorno ? `Próximo retorno<br><b>${fmtBR(plan.retorno)}</b>` : ''}</div><div class="line"><b>Taranttine Junior</b>${esc(plan.profissional || 'Personal Trainer · Nutrição')}</div></div>
</body></html>`;
}
