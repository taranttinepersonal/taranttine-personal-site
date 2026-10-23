import {
  LABS, LAB_GROUPS, LAB_BY_CODE, statusOf, refText, defaultRef, fetchLabs, saveLabs, deleteLab,
  latestByCode, computeDerived, labScreening,
} from './labs.js';
import { buildTrendChart } from './chart.js';

// Tela de exames, igual no app (aluno) e no painel (treinador): resumo com a
// situação de cada exame, cálculos, gráfico por exame, formulário e histórico.
// mode: 'app' | 'admin'.

const STYLE = `
.lb { display: grid; gap: 14px; }
.lb-card { border: 1px solid var(--border2, #2c2c33); border-radius: 12px; padding: 14px; background: var(--black2, rgba(255,255,255,.02)); }
.lb-title { font-weight: 700; color: var(--white, #fff); font-size: 15px; margin-bottom: 8px; }
.lb-sub { font-size: 12px; color: var(--muted, #999); line-height: 1.45; }
.lb-grp { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #d8b56e; margin: 12px 0 4px; }
.lb-row { display: grid; grid-template-columns: minmax(0, 1.6fr) auto auto; gap: 8px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--border2, #2c2c33); font-size: 13px; }
.lb-row:last-child { border-bottom: 0; }
.lb-name { min-width: 0; color: var(--text, #ddd); }
.lb-name small { display: block; color: var(--muted, #999); font-size: 11px; }
.lb-val { font-weight: 700; color: var(--white, #fff); white-space: nowrap; font-variant-numeric: tabular-nums; }
.lb-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; white-space: nowrap; border: 1px solid currentColor; }
.lb-pill.ok { color: #3fb28a; } .lb-pill.alto, .lb-pill.baixo { color: #e0a040; } .lb-pill.sem_ref { color: var(--muted, #999); }
.lb-chartbtn { background: none; border: 0; color: #d8b56e; cursor: pointer; font-size: 12px; padding: 0 0 0 6px; }
.lb-chart { grid-column: 1 / -1; padding: 6px 0 4px; }
.lb-chart .lb-sub { display: flex; justify-content: space-between; }
.lb-derived { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.lb-derived div { border: 1px solid var(--border2, #2c2c33); border-radius: 10px; padding: 10px; }
.lb-derived b { display: block; font-size: 20px; color: var(--white, #fff); font-variant-numeric: tabular-nums; }
.lb-flag { border-left: 3px solid #e0a040; padding: 6px 10px; margin: 6px 0; font-size: 12.5px; color: var(--text, #ddd); }
.lb-flag.encaminhar { border-color: #d0584a; }
.lb-form-head { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.lb-form-head label { display: grid; gap: 3px; font-size: 11px; color: var(--muted, #999); flex: 1 1 140px; }
.lb input { font: inherit; font-size: 13px; color: var(--white, #fff); background: var(--black3, #1b1b1f); border: 1px solid var(--border2, #2c2c33); border-radius: 8px; padding: 7px 8px; width: 100%; min-width: 0; }
.lb-in { display: grid; grid-template-columns: minmax(0, 1.5fr) 80px 64px 64px; gap: 6px; align-items: center; padding: 4px 0; font-size: 12.5px; color: var(--text, #ddd); }
.lb-in span small { color: var(--muted, #999); }
.lb-in-head { font-size: 10.5px; color: var(--muted, #999); text-transform: uppercase; letter-spacing: .06em; }
.lb-hist { font-size: 12.5px; }
.lb-hist-date { font-weight: 700; color: var(--white, #fff); margin: 10px 0 2px; }
.lb-hist-row { display: flex; justify-content: space-between; gap: 8px; padding: 3px 0; color: var(--text, #ddd); }
.lb-del { background: none; border: 0; color: var(--muted, #999); cursor: pointer; }
.lb-btn { font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; border-radius: 8px; padding: 9px 14px; border: 1px solid #b8924a; background: linear-gradient(180deg, #d8b56e, #b8924a); color: #17130b; }
.lb-msg { font-size: 12.5px; margin-top: 6px; color: var(--muted, #999); }
.lb-msg.err { color: #e0705a; }
@media (max-width: 520px) { .lb-in { grid-template-columns: minmax(0, 1fr) 70px 52px 52px; } }
`;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => String(Number(v)).replace('.', ',');
const fmtD = iso => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
const parse = v => { const t = String(v ?? '').trim().replace(',', '.'); return t === '' ? null : Number(t); };

export async function mountLabs(el, { clientId, idade = null, sexo = null, mode = 'app' }) {
  if (!document.getElementById('lb-style')) {
    const s = document.createElement('style'); s.id = 'lb-style'; s.textContent = STYLE; document.head.appendChild(s);
  }
  el.innerHTML = `<div class="lb-sub">Carregando exames...</div>`;
  const rows = await fetchLabs(clientId);
  if (rows === null) {
    el.innerHTML = `<div class="lb-msg err">Não consegui carregar os exames.${mode === 'admin' ? ' Confira se o comando do banco 0033 já foi rodado no Supabase.' : ' Tente de novo em instantes.'}</div>`;
    return;
  }
  const latest = latestByCode(rows);
  const derived = computeDerived(latest, { idade, sexo });
  const flags = labScreening(latest, { idade, sexo });
  const open = new Set();
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  function seriesHtml(code) {
    const pts = rows.filter(r => r.analito === code).map(r => ({ date: r.data, value: Number(r.valor) })).reverse();
    const ch = buildTrendChart([{ label: LAB_BY_CODE[code]?.nome || code, color: '#d8b56e', points: pts }]);
    if (!ch) return `<div class="lb-chart lb-sub">Só um resultado até agora. O gráfico aparece a partir do segundo exame.</div>`;
    return `<div class="lb-chart">${ch.svg}<div class="lb-sub"><span>${fmtD(ch.firstDate)}</span><span>${pts.map(p => num(p.value)).join(' → ')}</span><span>${fmtD(ch.lastDate)}</span></div></div>`;
  }

  function summaryHtml() {
    const codes = LABS.filter(l => latest[l.code]);
    if (!codes.length) return `<div class="lb-card"><div class="lb-title">🧪 Exames</div><div class="lb-sub">Nenhum exame registrado ainda. ${mode === 'app' ? 'Copie os valores do seu último exame de sangue no formulário abaixo.' : 'Registre os valores no formulário abaixo.'}</div></div>`;
    return `<div class="lb-card"><div class="lb-title">🧪 Últimos resultados</div>
      ${LAB_GROUPS.map(([g, gname]) => {
        const items = codes.filter(l => l.grupo === g);
        if (!items.length) return '';
        return `<div class="lb-grp">${gname}</div>` + items.map(l => {
          const r = latest[l.code], st = statusOf(r);
          const prev = rows.find(x => x.analito === l.code && x.id !== r.id);
          const n = rows.filter(x => x.analito === l.code).length;
          return `<div class="lb-row"><div class="lb-name">${esc(l.nome)}<small>${fmtD(r.data)} · ref. ${refText(r)}${prev ? ` · antes ${num(prev.valor)}` : ''}</small></div>
            <div class="lb-val">${num(r.valor)} <small style="font-weight:400;color:var(--muted,#999)">${esc(r.unidade || l.unidade)}</small>${n > 1 ? `<button class="lb-chartbtn" data-chart="${l.code}" type="button" aria-label="Ver gráfico">📈</button>` : ''}</div>
            <span class="lb-pill ${st.nivel}">${st.texto}</span>${open.has(l.code) ? seriesHtml(l.code) : ''}</div>`;
        }).join('');
      }).join('')}</div>`;
  }

  function derivedHtml() {
    if (!derived.length && !flags.length) return '';
    return `<div class="lb-card"><div class="lb-title">🧮 Cálculos e pontos de atenção</div>
      ${derived.length ? `<div class="lb-derived">${derived.map(c => `<div><span class="lb-sub">${esc(c.nome)}</span><b>${c.valor == null ? '—' : num(c.valor)}${c.unidade ? ` <small style="font-size:11px;font-weight:400;color:var(--muted,#999)">${esc(c.unidade)}</small>` : ''}</b><span class="lb-sub">${esc(c.nota)}</span></div>`).join('')}</div>` : ''}
      ${flags.map(f => `<div class="lb-flag ${f.nivel}"><b>${f.nivel === 'encaminhar' ? '⛔' : '⚠️'} ${esc(f.titulo)}</b> · ${esc(f.motivo)}${mode === 'admin' ? ` → <b>${esc(f.para)}</b>` : ''}</div>`).join('')}
      <div class="lb-sub" style="margin-top:8px;">${mode === 'admin' ? 'Leitura de apoio ao plano, não é diagnóstico. A referência é a do laboratório; glicemia e HbA1c seguem as faixas da ADA e a TFG, a KDIGO.' : 'Isto não é diagnóstico. Qualquer valor alterado deve ser visto com o seu médico; o Taranttine usa estes dados para ajustar o seu plano.'}</div></div>`;
  }

  function formHtml() {
    return `<div class="lb-card"><div class="lb-title">➕ Registrar exame</div>
      <div class="lb-sub" style="margin-bottom:8px;">Preencha só o que estiver no exame. Use a referência impressa pelo laboratório (mínimo e máximo).</div>
      <div class="lb-form-head"><label>Data da coleta<input type="date" id="lb-date" value="${today}"></label><label>Laboratório (opcional)<input id="lb-lab" placeholder="ex.: Laboratório X"></label></div>
      <div class="lb-in lb-in-head"><span>Exame</span><span>Valor</span><span>Ref. mín</span><span>Ref. máx</span></div>
      ${LAB_GROUPS.map(([g, gname]) => `<div class="lb-grp">${gname}</div>` + LABS.filter(l => l.grupo === g).map(l => {
        const last = latest[l.code], ref = last ? { ref_min: last.ref_min, ref_max: last.ref_max } : defaultRef(l.code);
        return `<div class="lb-in"><span>${esc(l.nome)} <small>${esc(l.unidade)}</small></span>
          <input inputmode="decimal" data-v="${l.code}" aria-label="${esc(l.nome)}">
          <input inputmode="decimal" data-min="${l.code}" value="${ref.ref_min ?? ''}" aria-label="Referência mínima">
          <input inputmode="decimal" data-max="${l.code}" value="${ref.ref_max ?? ''}" aria-label="Referência máxima"></div>`;
      }).join('')).join('')}
      <div style="margin-top:12px;"><button class="lb-btn" id="lb-save" type="button">Salvar exame</button><div class="lb-msg" id="lb-msg"></div></div></div>`;
  }

  function histHtml() {
    if (!rows.length) return '';
    const byDate = {};
    rows.forEach(r => { (byDate[r.data] = byDate[r.data] || []).push(r); });
    return `<div class="lb-card lb-hist"><div class="lb-title">📋 Histórico</div>
      ${Object.keys(byDate).sort().reverse().map(dt => `<div class="lb-hist-date">${fmtD(dt)}${byDate[dt][0].laboratorio ? ` · ${esc(byDate[dt][0].laboratorio)}` : ''}</div>` +
        byDate[dt].map(r => `<div class="lb-hist-row"><span>${esc(LAB_BY_CODE[r.analito]?.nome || r.analito)}: <b>${num(r.valor)}</b> ${esc(r.unidade || '')}${mode === 'admin' ? ` <small class="lb-sub">· ${r.fonte === 'treinador' ? 'você' : r.fonte === 'ia' ? 'IA' : 'aluno'}</small>` : ''}</span><button class="lb-del" data-del="${r.id}" type="button" aria-label="Excluir">✕</button></div>`).join('')).join('')}</div>`;
  }

  function render() {
    el.innerHTML = `<div class="lb">${summaryHtml()}${derivedHtml()}${formHtml()}${histHtml()}</div>`;
  }
  render();

  el.onclick = async (e) => {
    const c = e.target.closest('[data-chart]');
    if (c) { const k = c.dataset.chart; open.has(k) ? open.delete(k) : open.add(k); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
    const d = e.target.closest('[data-del]');
    if (d) {
      if (d.dataset.confirm !== '1') { d.dataset.confirm = '1'; d.textContent = 'excluir?'; return; }
      try { await deleteLab(d.dataset.del); mountLabs(el, { clientId, idade, sexo, mode }); } catch (err) { console.error('deleteLab failed', err); d.textContent = 'erro'; }
      return;
    }
    if (e.target.id === 'lb-save') {
      const msg = el.querySelector('#lb-msg');
      const data = el.querySelector('#lb-date').value;
      const laboratorio = el.querySelector('#lb-lab').value.trim() || null;
      const out = [];
      for (const l of LABS) {
        const v = parse(el.querySelector(`[data-v="${l.code}"]`).value);
        if (v == null) continue;
        if (Number.isNaN(v)) { msg.className = 'lb-msg err'; msg.textContent = `Valor inválido em ${l.nome}.`; return; }
        const mn = parse(el.querySelector(`[data-min="${l.code}"]`).value), mx = parse(el.querySelector(`[data-max="${l.code}"]`).value);
        out.push({ data, analito: l.code, valor: v, unidade: l.unidade, ref_min: Number.isNaN(mn) ? null : mn, ref_max: Number.isNaN(mx) ? null : mx, laboratorio });
      }
      if (!data) { msg.className = 'lb-msg err'; msg.textContent = 'Informe a data da coleta.'; return; }
      if (!out.length) { msg.className = 'lb-msg err'; msg.textContent = 'Preencha o valor de pelo menos um exame.'; return; }
      e.target.disabled = true; msg.className = 'lb-msg'; msg.textContent = 'Salvando...';
      try {
        await saveLabs(clientId, out, mode === 'admin' ? 'treinador' : 'aluno');
        mountLabs(el, { clientId, idade, sexo, mode });
      } catch (err) {
        console.error('saveLabs failed', err);
        msg.className = 'lb-msg err'; msg.textContent = 'Não consegui salvar. Confira a internet e tente de novo.';
        e.target.disabled = false;
      }
    }
  };
}

export function ageFrom(birth) {
  return birth ? Math.floor((Date.now() - new Date(birth + 'T00:00:00')) / 31557600000) : null;
}
