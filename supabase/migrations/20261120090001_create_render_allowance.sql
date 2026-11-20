-- EZD-1102 (S15f; R24 #18; 03d render_allowance; 13b R2): the company render allowance in dollars. No row until
-- the owner first saves it; the first save sets balance_usd = amount_usd and last_refilled_at = now(). EZD-1117
-- spends and refills it. Members read their own company's row and write only through save_render_settings
-- (20261120090002).

create table public.render_allowance (
  tenant_id uuid primary key references public.tenant (id) on delete cascade,
  amount_usd numeric(12, 2) not null check (amount_usd > 0),
  balance_usd numeric(12, 2) not null,
  refill_amount_usd numeric(12, 2) not null check (refill_amount_usd > 0),
  last_refilled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.render_allowance enable row level security;
create trigger render_allowance_set_updated_at before update on public.render_allowance
  for each row execute function public.set_updated_at();

create policy render_allowance_select on public.render_allowance for select to authenticated
  using (tenant_id = (select private.tenant_id()));
create policy render_allowance_api_gate on public.render_allowance as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant; no write policy (as render_tier_model).
grant select, insert, update, delete on public.render_allowance to authenticated;
grant select, insert, update, delete on public.render_allowance to service_role;
comment on table public.render_allowance is 'Data model entity: render_allowance (03d; EZD-1102)';
