-- EZD-5602 M1, file 2 of 3 (vault/plans/EZD-5602.md section 1 Data; Q-0637 call path row; AC-EZD-5602-8): the
-- assistant's call slots (one prompt in flight, 30 per minute). No API role reads or writes the table: RLS on with
-- one deny-all policy, no anon or authenticated privilege. The only ways in are take_ai_assistant_slot and
-- release_ai_assistant_slot (20261112120002_create_ai_assistant_functions.sql).

create table public.ai_assistant_slot (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  app_user_id uuid not null references public.app_user (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_assistant_slot_tenant_user_started_idx
  on public.ai_assistant_slot (tenant_id, app_user_id, started_at);
create index ai_assistant_slot_started_at_idx on public.ai_assistant_slot (started_at);
create index ai_assistant_slot_app_user_id_idx on public.ai_assistant_slot (app_user_id);

alter table public.ai_assistant_slot enable row level security;

create policy ai_assistant_slot_none on public.ai_assistant_slot
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

revoke all on public.ai_assistant_slot from public, anon, authenticated;
grant select, insert, update, delete on public.ai_assistant_slot to service_role;

comment on table public.ai_assistant_slot is 'Assistant call slots: in flight and per minute (EZD-5602)';
