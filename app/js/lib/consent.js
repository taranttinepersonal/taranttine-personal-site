import { supabase } from '../supabaseClient.js';

// Termo de consentimento (LGPD). Mudou o texto de forma relevante? Suba a
// versão: todo mundo aceita de novo.
export const CONSENT_VERSION = '2026-10b'; // igual a netlify/functions/read-labs-background.js

export const CONSENT_SECTIONS = [
  ['Quem cuida dos seus dados', 'Taranttine Junior (Taranttine Personal), Dourados/MS. Contato: WhatsApp (67) 99256-7211.'],
  ['Quais dados', 'Seus dados de identificação e contato; as respostas das anamneses (saúde, medicamentos, rotina, alimentação e relação com a comida); avaliações físicas e fotos; resultados e arquivos de exames de sangue; registros de refeições, check-ins e treinos.'],
  ['Para quê', 'Montar, entregar e ajustar o seu treino e o seu plano alimentar, acompanhar a sua evolução e falar com você sobre o acompanhamento. Nada de propaganda de terceiros.'],
  ['Dados de saúde', 'Pela Lei Geral de Proteção de Dados (Lei 13.709/2018, art. 11), dados de saúde são sensíveis e só podem ser usados com o seu consentimento específico, que você dá logo abaixo.'],
  ['Uso de inteligência artificial (opcional)', 'Duas autorizações separadas. Refeições: quando você descreve uma refeição, o texto da descrição — sem o seu nome — é enviado a um serviço de inteligência artificial (Anthropic, Claude) só para estimar calorias e macros. Exames: quando você ou o Taranttine enviam o PDF ou a foto de um exame, o arquivo vai para o mesmo serviço só para ler os valores, que são conferidos por uma pessoa antes de entrar na sua ficha. O laudo pode conter seu nome. Sem essas autorizações, os valores são digitados à mão.'],
  ['Com quem compartilhamos', 'Só com os serviços que fazem o app funcionar: hospedagem e banco de dados (Netlify e Supabase), notificações (Google Firebase) e, se você autorizar, a estimativa de refeições e a leitura de exames (Anthropic). Seus dados não são vendidos nem cedidos. Encaminhamento a outro profissional (médico, psicólogo) só com a sua concordância.'],
  ['Por quanto tempo', 'Enquanto durar o acompanhamento e, depois, pelo prazo que as normas profissionais e legais exigirem. O que não for obrigatório guardar é apagado quando você pedir.'],
  ['Seus direitos', 'Você pode ver, corrigir, levar os seus dados, pedir exclusão e retirar este consentimento quando quiser, pelo WhatsApp. Sem o consentimento dos dados de saúde, a consultoria nutricional não pode continuar.'],
  ['Menores de 18 anos', 'Precisam do consentimento de um responsável legal.'],
];

export async function fetchConsent(clientId) {
  const { data, error } = await supabase.from('consents').select('versao, dados_saude, uso_ia, uso_ia_exames, aceito_em')
    .eq('client_id', clientId).eq('versao', CONSENT_VERSION).maybeSingle();
  if (error) { console.error('fetchConsent failed', error); return null; }
  return data && data.dados_saude ? data : null;
}

export async function saveConsent(clientId, { usoIa, usoIaExames }) {
  const { error } = await supabase.from('consents').upsert({
    client_id: clientId, versao: CONSENT_VERSION, dados_saude: true, uso_ia: !!usoIa, uso_ia_exames: !!usoIaExames,
    aceito_em: new Date().toISOString(), user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'client_id,versao' });
  if (error) throw error;
}
