-- Phase 7: referral program. profiles.referral_code/referred_by already
-- exist from 0001 — this adds the lead-tracking table itself.
-- Reward mechanics are deliberately not modeled here (not defined yet);
-- status is just tracked and updated by hand.

create type referral_status as enum ('pendente', 'contatado', 'convertido', 'recompensado');

create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id) on delete cascade,
  referred_name text not null,
  referred_phone text,
  status referral_status not null default 'pendente',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table referrals enable row level security;
create policy "client views own referrals" on referrals for select
  using (referrer_id = auth.uid() or is_trainer());
create policy "trainer creates referrals" on referrals for insert
  with check (is_trainer());
create policy "trainer updates referrals" on referrals for update
  using (is_trainer());
create policy "trainer deletes referrals" on referrals for delete
  using (is_trainer());
