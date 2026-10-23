import { supabase } from '../../../app/js/supabaseClient.js';
import { loadTaco, registerCustomFoods, mergeModels, SUB_GROUPS, foodName } from '../../../app/js/lib/prescription.js';

const TIPOS = [['CAF', 'Café'], ['LAN', 'Lanche'], ['PRA', 'Almoço / jantar'], ['CEI', 'Ceia']];
const ROLES = [['P', 'proteína'], ['C', 'carbo'], ['G', 'gordura'], ['L', 'livre'], ['X', 'porção fixa']];

// Biblioteca da prescrição: alimentos próprios (fora da TACO) e
// refeições-modelo do cardápio automático.
export async function renderLibrary(main) {
  main.closest('.admin-shell')?.classList.add('wide');
  main.innerHTML = `<div class="admin-empty">Carregando a biblioteca...</div>`;

  const taco = await loadTaco();
  let foods = [], modelRows = [], editing = null, msgText = '', msgErr = false;

  async function reload() {
    const [{ data: f, error: e1 }, { data: m, error: e2 }] = await Promise.all([
      supabase.from('custom_foods').select('*').order('nome'),
      supabase.from('meal_models').select('*').order('code'),
    ]);
    if (e1 || e2) {
      msgText = 'Não consegui ler a biblioteca. Confira se o comando do banco 0027 já foi rodado no Supabase.';
      msgErr = true;
    }
    foods = f || [];
    modelRows = m || [];
    registerCustomFoods(taco, foods);
  }

  function foodOptions() {
    const list = [...taco.values()].filter(x => x.kcal != null).map(x => `<option value="${esc(keyLabel(x))}"></option>`);
    return `<datalist id="lib-foods">${list.join('')}</datalist>`;
  }
  function keyLabel(f) { return `${foodName(f)} [${f.id}]`; }
  function parseKey(v) {
    const m = String(v).match(/\[([^\]]+)\]\s*$/);
    if (!m) return null;
    const k = m[1];
    return k.startsWith('c:') ? k : Number(k);
  }

  function render() {
    const models = mergeModels(modelRows);
    main.innerHTML = `
      <div class="admin-header"><div class="admin-title">Biblioteca da prescrição</div></div>
      ${msgText ? `<div class="admin-msg ${msgErr ? 'error' : ''}" style="margin-bottom:12px;">${esc(msgText)}</div>` : ''}
      ${foodOptions()}
      ${editing ? renderEditor() : ''}
      <div class="admin-card">
        <div class="admin-section-title" style="margin-top:0;">Refeições-modelo</div>
        <div class="admin-row-sub" style="margin-bottom:10px;">Os modelos "padrão" vêm prontos. Editar um padrão cria a sua versão com o mesmo código, que passa a valer no cardápio automático.</div>
        <button class="admin-btn primary" id="lib-new-model">+ Novo modelo</button>
        <div class="rx-scroll" style="margin-top:10px;"><table class="rx-table">
          <thead><tr><th>Código</th><th>Tipo</th><th>Modelo</th><th>Alimentos</th><th>kcal base</th><th></th></tr></thead>
          <tbody>${models.map(m => `
            <tr>
              <td><b>${esc(m.code)}</b></td>
              <td>${esc(TIPOS.find(t => t[0] === m.tipo)?.[1] || m.tipo)}</td>
              <td>${esc(m.nome)} ${m.padrao ? '<span class="rx-role">padrão</span>' : '<span class="rx-role r-L">seu</span>'}</td>
              <td class="admin-row-sub">${m.items.map(([id, g]) => { const f = taco.get(id); return f ? `${esc(foodName(f))} ${g} g` : '<span style="color:#e05252">alimento removido</span>'; }).join(' · ')}</td>
              <td>${Math.round(m.items.reduce((a, [id, g]) => a + ((taco.get(id)?.kcal || 0) * g / 100), 0))}</td>
              <td style="white-space:nowrap;"><button class="admin-btn" data-edit-model="${esc(m.code)}">Editar</button>
                ${!m.padrao || modelRows.some(r => r.code === m.code) ? `<button class="admin-btn danger" data-hide-model="${esc(m.code)}">Desativar</button>` : `<button class="admin-btn danger" data-hide-model="${esc(m.code)}">Ocultar</button>`}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        ${modelRows.filter(r => r.ativo === false).length ? `<div class="admin-row-sub" style="margin-top:8px;">Ocultos: ${modelRows.filter(r => r.ativo === false).map(r => `${esc(r.code)} <button class="admin-btn" data-show-model="${esc(r.code)}">reativar</button>`).join(' ')}</div>` : ''}
      </div>

      <div class="admin-card admin-form">
        <div class="admin-section-title" style="margin-top:0;">Alimentos próprios</div>
        <div class="admin-row-sub" style="margin-bottom:10px;">Para o que a TACO não tem: whey, goma de tapioca, produtos de rótulo ou receitas inteiras. Use os valores do rótulo.</div>
        <div class="field-row">
          <div><label>Nome</label><input id="cf-nome" placeholder="Ex: Whey concentrado (marca)"></div>
          <div><label>Os valores abaixo são por</label><input id="cf-base" type="number" value="100" step="1"> <span class="admin-row-sub">g (100 g, ou a porção do rótulo)</span></div>
        </div>
        <div class="field-row">
          <div><label>kcal</label><input id="cf-kcal" type="number" step="0.1"></div>
          <div><label>Proteína (g)</label><input id="cf-prot" type="number" step="0.1"></div>
          <div><label>Carboidrato (g)</label><input id="cf-carb" type="number" step="0.1"></div>
          <div><label>Gordura (g)</label><input id="cf-gord" type="number" step="0.1"></div>
        </div>
        <div class="field-row">
          <div><label>Grupo de substituição</label><select id="cf-grupo"><option value="">Nenhum</option>${SUB_GROUPS.map(g => `<option>${esc(g.nome)}</option>`).join('')}<option>Receitas</option></select></div>
          <div><label>Medida caseira (opcional)</label><input id="cf-unome" placeholder="Ex: scoop, unidade, porção"></div>
          <div><label>Gramas da medida</label><input id="cf-ug" type="number" step="1" placeholder="Ex: 30"></div>
          <label class="rx-check"><input type="checkbox" id="cf-so"> Mostrar só na medida (receita)</label>
        </div>
        <button class="admin-btn primary" id="cf-save" style="margin-top:12px;">Salvar alimento</button>
        <div class="rx-scroll" style="margin-top:14px;"><table class="rx-table">
          <thead><tr><th>Alimento</th><th>kcal</th><th>P</th><th>C</th><th>G</th><th>Grupo</th><th>Medida</th><th></th></tr></thead>
          <tbody>${foods.length ? foods.map(f => `
            <tr><td><b>${esc(f.nome)}</b></td><td>${num(f.kcal)}</td><td>${num(f.prot)}</td><td>${num(f.carb)}</td><td>${num(f.gord)}</td>
              <td class="admin-row-sub">${esc(f.grupo || '—')}</td>
              <td class="admin-row-sub">${f.unidade_nome ? `${esc(f.unidade_nome)} = ${num(f.unidade_g)} g${f.so_unidade ? ' · só medida' : ''}` : '—'}</td>
              <td><button class="admin-btn danger" data-del-food="${f.id}">Excluir</button></td></tr>`).join('') : '<tr><td colspan="8" class="admin-row-sub">Nenhum alimento próprio ainda.</td></tr>'}
          </tbody>
        </table></div>
        <div class="admin-row-sub" style="margin-top:6px;">Valores guardados por 100 g.</div>
      </div>
    `;
  }

  function renderEditor() {
    const e = editing;
    const tot = e.items.reduce((a, it) => {
      const f = taco.get(it.key);
      if (!f) return a;
      return { kcal: a.kcal + (f.kcal || 0) * it.g / 100, prot: a.prot + f.prot * it.g / 100, carb: a.carb + f.carb * it.g / 100, gord: a.gord + f.gord * it.g / 100 };
    }, { kcal: 0, prot: 0, carb: 0, gord: 0 });
    return `
      <div class="admin-card admin-form rx-editor">
        <div class="admin-section-title" style="margin-top:0;">${e.isNew ? 'Novo modelo' : `Editar ${esc(e.code)}`}</div>
        <div class="field-row">
          <div><label>Código</label><input id="me-code" value="${esc(e.code)}" ${e.isNew ? '' : 'disabled'} placeholder="Ex: PRA-F"></div>
          <div><label>Tipo de refeição</label><select id="me-tipo">${TIPOS.map(([k, l]) => `<option value="${k}" ${k === e.tipo ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        </div>
        <label>Nome do modelo</label><input id="me-nome" value="${esc(e.nome)}" placeholder="Ex: Hambúrguer caseiro">
        <div class="rx-scroll" style="margin-top:10px;"><table class="rx-table">
          <thead><tr><th>Alimento (TACO ou próprio)</th><th>Gramas base</th><th>Papel</th><th></th></tr></thead>
          <tbody>${e.items.map((it, i) => {
            const f = taco.get(it.key);
            return `<tr>
              <td><input class="rx-in" style="width:340px;" list="lib-foods" data-me-food="${i}" value="${f ? esc(keyLabel(f)) : ''}" placeholder="Digite para buscar"></td>
              <td><input class="rx-in sm" type="number" step="5" data-me-g="${i}" value="${it.g}"></td>
              <td><select data-me-role="${i}">${ROLES.map(([k, l]) => `<option value="${k}" ${k === it.role ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
              <td><button class="admin-btn danger" data-me-del="${i}">×</button></td></tr>`;
          }).join('')}</tbody>
        </table></div>
        <button class="admin-btn" id="me-add" style="margin-top:8px;">+ Alimento</button>
        <div class="admin-row-sub" style="margin-top:10px;">Base do modelo: <b style="color:var(--white);">${Math.round(tot.kcal)} kcal</b> · P ${Math.round(tot.prot)} g · C ${Math.round(tot.carb)} g · G ${Math.round(tot.gord)} g. No cardápio, as quantidades se ajustam à meta de cada cliente pelo papel de cada alimento.</div>
        <div style="display:flex;gap:8px;margin-top:12px;"><button class="admin-btn primary" id="me-save">Salvar modelo</button><button class="admin-btn" id="me-cancel">Cancelar</button></div>
      </div>
    `;
  }

  main.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!editing) return;
    if (el.dataset.meFood != null) {
      const k = parseKey(el.value);
      if (k != null && taco.has(k)) editing.items[Number(el.dataset.meFood)].key = k;
      render();
    } else if (el.dataset.meG != null) {
      editing.items[Number(el.dataset.meG)].g = Number(el.value) || 0; render();
    } else if (el.dataset.meRole != null) {
      editing.items[Number(el.dataset.meRole)].role = el.value;
    } else if (el.id === 'me-nome') { editing.nome = el.value; }
    else if (el.id === 'me-code') { editing.code = el.value.trim().toUpperCase(); }
    else if (el.id === 'me-tipo') { editing.tipo = el.value; }
  });

  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    msgText = ''; msgErr = false;
    const models = mergeModels(modelRows);
    if (b.id === 'lib-new-model') {
      editing = { isNew: true, code: '', tipo: 'PRA', nome: '', items: [{ key: 410, g: 120, role: 'P' }] };
    } else if (b.dataset.editModel) {
      const m = models.find(x => x.code === b.dataset.editModel);
      editing = { isNew: false, code: m.code, tipo: m.tipo, nome: m.nome, items: m.items.map(([key, g, role]) => ({ key, g, role })) };
    } else if (b.id === 'me-add') {
      editing.items.push({ key: 157, g: 50, role: 'L' });
    } else if (b.dataset.meDel != null) {
      editing.items.splice(Number(b.dataset.meDel), 1);
    } else if (b.id === 'me-cancel') {
      editing = null;
    } else if (b.id === 'me-save') {
      editing.nome = document.getElementById('me-nome').value.trim();
      if (editing.isNew) editing.code = document.getElementById('me-code').value.trim().toUpperCase();
      editing.tipo = document.getElementById('me-tipo').value;
      if (!editing.code || !editing.nome || !editing.items.length) { msgText = 'Preencha código, nome e pelo menos um alimento.'; msgErr = true; render(); return; }
      if (editing.isNew && models.some(x => x.code === editing.code)) { msgText = `Já existe um modelo ${editing.code}. Escolha outro código.`; msgErr = true; render(); return; }
      const row = { code: editing.code, tipo: editing.tipo, nome: editing.nome, items: editing.items.map(it => [it.key, it.g, it.role]), ativo: true, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('meal_models').upsert(row, { onConflict: 'code' });
      if (error) { console.error(error); msgText = 'Não consegui salvar o modelo.'; msgErr = true; }
      else { msgText = `Modelo ${editing.code} salvo. Ele já aparece na Prescrição.`; editing = null; await reload(); }
    } else if (b.dataset.hideModel) {
      const m = models.find(x => x.code === b.dataset.hideModel);
      const row = { code: m.code, tipo: m.tipo, nome: m.nome, items: m.items, ativo: false, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('meal_models').upsert(row, { onConflict: 'code' });
      if (error) { msgText = 'Não consegui ocultar o modelo.'; msgErr = true; } else { msgText = `${m.code} oculto do cardápio automático.`; await reload(); }
    } else if (b.dataset.showModel) {
      const { error } = await supabase.from('meal_models').update({ ativo: true }).eq('code', b.dataset.showModel);
      if (!error) { msgText = `${b.dataset.showModel} reativado.`; await reload(); }
    } else if (b.id === 'cf-save') {
      const v = id => document.getElementById(id).value;
      const base = Number(v('cf-base')) || 100;
      const per100 = x => Math.round((Number(x) || 0) / base * 100 * 100) / 100;
      const row = {
        nome: v('cf-nome').trim(), kcal: per100(v('cf-kcal')), prot: per100(v('cf-prot')), carb: per100(v('cf-carb')), gord: per100(v('cf-gord')),
        grupo: v('cf-grupo') || null, unidade_nome: v('cf-unome').trim() || null, unidade_g: Number(v('cf-ug')) || null,
        so_unidade: document.getElementById('cf-so').checked, fonte: 'rótulo',
      };
      if (!row.nome || !v('cf-kcal')) { msgText = 'Preencha pelo menos o nome e as kcal.'; msgErr = true; render(); return; }
      const { error } = await supabase.from('custom_foods').insert(row);
      if (error) { console.error(error); msgText = 'Não consegui salvar o alimento.'; msgErr = true; }
      else { msgText = `${row.nome} salvo.`; await reload(); }
    } else if (b.dataset.delFood) {
      const used = modelRows.some(r => r.items.some(([k]) => k === `c:${b.dataset.delFood}`));
      if (used) { msgText = 'Esse alimento está em um modelo. Tire ele do modelo antes de excluir.'; msgErr = true; render(); return; }
      const { error } = await supabase.from('custom_foods').delete().eq('id', b.dataset.delFood);
      if (!error) { msgText = 'Alimento excluído.'; await reload(); }
    } else {
      return;
    }
    render();
  });

  await reload();
  render();
}

function num(x) { return x == null ? '—' : Math.round(Number(x) * 10) / 10; }
function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
