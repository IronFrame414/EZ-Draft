-- EZD-122 (Q-0700 03 rows "model_version gains cause" and "Revert"; Q-0700 10 permission table; S20 Controls,
-- Events emitted; board S20; AC-EZD-122-1, -4, -5): the Versions panel's two writes.
--
-- 1. model_version.cause: why a checkpoint was written, shown on its row. Null on rows written before this
--    migration and on checkpoints whose caller passes no cause (vault/build/assumptions.md EZD-122).
-- 2. private.make_checkpoint gains p_cause and p_label, both defaulted, so every existing caller keeps working.
--    The two-argument function is dropped first: a second overload would make every existing call ambiguous.
-- 3. public.name_snapshot: Edit model and project scope, no lock (Q-0700 10). A trimmed, non-empty name (no
--    maximum, duplicates allowed, Q-0700 05 cleanup row) on a working row of this project: is_snapshot and the label
--    are set. Sent rows and rows that are already snapshots are refused (S20 "working rows only"). Broadcasts
--    version.snapshot_named; the route writes the event_log row (SINK).
-- 4. public.revert_to_version: save_objects steps 1-7 (gate, claims, Edit model, scope, input, the edit_lock row
--    lock with an expired request applied, then the generation and the holder). The route has already migrated
--    and validated the version's objects (03b rule 5) and passes them in; their ids must be exactly the version's.
--    Then: a checkpoint of the current working copy (cause revert_from); every object of the version is written
--    with deleted false and every other live object gets deleted true, each touched row's updated_seq going up;
--    a second checkpoint (cause revert, label "Revert from " and the version's label as the panel shows it); and
--    a version.reverted broadcast so every open editor reloads. Sent versions are never written (AC-EZD-122-1).

alter table public.model_version add column cause text
  check (cause is null or cause in
    ('stop_editing', 'lock_release', 'finish_import', 'revert_from', 'revert', 'snapshot', 'send'));

drop function private.make_checkpoint(uuid, uuid);

-- 20261105200004's make_checkpoint, with the cause and the label written on the new row.
create function private.make_checkpoint(
  p_project uuid, p_actor uuid, p_cause text default null, p_label text default null)
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

  insert into public.model_version
    (project_id, tenant_id, model_json, schema_version, parent_version_id, created_by, cause, label)
  select p_project, v_tenant,
    jsonb_build_object('objects', coalesce(
      jsonb_agg(jsonb_build_object(
        'id', o.object_id, 'type', o.type, 'schema_version', o.schema_version, 'data', o.data
      ) order by o.object_id),
      '[]'::jsonb)),
    coalesce(min(o.schema_version), 1),
    v_parent,
    p_actor,
    p_cause,
    p_label
  from public.model_object o
  where o.project_id = p_project and not o.deleted
  returning id into v_id;

  return v_id;
end
$$;

revoke all on function private.make_checkpoint(uuid, uuid, text, text) from public;

-- Gate, claims, the Edit model switch and project scope, as save_objects steps 1-4. Answers the caller's
-- tenant; raises 42501 or P0002.
create function private.version_edit_caller(p_project uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or private.app_user_id() is null or v_membership is null then
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
  return v_tenant;
end
$$;

revoke all on function private.version_edit_caller(uuid) from public;

create function public.name_snapshot(p_project uuid, p_version uuid, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_name text;
  v_row public.model_version;
begin
  perform private.require_api_gate();
  v_tenant := private.version_edit_caller(p_project);

  v_name := btrim(coalesce(p_name, ''));
  if p_version is null or v_name = '' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- The version must be this project's (and so this company's): never another project's through this one.
  select * into v_row from public.model_version v
  where v.id = p_version and v.project_id = p_project and v.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;
  if v_row.is_sent or v_row.is_snapshot then
    return jsonb_build_object('status', 'not_working');
  end if;

  update public.model_version v set is_snapshot = true, label = v_name where v.id = p_version;

  perform private.broadcast_project(p_project, 'version.snapshot_named', jsonb_build_object(
    'modelVersionId', p_version));

  return jsonb_build_object('status', 'named', 'tenant_id', v_tenant, 'id', p_version, 'label', v_name);
end
$$;

revoke all on function public.name_snapshot(uuid, uuid, text) from public, anon, service_role;
grant execute on function public.name_snapshot(uuid, uuid, text) to authenticated;

create function public.revert_to_version(
  p_project uuid, p_version uuid, p_lock_epoch bigint, p_objects jsonb, p_label text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_epoch bigint;
  v_holder uuid;
  v_item jsonb;
  v_id uuid;
  v_seen uuid[] := '{}';
  v_version_ids uuid[];
  v_before uuid;
  v_after uuid;
  v_label text;
begin
  -- (1)-(4)
  perform private.require_api_gate();
  v_tenant := private.version_edit_caller(p_project);
  v_user := private.app_user_id();

  -- (5) the objects, as save_objects checks an upsert.
  v_label := btrim(coalesce(p_label, ''));
  if p_version is null or p_lock_epoch is null or p_lock_epoch < 0 or v_label = ''
    or p_objects is null or jsonb_typeof(p_objects) <> 'array'
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_objects) as e loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(jsonb_typeof(v_item -> 'type'), '') <> 'string'
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
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_seen) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_seen := v_seen || v_id;
  end loop;

  -- The version must be this project's; the objects must be exactly its objects.
  select coalesce(array_agg((e ->> 'id')::uuid), '{}') into v_version_ids
  from public.model_version v, jsonb_array_elements(v.model_json -> 'objects') as e
  where v.id = p_version and v.project_id = p_project and v.tenant_id = v_tenant;
  if not exists (
    select 1 from public.model_version v
    where v.id = p_version and v.project_id = p_project and v.tenant_id = v_tenant
  ) then
    raise exception 'version_not_found' using errcode = 'P0002';
  end if;
  if not (v_version_ids <@ v_seen and v_seen <@ v_version_ids) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- (6) save_objects step 6: one writer at a time; an expired request is applied first.
  select l.lock_epoch into v_epoch from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    if p_lock_epoch <> 0 then
      return jsonb_build_object('status', 'stale_lock_epoch');
    end if;
    insert into public.edit_lock (project_id, tenant_id) values (p_project, v_tenant)
      on conflict (project_id) do nothing;
    select l.lock_epoch into v_epoch from public.edit_lock l where l.project_id = p_project for update;
  end if;
  if private.apply_edit_lock_deadline(p_project) then
    return jsonb_build_object('status', 'stale_lock_epoch');
  end if;
  select l.lock_epoch, l.holder_app_user_id into v_epoch, v_holder
  from public.edit_lock l where l.project_id = p_project;

  -- (7) save_objects step 7: the generation and the holder.
  if v_epoch <> p_lock_epoch
    or (v_holder is not null and v_holder <> v_user)
    or (v_holder is null and v_epoch <> 0)
  then
    return jsonb_build_object('status', 'stale_lock_epoch');
  end if;

  -- The current working copy first.
  v_before := private.make_checkpoint(p_project, v_user, 'revert_from');

  -- The version's objects, live again where they differ.
  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by, deleted)
  select p_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type', e -> 'data',
    (e ->> 'schema_version')::numeric::integer, 1, v_user, false
  from jsonb_array_elements(p_objects) as e
  where not exists (
    select 1 from public.model_object o
    where o.project_id = p_project and o.object_id = (e ->> 'id')::uuid);

  update public.model_object o
  set type = c.e ->> 'type',
      data = c.e -> 'data',
      schema_version = (c.e ->> 'schema_version')::numeric::integer,
      deleted = false,
      updated_seq = o.updated_seq + 1,
      updated_at = now(),
      updated_by = v_user
  from (select e, (e ->> 'id')::uuid as object_id from jsonb_array_elements(p_objects) as e) c
  where o.project_id = p_project and o.object_id = c.object_id
    and (o.deleted
      or o.type is distinct from c.e ->> 'type'
      or o.data is distinct from c.e -> 'data'
      or o.schema_version is distinct from (c.e ->> 'schema_version')::numeric::integer);

  -- Every other live object is removed.
  update public.model_object o
  set deleted = true,
      updated_seq = o.updated_seq + 1,
      updated_at = now(),
      updated_by = v_user
  where o.project_id = p_project and not o.deleted and not (o.object_id = any (v_seen));

  v_after := private.make_checkpoint(p_project, v_user, 'revert', 'Revert from ' || v_label);

  perform private.broadcast_project(p_project, 'version.reverted', jsonb_build_object(
    'modelVersionId', v_after,
    'fromVersionId', p_version));

  return jsonb_build_object(
    'status', 'reverted',
    'tenant_id', v_tenant,
    'version_id', v_after,
    'before_version_id', v_before);
end
$$;

revoke all on function public.revert_to_version(uuid, uuid, bigint, jsonb, text)
  from public, anon, service_role;
grant execute on function public.revert_to_version(uuid, uuid, bigint, jsonb, text) to authenticated;
