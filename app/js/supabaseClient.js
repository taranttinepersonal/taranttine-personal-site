import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Safe to expose client-side: the publishable/anon key only works within
// what the Row Level Security policies on each table allow.
const SUPABASE_URL = 'https://zqopjmijrmlifwnzthfb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ce3Q3zOJmatnEIoEqM8kRw_53x6OrC3';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { SUPABASE_URL };

export function exerciseGifUrl(gifPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/exercise-gifs/${gifPath}`;
}
