import { supabase } from '../supabaseClient.js';

// Exames laboratoriais: catálogo, situação de cada valor, cálculos e regras
// para a triagem. A referência principal é sempre a do laboratório; só
// glicemia e HbA1c têm pontos de corte fixos (ADA, Standards of Care), e a
// TFG usa as categorias KDIGO. Não é diagnóstico.

export const LAB_GROUPS = [
  ['glicose', 'Glicose'], ['lipidios', 'Colesterol e triglicerídeos'], ['figado', 'Fígado'],
  ['rim', 'Rim'], ['sangue', 'Ferro, vitaminas e sangue'], ['outros', 'Tireoide e inflamação'],
];

export const LABS = [
  { code: 'glicemia', nome: 'Glicemia de jejum', unidade: 'mg/dL', grupo: 'glicose' },
  { code: 'hba1c', nome: 'Hemoglobina glicada (HbA1c)', unidade: '%', grupo: 'glicose' },
  { code: 'insulina', nome: 'Insulina de jejum', unidade: 'µUI/mL', grupo: 'glicose' },
  { code: 'ct', nome: 'Colesterol total', unidade: 'mg/dL', grupo: 'lipidios' },
  { code: 'ldl', nome: 'LDL', unidade: 'mg/dL', grupo: 'lipidios' },
  { code: 'hdl', nome: 'HDL', unidade: 'mg/dL', grupo: 'lipidios' },
  { code: 'tg', nome: 'Triglicerídeos', unidade: 'mg/dL', grupo: 'lipidios' },
  { code: 'tgo', nome: 'TGO (AST)', unidade: 'U/L', grupo: 'figado' },
  { code: 'tgp', nome: 'TGP (ALT)', unidade: 'U/L', grupo: 'figado' },
  { code: 'ggt', nome: 'Gama-GT', unidade: 'U/L', grupo: 'figado' },
  { code: 'creatinina', nome: 'Creatinina', unidade: 'mg/dL', grupo: 'rim' },
  { code: 'ureia', nome: 'Ureia', unidade: 'mg/dL', grupo: 'rim' },
  { code: 'acido_urico', nome: 'Ácido úrico', unidade: 'mg/dL', grupo: 'rim' },
  { code: 'hemoglobina', nome: 'Hemoglobina', unidade: 'g/dL', grupo: 'sangue' },
  { code: 'ferritina', nome: 'Ferritina', unidade: 'ng/mL', grupo: 'sangue' },
  { code: 'ferro', nome: 'Ferro sérico', unidade: 'µg/dL', grupo: 'sangue' },
  { code: 'b12', nome: 'Vitamina B12', unidade: 'pg/mL', grupo: 'sangue' },
  { code: 'vitd', nome: 'Vitamina D (25-OH)', unidade: 'ng/mL', grupo: 'sangue' },
  { code: 'tsh', nome: 'TSH', unidade: 'µUI/mL', grupo: 'outros' },
  { code: 't4l', nome: 'T4 livre', unidade: 'ng/dL', grupo: 'outros' },
  { code: 'pcr', nome: 'Proteína C reativa', unidade: 'mg/L', grupo: 'outros' },
];
export const LAB_BY_CODE = Object.fromEntries(LABS.map(l => [l.code, l]));

// Faixas fixas (ADA): só quando o laboratório não informa referência, e
// sempre para classificar pré-diabetes / diabetes.
const GLYCEMIC = {
  glicemia: [[100, 'normal'], [126, 'pre'], [Infinity, 'diabetes']],
  hba1c: [[5.7, 'normal'], [6.5, 'pre'], [Infinity, 'diabetes']],
};
const DEFAULT_REF = { glicemia: [70, 99], hba1c: [null, 5.6] };

export function defaultRef(code) {
  const r = DEFAULT_REF[code];
  return r ? { ref_min: r[0], ref_max: r[1] } : { ref_min: null, ref_max: null };
}

function glycemicClass(code, v) {
  const t = GLYCEMIC[code];
  return t ? t.find(([lim]) => v < lim)[1] : null;
}

// Situação de um resultado: { nivel: 'ok'|'baixo'|'alto'|'sem_ref', texto }.
export function statusOf(row) {
  const v = Number(row.valor);
  const g = glycemicClass(row.analito, v);
  if (g === 'diabetes') return { nivel: 'alto', texto: 'faixa de diabetes' };
  if (g === 'pre') return { nivel: 'alto', texto: 'faixa de pré-diabetes' };
  const min = row.ref_min != null ? Number(row.ref_min) : null;
  const max = row.ref_max != null ? Number(row.ref_max) : null;
  if (min == null && max == null) return g === 'normal' ? { nivel: 'ok', texto: 'normal' } : { nivel: 'sem_ref', texto: 'sem referência' };
  if (min != null && v < min) return { nivel: 'baixo', texto: 'abaixo da referência' };
  if (max != null && v > max) return { nivel: 'alto', texto: 'acima da referência' };
  return { nivel: 'ok', texto: 'dentro da referência' };
}

export function refText(row) {
  const f = n => String(Number(n)).replace('.', ',');
  if (row.ref_min != null && row.ref_max != null) return `${f(row.ref_min)}–${f(row.ref_max)}`;
  if (row.ref_max != null) return `até ${f(row.ref_max)}`;
  if (row.ref_min != null) return `acima de ${f(row.ref_min)}`;
  return '—';
}

export async function fetchLabs(clientId) {
  const { data, error } = await supabase.from('lab_results').select('*')
    .eq('client_id', clientId).order('data', { ascending: false }).order('created_at', { ascending: false });
  if (error) { console.error('fetchLabs failed', error); return null; }
  return data || [];
}

export async function saveLabs(clientId, rows, fonte) {
  const { error } = await supabase.from('lab_results').insert(rows.map(r => ({ ...r, client_id: clientId, fonte })));
  if (error) throw error;
}

export async function deleteLab(id) {
  const { error } = await supabase.from('lab_results').delete().eq('id', id);
  if (error) throw error;
}

// Último valor de cada exame (lista já vem da mais recente para a mais antiga).
export function latestByCode(rows) {
  const out = {};
  (rows || []).forEach(r => { if (!out[r.analito]) out[r.analito] = r; });
  return out;
}

// TFG pela CKD-EPI 2021 (sem raça), mL/min/1,73 m².
export function egfrCkdEpi2021(creat, idade, sexo) {
  if (!creat || !idade) return null;
  const f = String(sexo || '').toLowerCase().startsWith('f');
  const k = f ? 0.7 : 0.9, a = f ? -0.241 : -0.302;
  const s = Number(creat) / k;
  return Math.round(142 * Math.pow(Math.min(s, 1), a) * Math.pow(Math.max(s, 1), -1.2) * Math.pow(0.9938, idade) * (f ? 1.012 : 1));
}

export function egfrStage(tfg) {
  if (tfg == null) return null;
  if (tfg >= 90) return 'G1 · normal ou alta';
  if (tfg >= 60) return 'G2 · levemente reduzida';
  if (tfg >= 45) return 'G3a · leve a moderada';
  if (tfg >= 30) return 'G3b · moderada a grave';
  if (tfg >= 15) return 'G4 · grave';
  return 'G5 · falência renal';
}

// Cálculos com os valores mais recentes de cada exame.
export function computeDerived(latest, { idade, sexo } = {}) {
  const v = c => (latest[c] ? Number(latest[c].valor) : null);
  const out = [];
  if (v('glicemia') && v('insulina')) {
    out.push({ code: 'homa', nome: 'HOMA-IR', valor: Math.round(v('glicemia') * v('insulina') / 405 * 10) / 10,
      nota: 'Glicemia × insulina ÷ 405. Não há ponto de corte universal: acompanhe a tendência junto com glicemia e HbA1c.' });
  }
  const tfg = egfrCkdEpi2021(v('creatinina'), idade, sexo);
  if (tfg) out.push({ code: 'tfg', nome: 'Filtração renal (TFG)', valor: tfg, unidade: 'mL/min/1,73m²', nota: `CKD-EPI 2021 · ${egfrStage(tfg)} (KDIGO)` });
  else if (v('creatinina')) out.push({ code: 'tfg', nome: 'Filtração renal (TFG)', valor: null, nota: 'Precisa da data de nascimento e do sexo no cadastro.' });
  if (v('ct') && v('hdl')) out.push({ code: 'nao_hdl', nome: 'Colesterol não-HDL', valor: v('ct') - v('hdl'), unidade: 'mg/dL', nota: 'Colesterol total − HDL.' });
  if (v('tg') && v('hdl')) out.push({ code: 'tg_hdl', nome: 'Triglicerídeos / HDL', valor: Math.round(v('tg') / v('hdl') * 10) / 10, nota: 'Razão sem ponto de corte único; quanto mais alta, mais atenção ao perfil metabólico.' });
  return out;
}

// Itens no formato da triagem (screening.js), a partir dos exames recentes.
export function labScreening(latest, ctx = {}) {
  const out = [];
  const add = (nivel, titulo, motivo, para) => out.push({ nivel, titulo, motivo, para });
  const d = r => new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR');
  const val = r => `${String(Number(r.valor)).replace('.', ',')} ${r.unidade || LAB_BY_CODE[r.analito]?.unidade || ''}`.trim();
  const g = latest.glicemia, a = latest.hba1c;
  const gc = g && glycemicClass('glicemia', Number(g.valor)), ac = a && glycemicClass('hba1c', Number(a.valor));
  if (gc === 'diabetes' || ac === 'diabetes') {
    add('encaminhar', 'Glicemia na faixa de diabetes', [gc === 'diabetes' && `glicemia ${val(g)} (${d(g)})`, ac === 'diabetes' && `HbA1c ${val(a)} (${d(a)})`].filter(Boolean).join(' · '), 'médico antes de mudar o carboidrato');
  } else if (gc === 'pre' || ac === 'pre') {
    add('atencao', 'Glicemia na faixa de pré-diabetes', [gc === 'pre' && `glicemia ${val(g)}`, ac === 'pre' && `HbA1c ${val(a)}`].filter(Boolean).join(' · '), 'médico informado; treino de força e controle do carboidrato ajudam');
  }
  const tfg = egfrCkdEpi2021(latest.creatinina?.valor, ctx.idade, ctx.sexo);
  if (tfg != null && tfg < 60) add('encaminhar', 'Filtração renal reduzida', `TFG ${tfg} mL/min (${egfrStage(tfg)})`, 'nefrologista; proteína alta e creatina só com liberação');
  const high = c => latest[c] && statusOf(latest[c]).nivel === 'alto';
  const low = c => latest[c] && statusOf(latest[c]).nivel === 'baixo';
  if (high('tgp') || high('tgo') || high('ggt')) add('atencao', 'Enzimas do fígado acima da referência', ['tgo', 'tgp', 'ggt'].filter(high).map(c => `${LAB_BY_CODE[c].nome} ${val(latest[c])}`).join(' · '), 'médico; pode indicar gordura no fígado');
  if (high('tg')) add('atencao', 'Triglicerídeos altos', `${val(latest.tg)} (${d(latest.tg)})`, 'médico informado; menos açúcar e álcool, mais fibra');
  if (low('hemoglobina') || low('ferritina')) add('atencao', 'Sinal de anemia ou ferro baixo', ['hemoglobina', 'ferritina'].filter(low).map(c => `${LAB_BY_CODE[c].nome} ${val(latest[c])}`).join(' · '), 'médico; atenção a ferro e vitamina C nas refeições');
  if (low('b12')) add('atencao', 'Vitamina B12 baixa', val(latest.b12), 'médico (comum com metformina e dieta vegetariana)');
  if (low('vitd')) add('atencao', 'Vitamina D baixa', val(latest.vitd), 'médico para dose de reposição');
  if (high('tsh') || low('tsh')) add('atencao', 'TSH fora da referência', val(latest.tsh), 'endocrinologista; pode mudar gasto e peso');
  return out;
}

// Texto extra para os alertas de suplementos (supplements.js usa palavras).
export function labHealthText(latest, ctx = {}) {
  const parts = [];
  const tfg = egfrCkdEpi2021(latest.creatinina?.valor, ctx.idade, ctx.sexo);
  if (tfg != null && tfg < 60) parts.push(`TFG ${tfg}: função renal reduzida`);
  const gc = latest.glicemia && glycemicClass('glicemia', Number(latest.glicemia.valor));
  const ac = latest.hba1c && glycemicClass('hba1c', Number(latest.hba1c.valor));
  if (gc === 'diabetes' || ac === 'diabetes') parts.push('exame com glicemia na faixa de diabetes');
  return parts.join(' · ');
}
