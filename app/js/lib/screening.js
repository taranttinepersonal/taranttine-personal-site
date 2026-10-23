// Triagem de encaminhamento: sinais na anamnese, no perfil e nos check-ins
// que pedem avaliação de outro profissional antes (ou junto) do plano.
// Não é diagnóstico — é um aviso para o treinador decidir e encaminhar.
//
// nivel: 'encaminhar' (avaliar antes de seguir com o plano) ou
//        'atencao' (seguir, mas com cuidado e/ou em conjunto).

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function filled(v) {
  const t = norm(v).trim();
  return t && !/^(nao|nenhum|nenhuma|-|n\/a|nada)$/.test(t);
}
// Palavras curtas (rim, rins, cardi...) só batem como início de palavra,
// para "primeiro" não virar "rim".
function has(text, words) {
  const t = norm(text);
  return words.some(w => (w.length <= 5 ? new RegExp(`(^|[^a-z])${w}`).test(t) : t.includes(w)));
}

const SCOFF_KEYS = [
  'SCOFF · Provoca vômito por se sentir cheio(a) demais?',
  'SCOFF · Sente que perdeu o controle sobre o quanto come?',
  'SCOFF · Perdeu mais de 6 kg em 3 meses recentemente?',
  'SCOFF · Se acha gordo(a) mesmo quando dizem que está magro(a)?',
  'SCOFF · Diria que a comida domina a sua vida?',
];

export function scoffScore(r2) {
  const answered = SCOFF_KEYS.filter(k => r2?.[k]);
  if (!answered.length) return null;
  return SCOFF_KEYS.filter(k => r2?.[k] === 'Sim').length;
}

// ctx = { idade, sexo, saude: {medicamentos, doencas, cirurgias}, r1, r2, checkins }
export function screen(ctx) {
  const out = [];
  const add = (nivel, titulo, motivo, para) => out.push({ nivel, titulo, motivo, para });
  const r1 = ctx.r1 || {}, r2 = ctx.r2 || {};
  const saude = [ctx.saude?.medicamentos, ctx.saude?.doencas, ctx.saude?.cirurgias].filter(Boolean).join(' · ');
  const mulher = norm(ctx.sexo).startsWith('f');

  const scoff = scoffScore(r2);
  if (scoff != null && scoff >= 2) add('encaminhar', 'Possível transtorno alimentar', `SCOFF com ${scoff} de 5 respostas "sim"`, 'psicólogo e médico');
  if (filled(r2['Diagnóstico de transtorno alimentar'])) add('encaminhar', 'Transtorno alimentar informado', String(r2['Diagnóstico de transtorno alimentar']), 'acompanhamento conjunto com psicólogo/psiquiatra');
  if (r2['Come por ansiedade ou emoção'] === 'Com frequência' && r2['Sente culpa depois de comer'] === 'Com frequência') add('atencao', 'Alimentação emocional frequente', 'come por emoção e sente culpa com frequência', 'considerar psicólogo; evitar plano restritivo');

  if (mulher && r2['Ciclo menstrual'] === 'Não menstrua' && (ctx.idade == null || ctx.idade < 45) && !['Gestante', 'Amamentando', 'Menopausa'].includes(r2['Fase'])) {
    add('encaminhar', 'Ausência de menstruação', 'sem menstruação antes dos 45 anos: pode indicar baixa disponibilidade de energia (REDs) ou outra causa', 'ginecologista');
  }
  if (['Gestante', 'Amamentando'].includes(r2['Fase'])) add('atencao', r2['Fase'] === 'Gestante' ? 'Gestação' : 'Amamentação', 'necessidades aumentadas; sem déficit agressivo nem suplementos sem aval', 'médico obstetra/pediatra junto');

  if (ctx.idade != null && ctx.idade < 18) add('atencao', 'Menor de idade', `${ctx.idade} anos: plano com responsável ciente e sem restrição agressiva`, 'pediatra, se houver alteração de peso');

  if (has(saude, ['insulina', 'glibenclamida', 'gliclazida', 'glimepirida', 'sulfonil'])) add('encaminhar', 'Diabetes com medicação que causa hipoglicemia', 'mudar o carboidrato pode exigir ajuste da medicação', 'médico antes de reduzir carboidrato');
  else if (has(saude, ['diabet', 'metformina', 'glicem'])) add('atencao', 'Diabetes ou alteração de glicemia', 'acompanhar glicemia ao mudar a dieta', 'médico informado');
  if (has(saude, ['renal', 'rim', 'rins', 'nefr', 'dialise'])) add('encaminhar', 'Doença renal', 'proteína alta e creatina só com liberação', 'nefrologista');
  if (has(saude, ['cardi', 'infarto', 'arritmia', 'insuficiencia cardiaca', 'marcapasso'])) add('atencao', 'Condição cardíaca', 'liberação médica para treino e sem estimulantes', 'cardiologista');
  if (has(saude, ['hepat', 'cirrose', 'figado'])) add('encaminhar', 'Doença no fígado', 'ajustes de dieta e suplementos dependem do quadro', 'hepatologista/gastro');
  if (has(saude, ['cancer', 'oncolog', 'quimio', 'tumor'])) add('encaminhar', 'Tratamento oncológico', 'necessidades específicas durante e após o tratamento', 'oncologista e nutricionista oncológico');
  if (has(saude, ['bariatric', 'gastroplast', 'bypass', 'sleeve'])) add('encaminhar', 'Cirurgia bariátrica', 'plano pós-bariátrico tem regras próprias (volume, proteína, suplementação)', 'equipe da bariátrica');
  if (has(saude, ['tireo', 'hipotireo', 'hipertireo', 'levotiroxina', 'puran'])) add('atencao', 'Alteração de tireoide', 'pode mudar o gasto e o peso; manter exames em dia', 'endocrinologista');
  if (has(saude, ['celiac', 'doenca de crohn', 'crohn', 'retocolite', 'colite'])) add('atencao', 'Doença intestinal', 'restrições alimentares específicas', 'gastroenterologista');

  if (r2['Frequência do intestino'] === '3x por semana ou menos') add('atencao', 'Intestino preso', 'evacua 3x por semana ou menos', 'médico se persistir mesmo com fibra e água');

  const pesos = (ctx.checkins || []).filter(c => Number(c.respostas?.peso) > 0);
  if (pesos.length >= 2) {
    const ult = pesos[0], ant = pesos[pesos.length - 1];
    const semanas = Math.max(1, Math.round((new Date(ult.week_start) - new Date(ant.week_start)) / (7 * 86400000)));
    const perda = (Number(ant.respostas.peso) - Number(ult.respostas.peso)) / Number(ant.respostas.peso);
    if (perda / semanas > 0.015) add('atencao', 'Perda de peso rápida', `${(perda * 100).toFixed(1).replace('.', ',')}% em ${semanas} semana(s) (mais de 1,5% por semana)`, 'rever o déficit; médico se não for intencional');
  }

  return out.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'encaminhar' ? -1 : 1));
}

export function screeningHtml(items, esc) {
  return `
    <div class="admin-card rx-screen ${items.some(i => i.nivel === 'encaminhar') ? 'red' : items.length ? 'amber' : 'ok'}">
      <div class="admin-section-title" style="margin-top:0;">🩺 Triagem de encaminhamento</div>
      ${items.length ? items.map(i => `
        <div class="rx-screen-item ${i.nivel}">
          <b>${i.nivel === 'encaminhar' ? '⛔ Encaminhar' : '⚠️ Atenção'} · ${esc(i.titulo)}</b>
          <span>${esc(i.motivo)} → <b>${esc(i.para)}</b></span>
        </div>`).join('') : '<div class="admin-row-sub">✅ Nenhum sinal de alerta com o que está registrado.</div>'}
      <div class="admin-row-sub" style="margin-top:8px;">Triagem não é diagnóstico: indica quando outro profissional precisa avaliar. Ela usa a anamnese de treino, as duas etapas da anamnese nutricional (inclui o SCOFF) e os check-ins.</div>
    </div>
  `;
}
