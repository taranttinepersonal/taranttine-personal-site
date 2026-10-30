import { supabase } from '../supabaseClient.js';

export const TRAINER_WHATSAPP = '5567992567211';

// Decide o que o aluno do Plano 50 Dias vê ao abrir o app. Quem não é do
// plano (todos os alunos atuais) passa direto: { state: 'ok' }.
//   onboard → ainda não respondeu o questionário (ficha não entregue)
//   hold    → triagem de saúde positiva: espera o treinador
//   expired → passaram os 50 dias (ou reembolso): tela de convite
export async function plano50Gate(session) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('plan, active, access_expires_at, plan_hold')
    .eq('id', session.user.id)
    .single();
  if (error || !profile || profile.plan !== 'plano50') return { state: 'ok', profile: null };

  const expired = profile.access_expires_at && new Date(profile.access_expires_at) < new Date();
  if (expired || profile.active === false) return { state: 'expired', profile };

  const { data: program } = await supabase
    .from('workout_programs').select('id').eq('client_id', session.user.id).eq('is_active', true).maybeSingle();
  if (program) return { state: 'ok', profile };
  return { state: profile.plan_hold ? 'hold' : 'onboard', profile };
}

export function daysLeft(profile) {
  if (!profile || !profile.access_expires_at) return null;
  return Math.max(0, Math.ceil((new Date(profile.access_expires_at) - new Date()) / 86400000));
}

export async function submitOnboarding(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/plano50-onboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não consegui enviar agora.');
  return data;
}
