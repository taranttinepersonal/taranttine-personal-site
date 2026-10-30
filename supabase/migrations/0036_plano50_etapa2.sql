-- Plano 50 Dias, etapa 2: controle dos convites e das conversões em aluno.
alter table profiles add column if not exists plan_invited_at timestamptz;      -- quando o convite foi enviado (botão no painel)
alter table plan50_orders add column if not exists converted_at timestamptz;     -- quando a pessoa virou aluno efetivo
