-- EZD-739 (Q-0764; Q-0779; S01 Step 1; vault/build/assumptions.md EZD-739): the four scope tick boxes,
-- Electrical, Plumbing, Mechanical and Reflected ceiling plan, stored on the project as project.scope_trades
-- (values 'electrical', 'plumbing', 'mechanical', 'rcp', in that order, no repeats). Unticked ('{}') on a new
-- project and on every existing one.
-- 1. The column and its check. The project table's RLS policies already cover it.
-- 2. private.scope_trades_of(p_value jsonb): the stored array from a jsonb array of the four values, in the
--    fixed order; null for anything else (not an array, another value, a repeat).
-- 3. create_project and create_project_with_objects: copied from 20261115120000 with one more trailing
--    argument, p_scope_trades text[] (null is none ticked); an unknown value or a repeat is invalid_input.
-- 4. update_project_settings: copied from 20261119120000 with one more key, scope_trades (a jsonb array, as 2),
--    changed with Edit model like the scope text, no edit lock; reported as changed only when the set differs.

alter table public.project add column scope_trades text[] not null default '{}'
  constraint project_scope_trades_check
  check (scope_trades <@ array['electrical', 'plumbing', 'mechanical', 'rcp']::text[]);

create function private.scope_trades_of(p_value jsonb)
returns text[]
language plpgsql immutable set search_path = ''
as $$
declare
  v_all constant text[] := array['electrical', 'plumbing', 'mechanical', 'rcp'];
  v_in text[];
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' then return null; end if;
  if exists (select 1 from jsonb_array_elements(p_value) e where jsonb_typeof(e) <> 'string') then
    return null;
  end if;
  select coalesce(array_agg(e), array[]::text[]) into v_in from jsonb_array_elements_text(p_value) e;
  if not (v_in <@ v_all) or cardinality(v_in) <> cardinality(array(select distinct x from unnest(v_in) x)) then
    return null;
  end if;
  return array(select a from unnest(v_all) with ordinality as t(a, n) where a = any (v_in) order by n);
end
$$;
revoke all on function private.scope_trades_of(jsonb) from public, anon, authenticated, service_role;

drop function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid, jsonb);
drop function public.create_project(text, text, text, uuid, text, uuid, jsonb);

create function public.create_project(p_name text, p_address text, p_type text, p_customer_id uuid,
  p_scope_of_work text, p_foreman_membership_id uuid default null, p_defaults jsonb default null,
  p_scope_trades text[] default null)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid; v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid; v_scope text; v_id uuid;
  v_foreman_scope text; v_foreman_user uuid; v_added integer; v_trades text[];
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  if v_tenant is null or v_membership is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  select m.scope into v_scope from public.membership m
    where m.id = v_membership and m.tenant_id = v_tenant and m.status = 'active';
  if v_scope is null then raise exception 'permission_denied' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_permission up where up.membership_id = v_membership
      and up.tenant_id = v_tenant and up.permission_key = 'create_projects' and up.granted) then
    raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_name is null or length(btrim(p_name)) = 0 or p_address is null or length(btrim(p_address)) = 0
     or p_type is null or p_type not in ('kitchen', 'bath', 'whole_home_interior') then
    raise exception 'invalid_input' using errcode = '22023'; end if;
  perform private.check_project_defaults(p_defaults);
  v_trades := private.scope_trades_of(to_jsonb(coalesce(p_scope_trades, array[]::text[])));
  if v_trades is null then raise exception 'invalid_input' using errcode = '22023'; end if;
  if p_customer_id is not null and not exists (select 1 from public.customer c
      where c.id = p_customer_id and c.tenant_id = v_tenant and c.archived_at is null) then
    raise exception 'customer_unavailable' using errcode = '22023'; end if;
  if p_foreman_membership_id is not null then
    select m.scope, m.user_id into v_foreman_scope, v_foreman_user from public.membership m
      where m.id = p_foreman_membership_id and m.tenant_id = v_tenant and m.status = 'active'
      for share;
    if v_foreman_scope is null then raise exception 'foreman_unavailable' using errcode = '22023'; end if;
  end if;
  insert into public.project (tenant_id, name, address, type, customer_id, scope_of_work, settings, scope_trades)
    values (v_tenant, p_name, p_address, p_type, p_customer_id, p_scope_of_work,
      case when p_defaults is null then '{}'::jsonb else jsonb_build_object('defaults', p_defaults) end,
      v_trades)
    returning id into v_id;
  if v_scope = 'listed' then
    insert into public.membership_project (tenant_id, membership_id, project_id) values (v_tenant, v_membership, v_id);
  end if;
  if v_foreman_scope = 'listed' then
    insert into public.membership_project (tenant_id, membership_id, project_id)
      values (v_tenant, p_foreman_membership_id, v_id)
      on conflict (membership_id, project_id) do nothing;
    get diagnostics v_added = row_count;
    if v_added > 0 then
      perform private.write_event_log_as('user.scope_changed', v_tenant, private.event_log_actor(),
        'membership', p_foreman_membership_id, jsonb_build_object('membershipId', p_foreman_membership_id,
          'appUserId', v_foreman_user, 'oldScope', 'listed', 'scope', 'listed',
          'added', jsonb_build_array(v_id), 'removed', '[]'::jsonb), null);
    end if;
  end if;
  return query select v_id, v_tenant;
end $$;
revoke all on function public.create_project(text, text, text, uuid, text, uuid, jsonb, text[]) from public, anon, service_role;
grant execute on function public.create_project(text, text, text, uuid, text, uuid, jsonb, text[]) to authenticated;

create function public.create_project_with_objects(p_name text, p_address text, p_type text,
  p_customer_id uuid, p_scope_of_work text, p_objects jsonb, p_foreman_membership_id uuid default null,
  p_defaults jsonb default null, p_scope_trades text[] default null)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_project uuid; v_tenant uuid; v_floor uuid; v_item jsonb; v_keys text array; v_id uuid; v_seen uuid array := '{}';
begin
  perform private.require_api_gate();
  select c.project_id, c.tenant_id into v_project, v_tenant
    from public.create_project(p_name, p_address, p_type, p_customer_id, p_scope_of_work,
      p_foreman_membership_id, p_defaults, p_scope_trades) c;
  if p_objects is null or jsonb_typeof(p_objects) <> 'array'
     or jsonb_array_length(p_objects) < 1 or jsonb_array_length(p_objects) > 5 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_objects) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from string_to_array('data,id,schema_version,type', ',')
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(jsonb_typeof(v_item -> 'type'), '') <> 'string'
      or coalesce((v_item ->> 'type') not in ('wall', 'room'), true)
      or coalesce(jsonb_typeof(v_item -> 'schema_version'), '') <> 'number'
      or coalesce((v_item ->> 'schema_version') !~ '^[1-9][0-9]{0,8}$', true)
      or coalesce(jsonb_typeof(v_item -> 'data'), '') <> 'object'
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
  end loop;
  select m.object_id into v_floor from public.model_object m
    where m.project_id = v_project and m.type = 'floor' and not m.deleted;
  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by)
  select v_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type',
    jsonb_set(e -> 'data', '{level}', to_jsonb(v_floor::text)), (e ->> 'schema_version')::integer, 1,
    private.app_user_id()
  from jsonb_array_elements(p_objects) as e;
  return query select v_project, v_tenant;
end
$$;
revoke all on function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid, jsonb, text[]) from public, anon, service_role;
grant execute on function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid, jsonb, text[]) to authenticated;

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
  v_trades text[];
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
    if v_key not in ('name', 'address', 'scope_of_work', 'type', 'customer_id', 'defaults', 'code_edition', 'scope_trades') then
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
  if p_changes ? 'scope_trades' and private.scope_trades_of(p_changes -> 'scope_trades') is null then
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
  v_trades := case when p_changes ? 'scope_trades' then private.scope_trades_of(p_changes -> 'scope_trades')
    else v_project.scope_trades end;
  v_old_copy := case when jsonb_typeof(v_project.settings -> 'defaults') = 'object'
    then v_project.settings -> 'defaults' else '{}'::jsonb end;
  v_new_copy := v_old_copy || coalesce(p_changes -> 'defaults', '{}'::jsonb);

  if v_name is distinct from v_project.name then v_changed := array_append(v_changed, 'name'); end if;
  if v_address is distinct from v_project.address then v_changed := array_append(v_changed, 'address'); end if;
  if v_scope is distinct from v_project.scope_of_work then v_changed := array_append(v_changed, 'scope_of_work'); end if;
  if v_edition is distinct from v_project.code_edition then
    v_changed := array_append(v_changed, 'code_edition');
  end if;
  if v_trades is distinct from v_project.scope_trades then
    v_changed := array_append(v_changed, 'scope_trades');
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

  if (v_needs_lock or v_changed && array['name', 'address', 'scope_of_work', 'code_edition', 'scope_trades']) and not v_edit then
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
      scope_trades = v_trades,
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
