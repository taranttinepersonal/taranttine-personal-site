import { supabase } from '../supabaseClient.js';

// Anamnese nutricional em duas etapas. As chaves de respostas são os
// próprios rótulos (como em anamneses), então mudar um rótulo aqui muda a
// chave gravada — prefira acrescentar campos a renomear.

const FREQ = ['Nunca', '1-2x por semana', '3-4x por semana', '5-6x por semana', 'Todo dia', 'Mais de 1x por dia'];

const MEAL_HINT = 'Horário · o que comeu · quantidade aproximada';

export const ETAPA1 = [
  {
    title: 'Sua rotina',
    fields: [
      { label: 'Horário que acorda', type: 'time' },
      { label: 'Horário que dorme', type: 'time' },
      { label: 'Horário do treino', type: 'text', placeholder: 'Ex: 18h, de segunda a sexta' },
      { label: 'Trabalho', type: 'select', options: ['Sentado a maior parte do tempo', 'Em pé ou andando', 'Trabalho físico pesado', 'Turnos ou noturno', 'Não trabalho fora'] },
      { label: 'Quem prepara suas refeições', type: 'select', options: ['Eu mesmo', 'Alguém da família', 'Compro pronto ou marmita', 'Como em restaurante'] },
      { label: 'Refeições fora de casa por semana', type: 'select', options: ['Nenhuma', '1 a 3', '4 a 7', '8 ou mais'] },
    ],
  },
  {
    title: 'O que você comeu ontem',
    hint: 'Pense em ontem, ou no último dia normal da sua semana. Escreva do jeito que lembrar, sem se preocupar em acertar a quantidade exata.',
    fields: [
      { label: 'Café da manhã', type: 'textarea', placeholder: `${MEAL_HINT} (ex: 7h · 2 ovos mexidos, 1 pão francês, café com leite)` },
      { label: 'Lanche da manhã', type: 'textarea', placeholder: MEAL_HINT },
      { label: 'Almoço', type: 'textarea', placeholder: MEAL_HINT },
      { label: 'Lanche da tarde', type: 'textarea', placeholder: MEAL_HINT },
      { label: 'Jantar', type: 'textarea', placeholder: MEAL_HINT },
      { label: 'Ceia ou beliscos', type: 'textarea', placeholder: MEAL_HINT },
    ],
  },
  {
    title: 'Com que frequência você come',
    fields: [
      'Frutas', 'Verduras e legumes', 'Feijão, lentilha ou grão-de-bico', 'Carne, frango ou peixe', 'Ovos',
      'Leite, iogurte ou queijo', 'Doces', 'Frituras', 'Salgadinhos, biscoitos ou congelados prontos',
      'Refrigerante ou suco de caixinha', 'Bebida alcoólica',
    ].map(label => ({ label: `Frequência · ${label}`, short: label, type: 'select', options: FREQ })),
  },
  {
    title: 'Suas preferências',
    fields: [
      { label: 'Alimentos que você adora', type: 'textarea' },
      { label: 'Alimentos que não come de jeito nenhum', type: 'textarea' },
      { label: 'Restrição por escolha', type: 'select', options: ['Nenhuma', 'Vegetariano', 'Vegano', 'Sem lactose', 'Sem glúten', 'Outra'] },
      { label: 'Orçamento para alimentação', type: 'select', options: ['Apertado', 'Moderado', 'Confortável'] },
    ],
  },
];

export const ETAPA2 = [
  {
    title: 'Saúde digestiva',
    fields: [
      { label: 'Alergias ou intolerâncias', type: 'text' },
      { label: 'Frequência do intestino', type: 'select', options: ['Mais de 1x por dia', '1x por dia', 'A cada 2 dias', '3x por semana ou menos'] },
      { label: 'Formato das fezes (Bristol)', type: 'select', options: ['1 · bolinhas duras', '2 · alongada e encaroçada', '3 · alongada com rachaduras', '4 · lisa e macia', '5 · pedaços macios', '6 · pastosa', '7 · líquida'] },
      { label: 'Azia, gases ou inchaço', type: 'textarea' },
    ],
  },
  {
    title: 'Hidratação e estimulantes',
    fields: [
      { label: 'Água por dia', type: 'select', options: ['Menos de 1 L', '1 a 2 L', '2 a 3 L', 'Mais de 3 L'] },
      { label: 'Café (xícaras e até que horas)', type: 'text' },
      { label: 'Energético ou pré-treino', type: 'text' },
    ],
  },
  {
    title: 'Sono e fome',
    fields: [
      { label: 'Horas de sono por noite', type: 'number' },
      { label: 'Qualidade do sono (1 a 5)', type: 'select', options: ['1', '2', '3', '4', '5'] },
      { label: 'Horário de mais fome', type: 'text' },
      { label: 'Belisca à noite', type: 'select', options: ['Não', 'Às vezes', 'Quase todo dia'] },
    ],
  },
  {
    title: 'Histórico de dietas',
    fields: [
      { label: 'Dietas que já fez e resultado', type: 'textarea' },
      { label: 'Por que parou', type: 'textarea' },
      { label: 'Efeito sanfona', type: 'select', options: ['Não', 'Uma vez', 'Várias vezes'] },
    ],
  },
  {
    title: 'Relação com a comida',
    hint: 'Se houver sinais de transtorno alimentar, considere encaminhar para psicólogo e médico.',
    fields: [
      { label: 'Come por ansiedade ou emoção', type: 'select', options: ['Nunca', 'Às vezes', 'Com frequência'] },
      { label: 'Sente culpa depois de comer', type: 'select', options: ['Nunca', 'Às vezes', 'Com frequência'] },
      { label: 'Diagnóstico de transtorno alimentar', type: 'text' },
    ],
  },
  {
    title: 'Triagem SCOFF (transtorno alimentar)',
    hint: 'Pergunte com naturalidade. Duas ou mais respostas "Sim" indicam encaminhamento para avaliação com psicólogo ou médico. É triagem, não diagnóstico (Morgan et al., BMJ, 1999).',
    fields: [
      { label: 'SCOFF · Provoca vômito por se sentir cheio(a) demais?', short: 'Provoca vômito por se sentir cheio(a) demais?', type: 'select', options: ['Não', 'Sim'] },
      { label: 'SCOFF · Sente que perdeu o controle sobre o quanto come?', short: 'Sente que perdeu o controle sobre o quanto come?', type: 'select', options: ['Não', 'Sim'] },
      { label: 'SCOFF · Perdeu mais de 6 kg em 3 meses recentemente?', short: 'Perdeu mais de 6 kg em 3 meses recentemente?', type: 'select', options: ['Não', 'Sim'] },
      { label: 'SCOFF · Se acha gordo(a) mesmo quando dizem que está magro(a)?', short: 'Se acha gordo(a) mesmo quando dizem que está magro(a)?', type: 'select', options: ['Não', 'Sim'] },
      { label: 'SCOFF · Diria que a comida domina a sua vida?', short: 'Diria que a comida domina a sua vida?', type: 'select', options: ['Não', 'Sim'] },
    ],
  },
  {
    title: 'Suplementos',
    fields: [
      { label: 'Suplementos em uso (qual, dose, quem indicou)', type: 'textarea' },
    ],
  },
  {
    title: 'Saúde feminina (se aplicável)',
    fields: [
      { label: 'Ciclo menstrual', type: 'select', options: ['Não se aplica', 'Regular', 'Irregular', 'Não menstrua'] },
      { label: 'Anticoncepcional', type: 'text' },
      { label: 'Fase', type: 'select', options: ['Não se aplica', 'Perimenopausa', 'Menopausa', 'Gestante', 'Amamentando'] },
    ],
  },
  {
    title: 'Exames e observações',
    hint: 'Exames servem de contexto, não de diagnóstico.',
    fields: [
      { label: 'Exames recentes (resumo)', type: 'textarea' },
      { label: 'Observações da consulta', type: 'textarea' },
    ],
  },
];

export function fieldId(prefix, label) {
  return prefix + '-' + label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Monta o HTML dos blocos. `cls` permite reaproveitar no app e no painel,
// que têm estilos de formulário diferentes.
export function renderBlocks(blocks, prefix, values = {}, { blockClass = '', titleClass = '', hintClass = '', labelClass = '', inputClass = '' } = {}) {
  return blocks.map((b, i) => `
    <div class="${blockClass}">
      <div class="${titleClass}">${i + 1}. ${esc(b.title)}</div>
      ${b.hint ? `<div class="${hintClass}">${esc(b.hint)}</div>` : ''}
      ${b.fields.map(f => {
        const id = fieldId(prefix, f.label);
        const v = values[f.label] ?? '';
        const label = `<label class="${labelClass}" for="${id}">${esc(f.short || f.label)}</label>`;
        if (f.type === 'textarea') {
          return `${label}<textarea id="${id}" class="${inputClass}" rows="2" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
        }
        if (f.type === 'select') {
          return `${label}<select id="${id}" class="${inputClass}"><option value="">Selecione</option>${f.options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        }
        return `${label}<input id="${id}" class="${inputClass}" type="${f.type}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}">`;
      }).join('')}
    </div>
  `).join('');
}

export function collectBlocks(blocks, prefix) {
  const out = {};
  blocks.forEach(b => b.fields.forEach(f => {
    const el = document.getElementById(fieldId(prefix, f.label));
    const v = el ? el.value.trim() : '';
    if (v) out[f.label] = v;
  }));
  return out;
}

export async function fetchNutritionAnamneses(clientId) {
  const { data, error } = await supabase
    .from('nutrition_anamneses')
    .select('etapa, respostas, recorded_at, updated_at')
    .eq('client_id', clientId);
  if (error) {
    console.error('fetchNutritionAnamneses failed', error);
    return { etapa1: null, etapa2: null };
  }
  return {
    etapa1: data.find(r => r.etapa === 1) || null,
    etapa2: data.find(r => r.etapa === 2) || null,
  };
}

export async function saveNutritionAnamnese(clientId, etapa, respostas) {
  const today = new Date();
  const recorded_at = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { error } = await supabase.from('nutrition_anamneses').upsert(
    { client_id: clientId, etapa, respostas, recorded_at, updated_at: new Date().toISOString() },
    { onConflict: 'client_id,etapa' },
  );
  if (error) throw error;
}

export async function fetchNutritionConsult(clientId) {
  const { data, error } = await supabase.from('profiles').select('nutrition_consult').eq('id', clientId).single();
  if (error) return false;
  return !!data?.nutrition_consult;
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
