-- Fase 1 do sistema de nutrição: registro de refeições (estimado por IA a
-- partir de descrição em texto livre) + meta calórica/macros por cliente.
-- O plano de dieta escrito (diet_plans) continua existindo à parte — isso
-- aqui é a camada de acompanhamento diário.
create table nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  calories int,
  protein_g int,
  carb_g int,
  fat_g int,
  updated_at timestamptz not null default now(),
  unique (client_id)
);

alter table nutrition_targets enable row level security;
create policy "client manages own nutrition target" on nutrition_targets for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());

create table food_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  logged_at date not null default current_date,
  meal_type text not null check (meal_type in ('cafe', 'almoco', 'jantar', 'lanche')),
  description text not null,
  calories numeric,
  protein_g numeric,
  carb_g numeric,
  fat_g numeric,
  source text not null default 'agent' check (source in ('agent', 'manual')),
  created_at timestamptz not null default now()
);
create index on food_entries (client_id, logged_at desc);

alter table food_entries enable row level security;
create policy "client manages own food entries" on food_entries for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());
