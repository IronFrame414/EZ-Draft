-- EZD-109 (vault/plans/EZD-109.md Build step 1; Q-0695 decisions 03 row 33; 03c event_log; 11 Security and
-- audit): the audit log. One row per audited change: company, actor (null for a system action), the actor's
-- name copied at write time (it outlives Remove and an app_user delete), action, object type and id,
-- details, the request IP (or null) and the time. Rows are kept for the life of the company: the
-- append-only trigger refuses every update and delete, except the actor foreign key's set-null and the
-- tenant delete cascade.
--
-- No API role reads or writes a row. RLS is on with one deny-all policy and the API request gate policy.
-- The table grants follow the default convention (authenticated holds the four data privileges, so the
-- policy is what refuses them):
-- the locked rls.audit.test.ts pins the TABLE_GRANTS key list, so a no-grant entry cannot be added
-- (vault/build/assumptions.md EZD-109; the EZD-107 role precedent). anon holds nothing.

create table public.event_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  actor_app_user_id uuid references public.app_user (id) on delete set null,
  actor_name text,
  action text not null check (
    char_length(action) <= 64 and action ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  object_type text not null check (object_type ~ '^[a-z][a-z_]{0,39}$'),
  object_id uuid not null,
  details jsonb not null default '{}'::jsonb check (
    jsonb_typeof(details) = 'object' and octet_length(details::text) <= 16384
  ),
  ip inet,
  at timestamptz not null default now(),
  constraint event_log_actor_name check (actor_app_user_id is null or actor_name is not null)
);

create index event_log_tenant_id_at_idx on public.event_log (tenant_id, at);
create index event_log_actor_app_user_id_idx on public.event_log (actor_app_user_id);

-- Append-only. A delete passes only when the company row is already gone (the tenant cascade, as
-- role_preset_guard in 20261024100002 relies on). An update passes only when it is the actor foreign key's
-- set-null and changes nothing else.
create function private.event_log_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.tenant t where t.id = old.tenant_id) then
      raise exception 'event_log_append_only' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if old.actor_app_user_id is not null and new.actor_app_user_id is null
    and (to_jsonb(new) - 'actor_app_user_id') = (to_jsonb(old) - 'actor_app_user_id')
  then
    return new;
  end if;
  raise exception 'event_log_append_only' using errcode = 'P0001';
end
$$;

revoke all on function private.event_log_append_only() from public;

create trigger event_log_append_only
  before update or delete on public.event_log
  for each row execute function private.event_log_append_only();

alter table public.event_log enable row level security;

create policy event_log_none on public.event_log
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

create policy event_log_api_gate on public.event_log as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.event_log from public, anon, authenticated;
grant select, insert, update, delete on public.event_log to authenticated;
grant select, insert, update, delete on public.event_log to service_role;

comment on table public.event_log is 'Audit log rows, append-only (EZD-109)';
