import { supabase } from '../supabaseClient.js';

export async function fetchReferralProfile(clientId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('referral_code, full_name')
    .eq('id', clientId)
    .single();
  if (error) {
    console.error('fetchReferralProfile failed', error);
    return null;
  }
  return data;
}

export async function fetchReferrals(clientId) {
  const { data, error } = await supabase
    .from('referrals')
    .select('id, referred_name, status, created_at')
    .eq('referrer_id', clientId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchReferrals failed', error);
    return [];
  }
  return data;
}
