-- EZD-130 (Q-0697 decisions 03 "Defaults data", 10 "Phase 8 permissions"; Q-0202; Q-0400; Q-0399; R24 #16 (a);
-- S15d Decision 4; 09o Copy at creation rows 1-3): the Project settings write.
--
-- update_project_settings(p_project, p_changes, p_lock_epoch) changes one project's name, address, scope of work,
-- type, client and its own copy of the per-project defaults (project.settings.defaults). p_changes is an object
-- with any of the keys name, address, scope_of_work, type, customer_id, defaults; any other key (code edition,
-- submittal profile, ...) is refused, so nothing is stored for them (Q-0399). Only the values that differ from
-- the stored ones count as changes; nothing changed means no write.
--
-- Who may change what (the first failing step decides; the whole save is refused, never half applied):
--   * gate, claims and an active membership, else 42501;
--   * a granted edit_model, settings_company or create_projects row, else 42501;
--   * project scope, else P0002;
--   * the shape of p_changes, else 22023 (name and address not blank, at most 1,000 characters; scope of work at
--     most 20,000; type one of three; customer_id a uuid or null; defaults through check_project_defaults);
--   * name, address, scope of work, type and defaults need edit_model (42501);
--   * a client change needs settings_company or create_projects (42501) and an active customer of the
--     company (22023 customer_unavailable), as create_project;
--   * a type or defaults change needs the caller to hold the edit lock with p_lock_epoch equal to the stored
--     epoch, checked under the edit_lock row lock after an expired request is applied; otherwise the answer is
--     { status: 'stale_lock_epoch' } without raising, so an auto release commits.
-- The edit_lock row is locked first, then the project row (the order set_checkpoint_thumbnail uses).
-- defaults are merged into the project's copy (|| keeps the other keys and plan_scale); tenant.defaults and
-- every other project are never touched. Answers { status: 'saved', tenant_id, changed } with the changed keys
-- sorted (field names and per-project default keys). Executable by authenticated only; in GATED_RPC_CALLS.

create function public.update_project_settings(
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
    if v_key not in ('name', 'address', 'scope_of_work', 'type', 'customer_id', 'defaults') then
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
  v_old_copy := case when jsonb_typeof(v_project.settings -> 'defaults') = 'object'
    then v_project.settings -> 'defaults' else '{}'::jsonb end;
  v_new_copy := v_old_copy || coalesce(p_changes -> 'defaults', '{}'::jsonb);

  if v_name is distinct from v_project.name then v_changed := array_append(v_changed, 'name'); end if;
  if v_address is distinct from v_project.address then v_changed := array_append(v_changed, 'address'); end if;
  if v_scope is distinct from v_project.scope_of_work then v_changed := array_append(v_changed, 'scope_of_work'); end if;
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

  if (v_needs_lock or v_changed && array['name', 'address', 'scope_of_work']) and not v_edit then
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

revoke all on function public.update_project_settings(uuid, jsonb, bigint) from public, anon, service_role;
grant execute on function public.update_project_settings(uuid, jsonb, bigint) to authenticated;
