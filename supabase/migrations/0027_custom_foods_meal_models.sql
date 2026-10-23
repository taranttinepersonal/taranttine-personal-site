-- Biblioteca da prescrição, editável pelo treinador no painel:
--   custom_foods: alimentos que a TACO não tem (whey, goma de tapioca,
--     produtos de rótulo) e receitas inteiras, com valores por 100 g.
--     so_unidade = true mostra a quantidade em unidades (ex: "1 porção")
--     em vez de gramas — usado nas receitas.
--   meal_models: refeições-modelo do cardápio automático. Um modelo com o
--     mesmo code de um modelo padrão substitui o padrão; ativo = false o
--     esconde. items = [[chave do alimento, gramas, papel], ...], onde a
--     chave é o código TACO (número) ou "c:<id>" para alimento próprio.
create table custom_foods (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  kcal numeric not null,
  prot numeric not null default 0,
  carb numeric not null default 0,
  gord numeric not null default 0,
  fibra numeric,
  grupo text,
  unidade_nome text,
  unidade_g numeric,
  so_unidade boolean not null default false,
  fonte text,
  created_at timestamptz not null default now()
);

create table meal_models (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  tipo text not null check (tipo in ('CAF', 'LAN', 'PRA', 'CEI')),
  nome text not null,
  items jsonb not null,
  ativo boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table custom_foods enable row level security;
alter table meal_models enable row level security;

create policy "trainer manages custom foods" on custom_foods for all
  using (is_trainer()) with check (is_trainer());
create policy "trainer manages meal models" on meal_models for all
  using (is_trainer()) with check (is_trainer());
