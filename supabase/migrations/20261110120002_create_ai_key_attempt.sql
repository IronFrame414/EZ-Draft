-- EZD-5601 M2 (vault/plans/EZD-5601.md section 1 Data; AC-EZD-5601-7): one row per key check a user starts, so
-- take_ai_key_attempt (M3) can allow 5 per 15 minutes per user. Rows hold ids and a time only. No API role
-- reads or writes it: RLS on with one deny-all policy, no anon or authenticated privilege.

create table public.ai_key_attempt (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  at timestamptz not null default now()
);

create index ai_key_attempt_tenant_user_at_idx on public.ai_key_attempt (tenant_id, app_user_id, at);
create index ai_key_attempt_at_idx on public.ai_key_attempt (at);
create index ai_key_attempt_app_user_id_idx on public.ai_key_attempt (app_user_id);

alter table public.ai_key_attempt enable row level security;

create policy ai_key_attempt_none on public.ai_key_attempt
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

revoke all on public.ai_key_attempt from public, anon, authenticated;
grant select, insert, update, delete on public.ai_key_attempt to service_role;

comment on table public.ai_key_attempt is 'Key checks started per user, rolling 15 minutes (EZD-5601)';
