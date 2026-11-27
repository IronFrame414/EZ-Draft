-- EZD-614 (S15e Controls "Appliance rating defaults | Fallback ratings (volts, amps or VA) per appliance type when a
-- catalog item lacks specs | Plan Round 15. Owner enters (Round 24)"; S09:54 "load calc reads ratings from catalog
-- specs first, then standard defaults"; Q-0766 "every company can edit, add and delete rows"; assumptions EZD-614).
--
-- appliance_rating_default: the company's fallback rating per appliance type. VA = volts x amps. One row per type and
-- company; the type is the id the load calc looks up (a fixture kind, `microwave`, `wall_oven`, the panel's `ac`), kept
-- as a format check, not a list, so EZD-640 can add types without a migration. Volts are 120 or 240 (09b:35; Q-0704).
-- A company starts with no rows (Owner enters); EZD-640 seeds the researched list.
--
-- Every member of the company reads its rows (the load calc runs for anyone who opens the editor or the sheets). No
-- member writes the table directly: save_appliance_rating_defaults replaces the company's list and checks the
-- Catalog settings switch (settings_catalog) itself.

create table public.appliance_rating_default (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  appliance_type text not null check (appliance_type ~ '^[a-z][a-z0-9_]{0,39}$'),
  name text not null check (length(btrim(name)) > 0 and length(name) <= 80),
  volts integer not null check (volts in (120, 240)),
  amps numeric(7, 2) not null check (amps > 0 and amps <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, appliance_type)
);

alter table public.appliance_rating_default enable row level security;

create trigger appliance_rating_default_set_updated_at before update on public.appliance_rating_default
  for each row execute function public.set_updated_at();

create policy appliance_rating_default_select on public.appliance_rating_default for select to authenticated
  using (tenant_id = (select private.tenant_id()));

create policy appliance_rating_default_api_gate on public.appliance_rating_default as restrictive for all
  to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.appliance_rating_default to authenticated;
grant select, insert, update, delete on public.appliance_rating_default to service_role;

comment on table public.appliance_rating_default is
  'Company appliance rating defaults (S15e; EZD-614): the load calc''s fallback rating per appliance type.';

-- The list as rows; a value that does not fit its column raises a data exception the save turns into 22023.
create function private.appliance_rating_rows(p_rows jsonb)
returns table (appliance_type text, name text, volts integer, amps numeric(7, 2))
language sql
immutable
set search_path = ''
as $$
  select r ->> 'appliance_type', r ->> 'name', (r ->> 'volts')::integer, (r ->> 'amps')::numeric(7, 2)
  from jsonb_array_elements(p_rows) r;
$$;

revoke all on function private.appliance_rating_rows(jsonb) from public, anon, authenticated, service_role;

-- Save: the whole list replaces the company's rows (types not in it are deleted). p_rows is a JSON array of
-- { appliance_type, name, volts, amps }. Refused 42501 without settings_catalog, 22023 on a malformed list or a type
-- listed twice. Returns the types added, changed or removed (empty when nothing changed), for catalog.settings_updated.
create function public.save_appliance_rating_defaults(p_rows jsonb)
returns table (tenant_id uuid, changed text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_changed text[];
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'settings_catalog' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) r
    where jsonb_typeof(r) <> 'object'
      or jsonb_typeof(r -> 'appliance_type') <> 'string'
      or jsonb_typeof(r -> 'name') <> 'string'
      or jsonb_typeof(r -> 'volts') <> 'number'
      or jsonb_typeof(r -> 'amps') <> 'number'
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_rows) with ordinality a(r, i)
    join jsonb_array_elements(p_rows) with ordinality b(r, j)
      on a.r ->> 'appliance_type' = b.r ->> 'appliance_type' and a.i < b.j
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  begin
    select coalesce(array_agg(t order by t), array[]::text[]) into v_changed from (
      select coalesce(n.appliance_type, o.appliance_type) as t
      from private.appliance_rating_rows(p_rows) n
      full join (select * from public.appliance_rating_default a where a.tenant_id = v_tenant) o
        on o.appliance_type = n.appliance_type
      where o.id is null or n.appliance_type is null
        or o.name is distinct from n.name or o.volts is distinct from n.volts or o.amps is distinct from n.amps
    ) c;

    delete from public.appliance_rating_default a
    where a.tenant_id = v_tenant
      and not exists (
        select 1 from private.appliance_rating_rows(p_rows) n where n.appliance_type = a.appliance_type
      );
    insert into public.appliance_rating_default as a (tenant_id, appliance_type, name, volts, amps)
    select v_tenant, n.appliance_type, n.name, n.volts, n.amps from private.appliance_rating_rows(p_rows) n
    on conflict (tenant_id, appliance_type) do update
      set name = excluded.name, volts = excluded.volts, amps = excluded.amps
      where (a.name, a.volts, a.amps) is distinct from (excluded.name, excluded.volts, excluded.amps);
  exception when check_violation or not_null_violation or data_exception then
    raise exception 'invalid_input' using errcode = '22023';
  end;

  return query select v_tenant, v_changed;
end
$$;

revoke all on function public.save_appliance_rating_defaults(jsonb) from public, anon, service_role;
grant execute on function public.save_appliance_rating_defaults(jsonb) to authenticated;
