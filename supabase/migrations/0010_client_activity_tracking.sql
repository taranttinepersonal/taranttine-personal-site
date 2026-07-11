alter table profiles add column last_active_at timestamptz;
alter table profiles add column last_reminder_sent_at timestamptz;

-- Clients have no general UPDATE policy on profiles (only trainers do, via
-- "trainer manages profiles"), so this narrow RPC lets a client touch only
-- their own last_active_at without opening a broader self-update policy
-- that could otherwise let them edit their own role or other clients' rows.
create or replace function touch_last_active()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set last_active_at = now() where id = auth.uid();
$$;

grant execute on function touch_last_active() to authenticated;
