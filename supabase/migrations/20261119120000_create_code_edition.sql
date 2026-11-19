-- EZD-613 (S15g; Q-0210; Q-0220; Q-0399; Q-0697 03 "Defaults data"; AC-EZD-613-1): the code edition settings.
--
-- 1. update_tenant_code_edition(p_code_edition, p_optional_load_calc): the one write of Settings > Code edition
--    (tenant stays select-only, the update_tenant_defaults pattern). It checks the caller's own
--    settings_code_edition row (42501), takes an edition from the v1 list ('fbc9_nec2023', Q-0220) or null to
--    leave it unchanged, and a boolean or null for the optional load-calc method default, stored as
--    tenant.defaults.optional_load_calc (22023 invalid_input otherwise). Under the tenant row lock; `changed`
--    lists what changed ('code_edition', 'optional_load_calc'); nothing changed means no update. It never
--    touches a project: each project keeps its own edition (S15g Save; AC-EZD-613-1).
-- 2. update_project_settings: copied from 20261116190000 with one more key, code_edition (an edition from the
--    same list), so Project settings sets the project's own edition (S15g Decision 2; Q-0399 lifted for the
--    code edition). It needs Edit model and no edit lock (it does not change the model). Every other rule is
--    unchanged. Grants unchanged.
-- The edition list matches app/src/lib/code-edition/editions.ts (editions-sql.test.ts).

create function private.is_code_edition(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value in ('fbc9_nec2023')
$$;
revoke all on function private.is_code_edition(text) from public, anon, authenticated, service_role;

create function public.update_tenant_code_edition(p_code_edition text, p_optional_load_calc boolean)
returns table (tenant_id uuid, code_edition text, tenant_defaults jsonb, changed text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_old public.tenant;
  v_edition text;
  v_defaults jsonb;
  v_changed text[] := array[]::text[];
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'settings_code_edition' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_code_edition is not null and not private.is_code_edition(p_code_edition) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_old from public.tenant t where t.id = v_tenant for update;
  v_edition := coalesce(p_code_edition, v_old.code_edition);
  v_defaults := case when p_optional_load_calc is null then v_old.defaults
    else v_old.defaults || jsonb_build_object('optional_load_calc', p_optional_load_calc) end;

  if v_edition is distinct from v_old.code_edition then
    v_changed := array_append(v_changed, 'code_edition');
  end if;
  if (v_defaults -> 'optional_load_calc') is distinct from (v_old.defaults -> 'optional_load_calc') then
    v_changed := array_append(v_changed, 'optional_load_calc');
  end if;

  if cardinality(v_changed) > 0 then
    update public.tenant t set code_edition = v_edition, defaults = v_defaults where t.id = v_tenant;
  end if;

  return query select t.id, t.code_edition, t.defaults, v_changed from public.tenant t where t.id = v_tenant;
end
$$;
revoke all on function public.update_tenant_code_edition(text, boolean) from public, anon, service_role;
grant execute on function public.update_tenant_code_edition(text, boolean) to authenticated;

create or replace function public.update_project_settings(
  p_project uuid,
  p_changes jsonb,
  p_lock_epoch bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_user uuid := private.app_user_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_edit boolean;
  v_client boolean;
  v_key text;
  v_project public.project;
  v_lock public.edit_lock;
  v_name text;
  v_address text;
  v_scope text;
  v_type text;
  v_customer uuid;
  v_edition text;
  v_old_copy jsonb;
  v_new_copy jsonb;
  v_changed text[] := array[]::text[];
  v_defaults_changed text[];
  v_needs_lock boolean := false;
begin
  perform private.require_api_gate();
  if v_tenant is null or v_user is null or v_membership is null or not exists (
    select 1 from public.membership m
    where m.id = v_membership and m.tenant_id = v_tenant and m.status = 'active'
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  v_edit := exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model' and up.granted);
  v_client := exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership and up.tenant_id = v_tenant
      and up.permission_key in ('settings_company', 'create_projects') and up.granted);
  if not v_edit and not v_client then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- The shape.
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_key in select k from jsonb_object_keys(p_changes) as k loop
    if v_key not in ('name', 'address', 'scope_of_work', 'type', 'customer_id', 'defaults', 'code_edition') then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end loop;
  if p_changes ? 'name' and (jsonb_typeof(p_changes -> 'name') <> 'string'
      or length(btrim(p_changes ->> 'name')) = 0 or length(p_changes ->> 'name') > 1000) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_changes ? 'address' and (jsonb_typeof(p_changes -> 'address') <> 'string'
      or length(btrim(p_changes ->> 'address')) = 0 or length(p_changes ->> 'address') > 1000) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_changes ? 'scope_of_work' and jsonb_typeof(p_changes -> 'scope_of_work') <> 'null' and (
      jsonb_typeof(p_changes -> 'scope_of_work') <> 'string'
      or length(p_changes ->> 'scope_of_work') > 20000) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_changes ? 'type' and (jsonb_typeof(p_changes -> 'type') <> 'string'
      or (p_changes ->> 'type') not in ('kitchen', 'bath', 'whole_home_interior')) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_changes ? 'customer_id' and jsonb_typeof(p_changes -> 'customer_id') <> 'null' and (
      jsonb_typeof(p_changes -> 'customer_id') <> 'string'
      or (p_changes ->> 'customer_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_changes ? 'code_edition' and (jsonb_typeof(p_changes -> 'code_edition') <> 'string'
      or not private.is_code_edition(p_changes ->> 'code_edition')) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_changes ? 'defaults' then
    perform private.check_project_defaults(p_changes -> 'defaults');
  end if;

  -- The edit_lock row first, then the project row.
  perform private.lock_edit_row(p_project, v_tenant);
  select * into v_project from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  v_name := case when p_changes ? 'name' then btrim(p_changes ->> 'name') else v_project.name end;
  v_address := case when p_changes ? 'address' then btrim(p_changes ->> 'address') else v_project.address end;
  v_scope := case when p_changes ? 'scope_of_work' then nullif(btrim(p_changes ->> 'scope_of_work'), '')
    else v_project.scope_of_work end;
  v_type := case when p_changes ? 'type' then p_changes ->> 'type' else v_project.type end;
  v_customer := case when p_changes ? 'customer_id' then (p_changes ->> 'customer_id')::uuid
    else v_project.customer_id end;
  v_edition := case when p_changes ? 'code_edition' then p_changes ->> 'code_edition'
    else v_project.code_edition end;
  v_old_copy := case when jsonb_typeof(v_project.settings -> 'defaults') = 'object'
    then v_project.settings -> 'defaults' else '{}'::jsonb end;
  v_new_copy := v_old_copy || coalesce(p_changes -> 'defaults', '{}'::jsonb);

  if v_name is distinct from v_project.name then v_changed := array_append(v_changed, 'name'); end if;
  if v_address is distinct from v_project.address then v_changed := array_append(v_changed, 'address'); end if;
  if v_scope is distinct from v_project.scope_of_work then v_changed := array_append(v_changed, 'scope_of_work'); end if;
  if v_edition is distinct from v_project.code_edition then
    v_changed := array_append(v_changed, 'code_edition');
  end if;
  if v_type is distinct from v_project.type then
    v_changed := array_append(v_changed, 'type');
    v_needs_lock := true;
  end if;
  select coalesce(array_agg(k order by k), array[]::text[]) into v_defaults_changed
  from jsonb_object_keys(v_new_copy) as k
  where (v_old_copy -> k) is distinct from (v_new_copy -> k);
  if cardinality(v_defaults_changed) > 0 then
    v_changed := v_changed || v_defaults_changed;
    v_needs_lock := true;
  end if;

  if (v_needs_lock or v_changed && array['name', 'address', 'scope_of_work', 'code_edition']) and not v_edit then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if v_customer is distinct from v_project.customer_id then
    if not v_client then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
    if v_customer is not null and not exists (
      select 1 from public.customer c
      where c.id = v_customer and c.tenant_id = v_tenant and c.archived_at is null
    ) then
      raise exception 'customer_unavailable' using errcode = '22023';
    end if;
    v_changed := array_append(v_changed, 'customer_id');
  end if;

  -- The lock, last: nothing may raise after an auto release.
  if v_needs_lock then
    if private.apply_edit_lock_deadline(p_project) then
      return jsonb_build_object('status', 'stale_lock_epoch');
    end if;
    select * into v_lock from public.edit_lock l where l.project_id = p_project;
    if p_lock_epoch is null or v_lock.holder_app_user_id is distinct from v_user
       or v_lock.lock_epoch <> p_lock_epoch then
      return jsonb_build_object('status', 'stale_lock_epoch');
    end if;
  end if;

  if cardinality(v_changed) > 0 then
    update public.project p
    set name = v_name,
      address = v_address,
      scope_of_work = v_scope,
      type = v_type,
      customer_id = v_customer,
      code_edition = v_edition,
      settings = case when cardinality(v_defaults_changed) > 0
        then jsonb_set(p.settings, '{defaults}', v_new_copy, true) else p.settings end
    where p.id = p_project and p.tenant_id = v_tenant;
  end if;

  return jsonb_build_object(
    'status', 'saved',
    'tenant_id', v_tenant,
    'changed', (select coalesce(jsonb_agg(c order by c), '[]'::jsonb) from unnest(v_changed) as c));
end
$$;
