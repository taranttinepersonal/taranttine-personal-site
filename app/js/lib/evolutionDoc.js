// Relatório de evolução do cliente presencial: calcula os números a partir do que o
// painel já guarda (cargas, fase do macrociclo, volume, composição) e monta o
// documento no mesmo layout do plano alimentar (planDoc.js). O MESMO HTML serve pra
// tela (iframe no painel) e pro PDF (impressão → "Salvar como PDF").
import { parseNum, fmt, weeklyVolume, bandFor, volumeStatus, LEVEL_BANDS } from './progression.js';
import { sumSkinfolds, calcBodyFat } from './skinfold.js';

// Explicações pro cliente, em linguagem simples. Fases personalizadas sem texto próprio
// caem num texto genérico montado com o RIR e o volume da fase.
export const PHASE_TEXT = {
  adaptacao: 'Fase de base: mais repetições, cargas moderadas e técnica em primeiro lugar. Você termina cada série com 3 a 4 repetições sobrando.',
  desenvolvimento: 'Fase de construção: a carga sobe aos poucos, dentro da faixa de repetições da ficha, deixando cerca de 2 repetições sobrando.',
  intensificacao: 'Fase de intensidade: menos repetições com cargas mais altas, chegando perto da falha (0 a 1 repetição sobrando).',
  deload: 'Fase de consolidação: cargas e volume mais leves pra assimilar o que foi construído e recuperar.',
};
function phaseText(phase) {
  return PHASE_TEXT[phase.key] || `Fase ${phase.label}: ${phase.rir || 'esforço controlado'}, volume ${String(phase.volume || '').toLowerCase()}.`.replace(', volume .', '.');
}

export const PERIODS = { inicio: 'Desde o início', 8: 'Últimas 8 semanas', 4: 'Últimas 4 semanas' };
const MEASURES = [['cintura', 'Cintura'], ['quadril', 'Quadril'], ['braco', 'Braço'], ['coxa', 'Coxa']];

// ---------- datas ----------
export function todayLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function fmtBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
function fmtShort(iso) { const [, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}`; }
const r1 = (x) => Math.round(x * 10) / 10;
const num = (x) => fmt(r1(x));
const sign = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');
// unidade colada no número só pro % (12,1%); kg e cm levam espaço
const withUnit = (x, unit) => `${num(x)}${unit === '%' ? '' : ' '}${unit}`;
const pctTxt = (p) => `${sign(p)}${fmt(Math.abs(r1(p)))}%`;

function ageAt(birthDate, onIso) {
  if (!birthDate) return null;
  const b = new Date(birthDate + 'T12:00:00'), o = new Date(onIso + 'T12:00:00');
  let a = o.getFullYear() - b.getFullYear();
  if (o.getMonth() < b.getMonth() || (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) a--;
  return a;
}

// ---------- modelo ----------

// d = resultado de loadPresencialClient(); extras = { phone, birthDate, sexo, progress[], skinfolds[] }
export function buildEvolution(d, extras = {}, { period = 'inicio', comment = '', today = todayLocal() } = {}) {
  const cutoff = period === 'inicio' ? null : addDays(today, -7 * Number(period));
  const inWindow = (iso) => !cutoff || String(iso).slice(0, 10) >= cutoff;

  // sessões: dias distintos com lançamento
  const dates = [...new Set(d.logs.filter(l => inWindow(l.logged_on)).map(l => l.logged_on))].sort();
  const sessoes = dates.length;
  const estimadas = d.logs.filter(l => inWindow(l.logged_on) && l.estimated).length;
  const span = dates.length ? Math.max(1, Math.ceil((dayDiff(dates[0], dates[dates.length - 1]) + 1) / 7)) : 0;

  // evolução de carga por exercício (semanas de deload aplicado não entram: queda planejada)
  const exercicios = [];
  for (const day of d.days) {
    for (const ex of day.exercises) {
      const pts = ex.history
        .filter(l => inWindow(l.logged_on) && (l.week_no == null || !d.deloadWeeks.has(l.week_no)))
        .map(l => ({ date: l.logged_on, value: parseNum(l.load_value) }))
        .filter(p => p.value != null && p.value > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (pts.length < 2) continue;
      const de = pts[0].value, para = pts[pts.length - 1].value;
      exercicios.push({ nome: ex.name, grupo: ex.muscle, dia: day.label, points: pts, sessoes: pts.length, de, para, pct: (para - de) / de * 100 });
    }
  }
  const evoluiram = exercicios.filter(e => e.pct > 0).length;
  const destaques = exercicios.filter(e => e.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const graficos = [...exercicios].sort((a, b) => b.sessoes - a.sessoes || b.pct - a.pct).slice(0, 6);

  // volume semanal prescrito por grupo (faixa só se o nível foi avaliado)
  const levelKey = d.level?.nivel_final && LEVEL_BANDS[d.level.nivel_final] ? d.level.nivel_final : null;
  const volume = weeklyVolume(d.days.flatMap(day => day.exercises.map(ex => ({ sets: ex.sets, muscle: ex.muscle }))))
    .map(v => { const band = levelKey ? bandFor(levelKey, v.muscle) : null; return { ...v, band, status: volumeStatus(v.sets, band) }; });

  return {
    cliente: { nome: d.profile.full_name, programa: d.program.title || '', nivel: levelKey ? LEVEL_BANDS[levelKey].label : '' },
    emitido_em: today,
    periodo: { chave: String(period), rotulo: PERIODS[period] || PERIODS.inicio, inicio: dates[0] || null, fim: dates[dates.length - 1] || null },
    fase: phaseModel(d),
    numeros: { sessoes, porSemana: span ? sessoes / span : 0, avaliados: exercicios.length, evoluiram, estimadas },
    destaques, graficos, exercicios, volume,
    composicao: composition(extras, cutoff),
    comentario: String(comment || '').trim(),
    profissional: 'Personal Trainer · Padel Coach',
  };
}

function phaseModel(d) {
  const info = d.info;
  if (!info) return null;
  const next = d.phases[info.index + 1] || null;
  return {
    label: info.phase.label, semana: info.week, total: d.program.total_weeks, mesociclo: info.mesociclo,
    rir: info.phase.rir, volume: info.phase.volume, texto: phaseText(info.phase), isDeload: !!info.phase.isDeload,
    proxima: next ? { label: next.label, emSemanas: info.weeksLeft + 1, rir: next.rir, texto: phaseText(next) } : null,
  };
}

// Composição: % gordura por dobras (Jackson & Pollock) se houver; senão o % lançado no progresso.
function composition(extras, cutoff) {
  const inWin = (iso) => !cutoff || String(iso).slice(0, 10) >= cutoff;
  const prog = (extras.progress || []).filter(e => inWin(e.recorded_at)).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  const rows = [];
  const pair = (label, unit, vals, dec = true) => {
    const v = vals.filter(x => x.value != null);
    if (!v.length) return;
    const de = v.length > 1 ? v[0] : null, para = v[v.length - 1];
    rows.push({ label, unit, de: de?.value ?? null, para: para.value, deData: de?.date || null, paraData: para.date, dec });
  };

  pair('Peso', 'kg', prog.map(e => ({ value: e.weight_kg != null ? Number(e.weight_kg) : null, date: e.recorded_at })));

  const sk = (extras.skinfolds || []).filter(a => inWin(a.recorded_at)).sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
    .map(a => {
      const bf = calcBodyFat({ sexo: a.sexo, age: ageAt(extras.birthDate, a.recorded_at), sum: sumSkinfolds(a) });
      return { value: bf ? bf.bodyFatPct : null, date: a.recorded_at };
    });
  const skOk = sk.filter(x => x.value != null).length >= 1;
  pair('% de gordura', '%', skOk ? sk : prog.map(e => ({ value: e.body_fat_pct != null ? Number(e.body_fat_pct) : null, date: e.recorded_at })));
  const fonte = skOk ? 'dobras cutâneas (Jackson & Pollock, 7 dobras)' : 'registros de acompanhamento';

  for (const [key, label] of MEASURES) {
    pair(label, 'cm', prog.map(e => ({ value: e.measurements?.[key] != null ? Number(e.measurements[key]) : null, date: e.recorded_at })));
  }
  return rows.length ? { rows, fonte } : null;
}

// ---------- texto pro WhatsApp ----------

export function evolutionToWhatsApp(m) {
  const L = [];
  L.push(`*Evolução de treino · ${m.cliente.nome}*`);
  if (m.fase) L.push(`📅 Semana ${m.fase.semana} de ${m.fase.total} · fase ${m.fase.label}`);
  L.push(`✅ ${m.numeros.sessoes} treino${m.numeros.sessoes === 1 ? '' : 's'} registrado${m.numeros.sessoes === 1 ? '' : 's'} (${m.periodo.rotulo.toLowerCase()})`);
  if (m.numeros.avaliados) L.push(`✅ ${m.numeros.evoluiram} de ${m.numeros.avaliados} exercícios com carga maior que no início`);
  m.destaques.forEach((e, i) => L.push(`${i === 0 ? '🏆' : '✅'} ${e.nome}: ${num(e.de)} → ${num(e.para)} kg (${pctTxt(e.pct)})`));
  if (m.composicao) m.composicao.rows.filter(r => r.de != null).forEach(r => L.push(`📏 ${r.label}: ${withUnit(r.de, r.unit)} → ${withUnit(r.para, r.unit)}`));
  if (m.comentario) { L.push(''); L.push(m.comentario); }
  L.push('');
  L.push('Segue o relatório completo em PDF. Qualquer dúvida, me chama! 💪');
  return L.join('\n');
}

// ---------- documento (tela e PDF) ----------

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function chartSvg(points) {
  const W = 300, H = 74, P = 8;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1;
  const t0 = new Date(points[0].date + 'T12:00:00').getTime(), t1 = new Date(points[points.length - 1].date + 'T12:00:00').getTime();
  const x = (p, i) => P + ((t1 === t0 ? (points.length > 1 ? i / (points.length - 1) : .5) : (new Date(p.date + 'T12:00:00').getTime() - t0) / (t1 - t0))) * (W - 2 * P);
  const y = (v) => H - P - ((v - min) / range) * (H - 2 * P);
  const line = points.map((p, i) => `${x(p, i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${P},${H - P} ${line} ${(W - P)},${H - P}`;
  const last = points.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polygon points="${area}" fill="#d8b56e" opacity=".16"/><polyline points="${line}" fill="none" stroke="#b8924a" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<circle cx="${x(points[0], 0).toFixed(1)}" cy="${y(points[0].value).toFixed(1)}" r="3" fill="#fff" stroke="#b8924a" stroke-width="1.6"/>`
    + `<circle cx="${x(points[last], last).toFixed(1)}" cy="${y(points[last].value).toFixed(1)}" r="3.6" fill="#b8924a"/></svg>`;
}

export function evolutionHtml(m, logoUrl) {
  const f = m.fase, n = m.numeros;
  const empty = n.sessoes === 0;

  const faseCard = f ? `<div class="goal"><span class="lbl">Sua fase</span><span class="kcal" style="font-size:21pt;text-transform:uppercase;letter-spacing:.01em">${esc(f.label)}</span>
    <span style="font-size:9pt;color:var(--muted)">Semana ${f.semana} de ${f.total} · mesociclo ${f.mesociclo}${f.rir ? ` · ${esc(f.rir)}` : ''}</span></div>`
    : `<div class="goal"><span class="lbl">Seu treino</span><span class="kcal" style="font-size:18pt">${esc(m.cliente.programa || 'Em andamento')}</span></div>`;
  const stats = `<div class="macros"><span class="lbl">Seu treino em números</span><div class="stats">
    <div class="stat"><b>${n.sessoes}</b><span>treinos registrados</span></div>
    <div class="stat"><b>${n.sessoes ? num(n.porSemana) : '—'}</b><span>por semana, em média</span></div>
    <div class="stat"><b>${n.avaliados ? `${n.evoluiram}<small>/${n.avaliados}</small>` : '—'}</b><span>exercícios com mais carga</span></div></div></div>`;

  const destaques = m.destaques.length ? `<div class="hl">${m.destaques.map((e, i) => `<div class="hlc"><span class="lbl">${i === 0 ? 'Maior evolução' : `Destaque ${i + 1}`}</span><b class="pctbig">${pctTxt(e.pct)}</b>
    <div class="hn">${esc(e.nome)}</div><div class="hs">${num(e.de)} → ${num(e.para)} kg</div></div>`).join('')}</div>` : '';

  const charts = m.graficos.length ? `<div class="charts">${m.graficos.map(e => `<div class="chart"><div class="ct"><b>${esc(e.nome)}</b><span class="${e.pct > 0 ? 'up' : e.pct < 0 ? 'dn' : ''}">${pctTxt(e.pct)}</span></div>
    ${chartSvg(e.points)}<div class="cx"><span>${fmtShort(e.points[0].date)} · ${num(e.de)} kg</span><span>${fmtShort(e.points[e.points.length - 1].date)} · ${num(e.para)} kg</span></div></div>`).join('')}</div>` : '';

  const table = m.exercicios.length ? `<section class="meal${m.exercicios.length <= 14 ? ' keep' : ''}"><div class="mh"><h3>Evolução de carga · todos os exercícios</h3><span class="mac">início → atual</span></div>
    <table><thead><tr><th>Exercício</th><th>Início</th><th>Atual</th><th>Evolução</th></tr></thead><tbody>
    ${m.exercicios.map(e => `<tr><td>${esc(e.nome)}<div class="sc">${esc(e.grupo || '')} · ${e.sessoes} registros</div></td><td class="q">${num(e.de)} kg</td><td class="q">${num(e.para)} kg</td><td class="q ${e.pct > 0 ? 'up' : e.pct < 0 ? 'dn' : ''}">${pctTxt(e.pct)}</td></tr>`).join('')}
    </tbody></table></section>` : '';

  const vmax = Math.max(...m.volume.map(v => Math.max(v.sets, v.band?.max || 0)), 1) * 1.1;
  const pc = (x) => Math.min(100, x / vmax * 100);
  const vol = m.volume.length ? `<div class="orient" style="margin-top:0"><h4>Volume semanal por grupo muscular</h4>
    ${m.volume.map(v => `<div class="vrow"><span>${esc(v.muscle)}</span><div class="vbar">${v.band ? `<u style="left:${pc(v.band.min)}%;width:${pc(v.band.max) - pc(v.band.min)}%"></u>` : ''}<i class="${v.status}" style="width:${pc(v.sets)}%"></i></div><b>${v.sets} <small>séries${v.band ? ` · alvo ${v.band.min}–${v.band.max}` : ''}</small></b></div>`).join('')}
    <p class="note">Séries por semana prescritas na sua ficha${m.cliente.nivel ? `, comparadas com a faixa do nível ${esc(m.cliente.nivel.toLowerCase())}` : ''}. A faixa mostra a zona em que o volume tende a render melhor.</p></div>` : '';

  const comp = m.composicao ? `<div class="orient"><h4>Composição corporal</h4><table class="supt"><thead><tr><th>Medida</th><th>Início</th><th>Atual</th><th>Variação</th></tr></thead><tbody>
    ${m.composicao.rows.map(r => { const dv = r.de != null ? r.para - r.de : null; return `<tr><td><b>${esc(r.label)}</b></td><td class="q">${r.de != null ? `${withUnit(r.de, r.unit)}<div class="sc">${fmtBR(r.deData)}</div>` : '—'}</td><td class="q">${withUnit(r.para, r.unit)}<div class="sc">${fmtBR(r.paraData)}</div></td><td class="q">${dv != null ? `${sign(dv)}${withUnit(Math.abs(dv), r.unit)}` : '—'}</td></tr>`; }).join('')}
    </tbody></table><p class="note">% de gordura calculado por ${esc(m.composicao.fonte)}.</p></div>` : '';

  const prox = f?.proxima ? `<div class="howto"><b>Próxima fase: ${esc(f.proxima.label)}</b> — entra em ${f.proxima.emSemanas} semana${f.proxima.emSemanas === 1 ? '' : 's'}. ${esc(f.proxima.texto)}</div>` : '';
  const como = f ? `<div class="howto"><b>Como ler o seu momento:</b> ${esc(f.texto)}${f.isDeload ? '' : ' Subir a carga é o objetivo, mas só quando as repetições da faixa foram completas.'}</div>` : '';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Relatório de evolução · ${esc(m.cliente.nome)}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm 14mm 18mm;@bottom-left{content:'Taranttine Personal · Acompanhamento presencial';font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#8a877f}@bottom-right{content:'Página ' counter(page) ' de ' counter(pages);font-family:Inter,Arial,sans-serif;font-size:7.5pt;color:#b8924a}}
:root{--ink:#17171a;--chumbo:#2b2b30;--muted:#6f6c66;--line:#e3e0da;--soft:#f6f4f0;--gold:#b8924a;--gold2:#d8b56e;--up:#2f7d57;--dn:#b04a3f}
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
.kcal{font-family:'Barlow Condensed';font-weight:800;font-size:30pt;line-height:1}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.stat b{display:block;font-family:'Barlow Condensed';font-weight:800;font-size:24pt;line-height:1}.stat b small{font-size:13pt;color:var(--muted);font-weight:600}
.stat span{font-size:8.5pt;color:var(--muted)}
.howto{background:var(--soft);border-left:3px solid var(--gold);border-radius:0 6px 6px 0;padding:10px 14px;font-size:9.5pt;color:#3c3a36;margin:8px 0 12px}
.sec{font-family:'Barlow Condensed';font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-size:15pt;margin:18px 0 8px;display:flex;align-items:baseline;gap:10px}
.sec small{font-family:Inter;font-weight:500;letter-spacing:0;text-transform:none;font-size:8.5pt;color:var(--muted)}
.hl{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.hlc{border:1px solid var(--line);border-radius:6px;padding:10px 12px;break-inside:avoid}
.pctbig{display:block;font-family:'Barlow Condensed';font-weight:800;font-size:25pt;line-height:1.05;color:var(--gold)}
.hn{font-weight:600;font-size:9.5pt;margin-top:2px}.hs{font-size:8.5pt;color:var(--muted)}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.chart{border:1px solid var(--line);border-radius:6px;padding:9px 12px 8px;break-inside:avoid}
.ct{display:flex;justify-content:space-between;gap:8px;font-size:9.5pt}.ct b{font-weight:600}.ct span{font-family:'Barlow Condensed';font-weight:800;font-size:12pt;color:var(--muted)}
.up{color:var(--up)!important}.dn{color:var(--dn)!important}
.chart svg{width:100%;height:58px;display:block;margin:4px 0}
.cx{display:flex;justify-content:space-between;font-size:7.5pt;color:var(--muted)}
.meal{break-inside:auto;border:1px solid var(--line);border-radius:6px;margin-bottom:12px;overflow:hidden}.meal.keep{break-inside:avoid}
.mh{background:var(--chumbo);color:#fff;display:flex;align-items:baseline;gap:12px;padding:8px 14px}
.mh{break-after:avoid}.mh h3{font-family:'Barlow Condensed';font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:13pt;flex:1}
.mac{font-size:8.5pt;color:#c9c9c9}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;padding:7px 14px 4px;border-bottom:1px solid var(--line)}
td{padding:6px 14px;border-bottom:1px solid #f0ede7;vertical-align:top}td.q{font-weight:700;white-space:nowrap;width:92px}
tr{break-inside:avoid}tr:last-child td{border-bottom:0}
.sc{font-size:8pt;color:var(--muted);font-weight:400}
.orient{break-inside:avoid;margin-top:16px;border:1px solid var(--line);border-radius:6px;padding:12px 14px}
.orient h4{font-family:'Barlow Condensed';font-weight:700;text-transform:uppercase;letter-spacing:.08em;font-size:12pt;margin-bottom:6px}
.supt td{padding:6px 8px}.supt th{padding:4px 8px}
.vrow{display:grid;grid-template-columns:120px 1fr 118px;gap:10px;align-items:center;font-size:9.5pt;padding:3px 0}
.vbar{position:relative;height:9px;border-radius:9px;background:var(--soft);overflow:hidden}
.vbar u{position:absolute;top:0;bottom:0;background:rgba(184,146,74,.22);border-left:1px dashed var(--gold);border-right:1px dashed var(--gold)}
.vbar i{position:absolute;left:0;top:2px;bottom:2px;border-radius:9px;background:#9d9a93}
.vbar i.dentro{background:linear-gradient(90deg,var(--gold),var(--gold2))}.vbar i.abaixo{background:#c9a35c}.vbar i.acima{background:#b04a3f}
.vrow b{text-align:right}.vrow small{color:var(--muted);font-weight:400;font-size:8pt}
.note{font-size:8.5pt;color:var(--muted);margin-top:6px}
.empty{border:1px dashed var(--line);border-radius:6px;padding:18px;text-align:center;color:var(--muted);margin:14px 0}
.sign{break-inside:avoid;margin-top:22px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px}
.sign .line{border-top:1px solid var(--ink);width:260px;padding-top:6px;font-size:9pt;text-align:center}.sign .line b{display:block;font-size:10pt}
.next{font-size:9.5pt}.next b{font-family:'Barlow Condensed';font-size:13pt;color:var(--gold)}
@media screen{body{padding:18px 22px}}
@media screen and (max-width:680px){body{font-size:10pt;padding:14px}.cover{grid-template-columns:62px 1fr;padding:16px}.cover img{width:62px;height:62px}.date{grid-column:1/-1;text-align:left}.cover h1{font-size:23pt}
.summary,.hl,.charts{grid-template-columns:1fr}.vrow{grid-template-columns:90px 1fr 74px}.vrow small{display:none}td,th{padding-left:8px;padding-right:8px}td.q{width:auto}}
</style></head><body>
<header class="cover"><img src="${esc(logoUrl)}"><div><div class="eyebrow">Taranttine Personal · Treino</div><h1>Relatório de evolução</h1>
<div class="who"><b>${esc(m.cliente.nome)}</b>${m.cliente.programa ? ` · ${esc(m.cliente.programa)}` : ''}${m.cliente.nivel ? ` · nível ${esc(m.cliente.nivel.toLowerCase())}` : ''}</div></div>
<div class="date">Emitido em<br><b>${fmtBR(m.emitido_em)}</b><br>${m.periodo.inicio ? `${fmtShort(m.periodo.inicio)} a ${fmtShort(m.periodo.fim)}` : esc(m.periodo.rotulo)}</div></header>
<div class="summary">${faseCard}${stats}</div>
${como}
${empty ? `<div class="empty">Ainda não há treinos registrados neste período. Assim que os treinos forem lançados, a evolução de carga aparece aqui.</div>` : `
<div class="sec">Evolução de carga <small>${esc(m.periodo.rotulo.toLowerCase())}</small></div>
${n.estimadas ? `<p class="note" style="margin:-4px 0 10px">Inclui ${n.estimadas} registro${n.estimadas === 1 ? '' : 's'} de carga importado${n.estimadas === 1 ? '' : 's'} da planilha anterior, com datas aproximadas.</p>` : ''}
${m.exercicios.length ? `${destaques}${charts}${table}<p class="note" style="margin:-4px 0 10px">Semanas de deload não entram na comparação: a carga menor é planejada.</p>` : `<div class="empty">São necessários pelo menos 2 registros de carga por exercício pra mostrar a evolução.</div>`}`}
${vol}
${comp}
${prox}
${m.comentario ? `<div class="orient"><h4>Observações do treinador</h4><p style="font-size:9.5pt;white-space:pre-line">${esc(m.comentario)}</p></div>` : ''}
<div class="sign"><div class="next">${f?.proxima ? `Próxima fase<br><b>${esc(f.proxima.label)}</b>` : f ? `Semana ${f.semana} de ${f.total}<br><b>${esc(f.label)}</b>` : ''}</div><div class="line"><b>Taranttine Junior</b>${esc(m.profissional)}</div></div>
</body></html>`;
}
