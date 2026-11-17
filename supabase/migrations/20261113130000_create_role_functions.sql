-- EZD-107 (S15 Role card, New role, Save as new role, Validation, Events; Q-0695 decisions 03 row 35, 10 row 59;
-- board S15k): custom roles. Name rules on public.role, the roles list with holder counts, and the three
-- writes. Each write is security definer, runs private.require_api_gate() first and needs the caller's active
-- membership to hold settings_users (private.users_writer_tenant(), 42501 permission_denied). The company comes
-- from the claim; another company's role reads as unknown (P0002 role_not_found).
-- Member writes straight through the table are closed by dropping the insert, update and delete policies, so
-- no role change can skip settings_users or its event (the table grants stay: vault/build/assumptions.md
-- EZD-107). The same-transaction event_log row waits for EZD-109, as EZD-106's writes do.

-- Names: unique per company ignoring case and outer spaces (S15 Validation; AC-EZD-107-2). The presets are
-- rows of the same table, so a custom role named "foreman" is refused. 1000 is the app's name bound
-- (PROJECT_NAME_MAX, customers, company).
create unique index role_tenant_name_key on public.role (tenant_id, lower(btrim(name)));
alter table public.role add constraint role_name_length check (length(name) <= 1000);

drop policy role_insert on public.role;
drop policy role_update on public.role;
drop policy role_delete on public.role;

-- The checked switch set: every element a catalog key (no null), stored once each, in catalog order.
create function private.role_switch_set(p_granted text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_granted is null or array_position(p_granted, null) is not null
    or not (p_granted <@ private.permission_keys())
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return coalesce((
    select array_agg(k order by i)
    from unnest(private.permission_keys()) with ordinality as c(k, i)
    where k = any (p_granted)
  ), '{}'::text[]);
end
$$;

revoke all on function private.role_switch_set(text[]) from public;

-- The checked name: trimmed, not blank (22023 role_name_required), at most 1000 characters.
create function private.role_name(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_name, ''));
begin
  if v = '' then
    raise exception 'role_name_required' using errcode = '22023';
  end if;
  if length(v) > 1000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  return v;
end
$$;

revoke all on function private.role_name(text) from public;

-- The roles list (S15 Roles row, Role select): presets Owner, Designer, Foreman, Crew, then custom roles by
-- name. `holders` counts memberships of any status holding the role (the delete rule, Q-0695 03 row 35).
create function public.list_roles()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'preset', r.preset,
      'defaultPermissions', to_jsonb(r.default_permissions),
      'holders', (select count(*) from public.membership m where m.role_id = r.id))
    order by case r.preset when 'owner' then 0 when 'designer' then 1 when 'foreman' then 2
      when 'crew' then 3 else 4 end, lower(r.name), r.id), '[]'::jsonb)
  from public.role r;
$$;

revoke all on function public.list_roles() from public, anon, service_role;
grant execute on function public.list_roles() to authenticated;

-- New role (S15 New role; Save as new role): a custom role with the given name and switches.
create function public.create_role(p_name text, p_granted text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_name text;
  v_set text[];
  v_id uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_name := private.role_name(p_name);
  v_set := private.role_switch_set(p_granted);
  begin
    insert into public.role (tenant_id, name, preset, default_permissions)
    values (v_tenant, v_name, null, v_set)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'role_name_taken' using errcode = '23505';
  end;
  return jsonb_build_object('roleId', v_id, 'tenantId', v_tenant, 'name', v_name,
    'defaultPermissions', to_jsonb(v_set));
end
$$;

revoke all on function public.create_role(text, text[]) from public, anon, service_role;
grant execute on function public.create_role(text, text[]) to authenticated;

-- Edit a custom role (S15 Role card): its name and defaults only; holders keep their own switches (Q-0695
-- 03 row 35). Nothing changed writes nothing. A preset is P0001 preset_role_change_refused.
create function public.update_role(p_role_id uuid, p_name text, p_granted text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_name text;
  v_set text[];
  v_old public.role%rowtype;
  v_fields text[] := '{}';
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  if p_role_id is null then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;
  v_name := private.role_name(p_name);
  v_set := private.role_switch_set(p_granted);

  select * into v_old from public.role r
  where r.id = p_role_id and r.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;
  if v_old.preset is not null then
    raise exception 'preset_role_change_refused' using errcode = 'P0001';
  end if;

  if v_old.name is distinct from v_name then v_fields := v_fields || 'name'::text; end if;
  if v_old.default_permissions is distinct from v_set then
    v_fields := v_fields || 'default_permissions'::text;
  end if;

  if cardinality(v_fields) > 0 then
    begin
      update public.role r set name = v_name, default_permissions = v_set where r.id = p_role_id;
    exception when unique_violation then
      raise exception 'role_name_taken' using errcode = '23505';
    end;
  end if;

  return jsonb_build_object('roleId', p_role_id, 'tenantId', v_tenant, 'name', v_name,
    'defaultPermissions', to_jsonb(v_set), 'fields', to_jsonb(v_fields));
end
$$;

revoke all on function public.update_role(uuid, text, text[]) from public, anon, service_role;
grant execute on function public.update_role(uuid, text, text[]) to authenticated;

-- Delete a custom role (S15 Role card; Q-0695 03 row 35): only when no membership of any status holds it
-- (P0001 role_in_use). The role row is locked first; an assignment committed meanwhile holds the
-- membership's key share on the row, so the delete waits for it and then sees the holder. The foreign key
-- (20261024100004) is the backstop.
create function public.delete_role(p_role_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_old public.role%rowtype;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  select * into v_old from public.role r
  where r.id = p_role_id and r.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;
  if v_old.preset is not null then
    raise exception 'preset_role_change_refused' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.membership m where m.role_id = p_role_id) then
    raise exception 'role_in_use' using errcode = 'P0001';
  end if;
  begin
    delete from public.role r where r.id = p_role_id;
  exception when foreign_key_violation then
    raise exception 'role_in_use' using errcode = 'P0001';
  end;
  return jsonb_build_object('roleId', p_role_id, 'tenantId', v_tenant, 'name', v_old.name);
end
$$;

revoke all on function public.delete_role(uuid) from public, anon, service_role;
grant execute on function public.delete_role(uuid) to authenticated;
