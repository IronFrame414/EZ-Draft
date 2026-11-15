-- EZD-116 (S15d; Q-0697 decisions 03 "Defaults data", 10 "Phase 8 permissions"; 09o Copy at creation): the
-- Defaults write path and the per-project copy at creation.
--
-- update_tenant_defaults(p_set, p_remove): the one write to tenant.defaults (tenant stays select-only, the
-- update_tenant_identity pattern). It checks the caller's own settings_defaults row (42501), refuses a key
-- outside the registry's storable list or a value of the wrong JSON type (22023 invalid_input; the route checks
-- ranges and the rules between rows from the TypeScript registry, app/src/lib/defaults), and writes only the
-- keys sent: defaults - p_remove || p_set, under the tenant row lock, so two people saving different keys keep
-- both. `changed` lists the keys whose stored value changed, sorted; nothing changed means no update.
--
-- create_project and create_project_with_objects are copied from 20261113160001 with one trailing argument,
-- p_defaults jsonb default null, so every existing call still resolves. When given it must be an object of
-- per-project keys with number values of at least 0; it is stored as project.settings.defaults (apart from
-- plan_scale). Old signatures are dropped first, so PostgREST sees one function per name. Grants unchanged:
-- authenticated only, in GATED_RPC_CALLS. The key lists match app/src/lib/defaults/registry.ts
-- (registry-sql.test.ts).

create function private.defaults_key_type(p_key text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_key in ('plan_dimension_rounding', 'detail_dimension_rounding', 'cabinet_autofill_increment',
      'countertop_increment', 'snap_increment', 'wall_thickness', 'wall_drywall_each_side', 'wall_height',
      'wall_exterior_block', 'measurement_tolerance', 'high_confidence_cutoff', 'cabinet_fit_tolerance',
      'reference_change_tolerance', 'leader_snap_tolerance', 'walk_eye_height', 'overhang_standard',
      'overhang_seating_counter', 'overhang_seating_bar', 'overhang_against_wall', 'seating_support_limit',
      'fan_blade_clearance', 'load_warning_threshold', 'voltage_drop_warning', 'waste_tile', 'waste_lvp',
      'waste_drywall', 'waste_paint', 'waste_trim', 'waste_countertop', 'pattern_straight', 'pattern_diagonal',
      'pattern_herringbone', 'recently_added_window', 'version_cleanup_age', 'version_cleanup_grace',
      'edit_lock_auto_release', 'share_link_expiry', 'share_link_reminder_lead', 'webhook_retries')
      then 'number'
    when p_key in ('ipad_input', 'wall_stud', 'act_min_border') then 'string'
    when p_key in ('device_height_notes') then 'boolean'
    when p_key in ('detail_scales') then 'array'
    when p_key in ('field_measure_range') then 'object'
    else null
  end
$$;
revoke all on function private.defaults_key_type(text) from public, anon, authenticated, service_role;

create function public.update_tenant_defaults(p_set jsonb, p_remove text[])
returns table (tenant_id uuid, tenant_defaults jsonb, changed text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_old jsonb;
  v_new jsonb;
  v_key text;
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
      and up.permission_key = 'settings_defaults' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_set is null or jsonb_typeof(p_set) <> 'object' or p_remove is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_key in select k from jsonb_object_keys(p_set) as k loop
    if private.defaults_key_type(v_key) is null
       or jsonb_typeof(p_set -> v_key) <> private.defaults_key_type(v_key)
       or v_key = any (p_remove) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array p_remove loop
    if v_key is null or private.defaults_key_type(v_key) is null then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end loop;

  select t.defaults into v_old from public.tenant t where t.id = v_tenant for update;
  v_new := (v_old - p_remove) || p_set;

  select coalesce(array_agg(k order by k), array[]::text[]) into v_changed
  from (
    select k from jsonb_object_keys(v_old) as k
    union
    select k from jsonb_object_keys(v_new) as k
  ) keys(k)
  where (v_old -> k) is distinct from (v_new -> k);

  if cardinality(v_changed) > 0 then
    update public.tenant t set defaults = v_new where t.id = v_tenant;
  end if;

  return query select t.id, t.defaults, v_changed from public.tenant t where t.id = v_tenant;
end
$$;
revoke all on function public.update_tenant_defaults(jsonb, text[]) from public, anon, service_role;
grant execute on function public.update_tenant_defaults(jsonb, text[]) to authenticated;

-- The per-project copy check shared by both create functions.
create function private.check_project_defaults(p_defaults jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
begin
  if p_defaults is null then
    return;
  end if;
  if jsonb_typeof(p_defaults) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_key in select k from jsonb_object_keys(p_defaults) as k loop
    if v_key not in ('cabinet_autofill_increment', 'countertop_increment', 'overhang_standard',
        'overhang_seating_counter', 'overhang_seating_bar', 'overhang_against_wall', 'waste_tile',
        'waste_lvp', 'waste_drywall', 'waste_paint', 'waste_trim', 'waste_countertop')
       or jsonb_typeof(p_defaults -> v_key) <> 'number'
       or (p_defaults ->> v_key)::numeric < 0 then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
  end loop;
end
$$;
revoke all on function private.check_project_defaults(jsonb) from public, anon, authenticated, service_role;

drop function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid);
drop function public.create_project(text, text, text, uuid, text, uuid);

create function public.create_project(p_name text, p_address text, p_type text, p_customer_id uuid,
  p_scope_of_work text, p_foreman_membership_id uuid default null, p_defaults jsonb default null)
returns table (project_id uuid, tenant_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid; v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid; v_scope text; v_id uuid;
  v_foreman_scope text; v_foreman_user uuid; v_added integer;
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
  if p_customer_id is not null and not exists (select 1 from public.customer c
      where c.id = p_customer_id and c.tenant_id = v_tenant and c.archived_at is null) then
    raise exception 'customer_unavailable' using errcode = '22023'; end if;
  if p_foreman_membership_id is not null then
    select m.scope, m.user_id into v_foreman_scope, v_foreman_user from public.membership m
      where m.id = p_foreman_membership_id and m.tenant_id = v_tenant and m.status = 'active'
      for share;
    if v_foreman_scope is null then raise exception 'foreman_unavailable' using errcode = '22023'; end if;
  end if;
  insert into public.project (tenant_id, name, address, type, customer_id, scope_of_work, settings)
    values (v_tenant, p_name, p_address, p_type, p_customer_id, p_scope_of_work,
      case when p_defaults is null then '{}'::jsonb else jsonb_build_object('defaults', p_defaults) end)
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
revoke all on function public.create_project(text, text, text, uuid, text, uuid, jsonb) from public, anon, service_role;
grant execute on function public.create_project(text, text, text, uuid, text, uuid, jsonb) to authenticated;

create function public.create_project_with_objects(p_name text, p_address text, p_type text,
  p_customer_id uuid, p_scope_of_work text, p_objects jsonb, p_foreman_membership_id uuid default null,
  p_defaults jsonb default null)
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
      p_foreman_membership_id, p_defaults) c;
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
revoke all on function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid, jsonb) from public, anon, service_role;
grant execute on function public.create_project_with_objects(text, text, text, uuid, text, jsonb, uuid, jsonb) to authenticated;
