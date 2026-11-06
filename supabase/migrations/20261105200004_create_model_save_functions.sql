-- EZD-120a Build step 3 (vault/plans/EZD-120a.md section 1 M5, M6, Grants; 03b rules 6, 7, 9; Q-0507 gap 16;
-- AC-EZD-120a-1 to -5): the only writers of the working copy and its checkpoints.
--
-- save_objects: the first failing step decides. Gate (EZD-190); no tenant, user or membership claim 42501;
-- no granted Edit model switch 42501; project missing or out of scope P0002; a negative or missing lock
-- epoch or a change list outside the parseSaveRequest rules 22023. Then the project's edit_lock row is locked
-- (made at the first save, generation 0); a different generation is stale_lock_epoch, and any change whose
-- base_seq differs from the stored sequence (0 when no row) refuses the whole save with every conflict
-- listed. Neither writes an object. Otherwise new objects are written at sequence 1 and the rest move up by 1.
create function public.save_objects(p_project uuid, p_lock_epoch bigint, p_changes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
  v_epoch bigint;
  v_item jsonb;
  v_keys text[];
  v_deleted boolean;
  v_id uuid;
  v_seen uuid[] := '{}';
  v_conflicts jsonb;
  v_objects jsonb;
begin
  -- (1)
  perform private.require_api_gate();

  -- (2)
  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- (3)
  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- (4)
  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- (5) the rules of parseSaveRequest, in snake keys.
  if p_lock_epoch is null or p_lock_epoch < 0
    or p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_changes) as e loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(jsonb_typeof(v_item -> 'deleted'), '') <> 'boolean' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_deleted := (v_item ->> 'deleted')::boolean;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from (case when v_deleted
        then array['base_seq', 'deleted', 'id']
        else array['base_seq', 'data', 'deleted', 'id', 'schema_version', 'type'] end)
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(jsonb_typeof(v_item -> 'base_seq'), '') <> 'number'
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    -- Separate statements, so a number is only cast once its JSON type is known.
    if (v_item ->> 'base_seq')::numeric <> trunc((v_item ->> 'base_seq')::numeric)
      or (v_item ->> 'base_seq')::numeric < (case when v_deleted then 1 else 0 end)
      or (v_item ->> 'base_seq')::numeric > 2147483647
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    if not v_deleted then
      if coalesce(jsonb_typeof(v_item -> 'type'), '') <> 'string'
        or (v_item ->> 'type') !~ '^[a-z][a-z0-9_]*$'
        or coalesce(jsonb_typeof(v_item -> 'schema_version'), '') <> 'number'
        or coalesce(jsonb_typeof(v_item -> 'data'), '') <> 'object'
      then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
      if (v_item ->> 'schema_version')::numeric <> trunc((v_item ->> 'schema_version')::numeric)
        or (v_item ->> 'schema_version')::numeric < 1
        or (v_item ->> 'schema_version')::numeric > 2147483647
      then
        raise exception 'invalid_input' using errcode = '22023';
      end if;
    end if;
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
  end loop;

  -- (6) one save at a time per project: the edit_lock row is locked for the rest of the transaction.
  select l.lock_epoch into v_epoch from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    if p_lock_epoch <> 0 then
      return jsonb_build_object('status', 'stale_lock_epoch');
    end if;
    insert into public.edit_lock (project_id, tenant_id) values (p_project, v_tenant)
      on conflict (project_id) do nothing;
    select l.lock_epoch into v_epoch from public.edit_lock l where l.project_id = p_project for update;
  end if;

  -- (7)
  if v_epoch <> p_lock_epoch then
    return jsonb_build_object('status', 'stale_lock_epoch');
  end if;

  -- (8)
  select coalesce(
    jsonb_agg(jsonb_build_object('object_id', c.object_id, 'server_seq', coalesce(o.updated_seq, 0))
      order by c.object_id),
    '[]'::jsonb)
  into v_conflicts
  from (
    select (e ->> 'id')::uuid as object_id, (e ->> 'base_seq')::numeric::integer as base_seq
    from jsonb_array_elements(p_changes) as e
  ) c
  left join public.model_object o on o.project_id = p_project and o.object_id = c.object_id
  where c.base_seq <> coalesce(o.updated_seq, 0);

  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('status', 'conflict', 'conflicts', v_conflicts);
  end if;

  -- (9) no count cap.
  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by, deleted)
  select p_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type', e -> 'data', (e ->> 'schema_version')::numeric::integer,
    1, v_user, (e ->> 'deleted')::boolean
  from jsonb_array_elements(p_changes) as e
  where (e ->> 'base_seq')::numeric::integer = 0;

  update public.model_object o
  set type = coalesce(c.e ->> 'type', o.type),
      data = coalesce(c.e -> 'data', o.data),
      schema_version = coalesce((c.e ->> 'schema_version')::numeric::integer, o.schema_version),
      deleted = (c.e ->> 'deleted')::boolean,
      updated_seq = o.updated_seq + 1,
      updated_at = now(),
      updated_by = v_user
  from (
    select e, (e ->> 'id')::uuid as object_id
    from jsonb_array_elements(p_changes) as e
    where (e ->> 'base_seq')::numeric::integer > 0
  ) c
  where o.project_id = p_project and o.object_id = c.object_id;

  -- (10)
  select coalesce(
    jsonb_agg(jsonb_build_object('object_id', o.object_id, 'updated_seq', o.updated_seq) order by o.object_id),
    '[]'::jsonb)
  into v_objects
  from public.model_object o
  where o.project_id = p_project and o.object_id = any (v_seen);

  return jsonb_build_object('status', 'saved', 'tenant_id', v_tenant, 'objects', v_objects);
end
$$;

revoke all on function public.save_objects(uuid, bigint, jsonb) from public, anon, service_role;
grant execute on function public.save_objects(uuid, bigint, jsonb) to authenticated;

-- make_checkpoint (invoker; for the definer callers, now create_checkpoint and later EZD-121/122): one
-- model_version holding the project's live (non-deleted) objects by object_id, its parent the newest
-- version, under the same edit_lock row lock as a save, so a checkpoint never sees half a save.
create function private.make_checkpoint(p_project uuid, p_actor uuid)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_parent uuid;
  v_id uuid;
begin
  select p.tenant_id into v_tenant from public.project p where p.id = p_project;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  perform 1 from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    insert into public.edit_lock (project_id, tenant_id) values (p_project, v_tenant)
      on conflict (project_id) do nothing;
    perform 1 from public.edit_lock l where l.project_id = p_project for update;
  end if;

  select v.id into v_parent from public.model_version v
  where v.project_id = p_project
  order by v.created_at desc, v.id desc
  limit 1;

  insert into public.model_version (project_id, tenant_id, model_json, schema_version, parent_version_id, created_by)
  select p_project, v_tenant,
    jsonb_build_object('objects', coalesce(
      jsonb_agg(jsonb_build_object(
        'id', o.object_id, 'type', o.type, 'schema_version', o.schema_version, 'data', o.data
      ) order by o.object_id),
      '[]'::jsonb)),
    coalesce(min(o.schema_version), 1),
    v_parent,
    p_actor
  from public.model_object o
  where o.project_id = p_project and not o.deleted
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function private.make_checkpoint(uuid, uuid) from public;

-- create_checkpoint: save_objects steps (1)-(4), then one checkpoint made by the caller.
create function public.create_checkpoint(p_project uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return private.make_checkpoint(p_project, v_user);
end
$$;

revoke all on function public.create_checkpoint(uuid) from public, anon, service_role;
grant execute on function public.create_checkpoint(uuid) to authenticated;
