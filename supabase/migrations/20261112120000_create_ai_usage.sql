-- EZD-5602 M1, file 1 of 3 (vault/plans/EZD-5602.md section 1 Data; Q-0637 usage row; AC-EZD-5602-6): the
-- assistant's usage rows (who, when, model and cost of each billed prompt; cost_usd is the user's own Anthropic
-- bill, not company cost or sell). No API role reads or writes the table: RLS on with one deny-all policy, no anon
-- or authenticated privilege. The only way in is record_ai_usage (20261112120002_create_ai_assistant_functions.sql).

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  created_at timestamptz not null default now(),
  model text not null check (model in ('claude-sonnet-5-5', 'claude-opus-5-5')),
  cost_usd numeric(10, 6) not null check (cost_usd >= 0)
);

create index ai_usage_tenant_user_created_idx on public.ai_usage (tenant_id, app_user_id, created_at);
create index ai_usage_app_user_id_idx on public.ai_usage (app_user_id);

alter table public.ai_usage enable row level security;

create policy ai_usage_none on public.ai_usage
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

revoke all on public.ai_usage from public, anon, authenticated;
grant select, insert, update, delete on public.ai_usage to service_role;

comment on table public.ai_usage is 'Who, when, model and cost of each assistant prompt (EZD-5602)';
