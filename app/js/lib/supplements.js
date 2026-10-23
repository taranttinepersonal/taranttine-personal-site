// Suplementos do "Guia Prático de Bolso" (versão revisada, out/2026), com o
// nível de evidência de cada um e palavras que, se aparecerem nos
// medicamentos ou doenças da anamnese, geram um alerta na Prescrição.

export const SUPPLEMENTS = [
  {
    id: 'creatina', nome: 'Creatina', evidencia: 'forte',
    dose: '3–5 g/dia', horario: 'Qualquer hora, todo dia (contínuo)',
    cuidado: 'Evitar em histórico de problema renal.',
    alertas: [[['renal', 'rim', 'rins', 'nefr'], 'histórico renal: confirmar com o médico']],
  },
  {
    id: 'whey', nome: 'Whey protein', evidencia: 'forte',
    dose: '1 dose (≈ 30 g)', horario: 'Pós-treino ou entre refeições',
    cuidado: 'Conveniência para bater a proteína do dia, não substitui comida.',
    alertas: [[['alergia a leite', 'aplv', 'proteina do leite'], 'alergia ao leite: usar proteína vegetal'], [['lactose'], 'intolerância à lactose: preferir isolado ou hidrolisado']],
  },
  {
    id: 'cafeina', nome: 'Cafeína', evidencia: 'forte',
    dose: (w) => (w ? `${Math.round(w * 3)}–${Math.round(w * 6)} mg (3–6 mg/kg)` : '3–6 mg/kg'), horario: '≈ 60 min antes do treino',
    cuidado: 'Evitar em insônia, arritmia, ansiedade ou refluxo. Não tomar perto da hora de dormir.',
    alertas: [[['ansiedade', 'arritmia', 'cardi', 'hipertens', 'pressao alta', 'insonia', 'refluxo', 'panico'], 'condição que pede cautela com estimulante']],
  },
  {
    id: 'magnesio', nome: 'Magnésio (bisglicinato ou citrato)', evidencia: 'moderada',
    dose: '200–400 mg de magnésio elementar', horario: '30–60 min antes de dormir',
    cuidado: 'Cautela em insuficiência renal.',
    alertas: [[['renal', 'rim', 'rins'], 'histórico renal: confirmar com o médico']],
  },
  {
    id: 'berberina', nome: 'Berberina', evidencia: 'moderada',
    dose: '500 mg, 2–3x/dia', horario: 'Junto com as refeições · ciclos de 8–12 semanas',
    cuidado: 'Só para perfil metabólico específico. Interage com remédios de diabetes, pressão e anticoagulante.',
    alertas: [[['diabet', 'metformina', 'insulina', 'glicem', 'hipoglic', 'pressao', 'hipertens', 'anticoag', 'varfarina', 'gestant', 'gravid', 'amament', 'figado', 'hepat'], 'interação com medicação ou condição: só com aval médico']],
  },
  {
    id: 'nac', nome: 'NAC (N-acetilcisteína)', evidencia: 'limitada',
    dose: '600–1.200 mg/dia', horario: 'Qualquer hora',
    cuidado: 'Pode causar desconforto gástrico. Cautela em asma.',
    alertas: [[['asma'], 'asma: confirmar com o médico']],
  },
  {
    id: 'multi', nome: 'Multivitamínico', evidencia: 'limitada',
    dose: '1 dose, conforme rótulo', horario: 'Junto com uma refeição',
    cuidado: 'Fórmula sem megadose de vitamina A e ferro.',
    alertas: [],
  },
  {
    id: 'd3k2', nome: 'Vitamina D3 + K2', evidencia: 'moderada',
    dose: 'D3 1.000–2.000 UI + K2 100 mcg/dia', horario: 'Junto com refeição com gordura',
    cuidado: 'Acima de 4.000 UI/dia de D3, só com exame acompanhando.',
    alertas: [[['anticoag', 'varfarina', 'marevan'], 'vitamina K interage com anticoagulante: só com aval médico']],
  },
  {
    id: 'vitc', nome: 'Vitamina C', evidencia: 'limitada',
    dose: '500 mg/dia', horario: 'Qualquer hora',
    cuidado: 'Dose alta contínua pode atrapalhar parte da adaptação ao treino. Cautela com pedra nos rins.',
    alertas: [[['calculo renal', 'pedra nos rins', 'pedra no rim', 'litiase'], 'histórico de cálculo renal']],
  },
  {
    id: 'coq10', nome: 'Ubiquinol (CoQ10)', evidencia: 'limitada',
    dose: '100–200 mg/dia', horario: 'Junto com refeição com gordura',
    cuidado: 'Mais indicado para quem usa estatina ou tem 40+. Leve efeito de baixar a pressão.',
    alertas: [[['pressao baixa', 'hipotens', 'anticoag', 'varfarina'], 'pressão baixa ou anticoagulante: cautela']],
  },
  {
    id: 'selenio', nome: 'Selênio', evidencia: 'limitada',
    dose: '55–100 mcg/dia', horario: 'Junto com refeição',
    cuidado: 'Margem estreita: nunca passar de 400 mcg/dia nem usar dose alta sem pausa.',
    alertas: [],
  },
  {
    id: 'ala', nome: 'Ácido alfa-lipoico', evidencia: 'limitada',
    dose: '300–600 mg/dia', horario: 'Preferência em jejum, se tolerar',
    cuidado: 'Baixa a glicemia: não combinar com berberina ou remédio de diabetes sem aval médico.',
    alertas: [[['diabet', 'metformina', 'insulina', 'glicem', 'hipoglic'], 'risco de hipoglicemia com a medicação']],
  },
  {
    id: 'carnitina', nome: 'L-carnitina', evidencia: 'limitada',
    dose: '1–2 g/dia', horario: 'Antes do treino',
    cuidado: 'Efeito pequeno; só faz diferença junto com treino e déficit calórico.',
    alertas: [],
  },
];

export const EVIDENCE_LABEL = { forte: 'Evidência forte', moderada: 'Evidência moderada', limitada: 'Evidência limitada' };

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function defaultDose(sup, weightKg) {
  return typeof sup.dose === 'function' ? sup.dose(Number(weightKg) || 0) : sup.dose;
}

// Alertas do suplemento para este cliente, a partir do texto da anamnese
// (medicamentos, doenças e, se houver, outras respostas relevantes).
export function supplementAlerts(sup, healthText) {
  const t = norm(healthText);
  if (!t) return [];
  const hit = w => { const n = norm(w); return n.length <= 5 ? new RegExp(`(^|[^a-z])${n}`).test(t) : t.includes(n); };
  return sup.alertas.filter(([words]) => words.some(hit)).map(([, msg]) => msg);
}
