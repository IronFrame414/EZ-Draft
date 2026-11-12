-- EZD-299a Build step 2 (vault/plans/EZD-299a.md section 1 S2, Decided D-Read, D-Record scope, D-Saved by,
-- D-Reason, D-Resolves, D-Cap, D-Notify, D-Link; Q-0531; Q-0540; Q-0628; Q-0632 (a); AC-EZD-299-11, -15): the
-- only readers and writers of public.sync_conflict. Each is security definer, calls the API gate first (EZD-190)
-- and refuses a request with no tenant or user claim (42501). Authenticated only (L-016).

-- record_sync_conflicts: the caller's refused changes for one project they can see now, in change order, then
-- one sync_conflict notification for them in the same transaction. A row already kept for that person, project
-- and object is replaced (its id and created_at kept).
create function public.record_sync_conflicts(p_project uuid, p_changes jsonb, p_payload jsonb)
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
  v_item jsonb;
  v_keys text[];
  v_deleted boolean;
  v_id uuid;
  v_seen uuid[] := '{}';
  v_row uuid;
  v_ids jsonb := '[]'::jsonb;
  v_count integer;
  v_note uuid;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  -- The changes: 1 to 1000 strict objects (D-Cap), no id twice.
  if p_changes is null or jsonb_typeof(p_changes) <> 'array'
    or jsonb_array_length(p_changes) < 1 or jsonb_array_length(p_changes) > 1000
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
        then array['base_seq', 'deleted', 'id', 'reason']
        else array['base_seq', 'data', 'deleted', 'id', 'reason', 'schema_version', 'type'] end)
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(jsonb_typeof(v_item -> 'base_seq'), '') <> 'number'
      or coalesce(jsonb_typeof(v_item -> 'reason'), '') <> 'string'
      or (v_item ->> 'reason') not in ('conflict', 'invalid', 'not_editable')
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
        or octet_length((v_item -> 'data')::text) > 131072
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

  -- The notification params (D-Fit): exactly { count, names, more } as strings.
  v_count := jsonb_array_length(p_changes);
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_payload) as k;
  if v_keys is distinct from array['count', 'more', 'names']
    or jsonb_typeof(p_payload -> 'count') <> 'string'
    or jsonb_typeof(p_payload -> 'names') <> 'string'
    or jsonb_typeof(p_payload -> 'more') <> 'string'
    or (p_payload ->> 'count') <> v_count::text
    or (p_payload ->> 'more') !~ '^(0|[1-9][0-9]*)$'
    or (p_payload ->> 'names') = ''
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if (p_payload ->> 'more')::numeric > v_count then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_changes) with ordinality as t(e, n) order by n loop
    v_deleted := (v_item ->> 'deleted')::boolean;
    insert into public.sync_conflict
      (tenant_id, user_id, project_id, object_id, reason, base_seq, deleted, type, schema_version, data)
    values (
      v_tenant, v_user, p_project, (v_item ->> 'id')::uuid, v_item ->> 'reason',
      (v_item ->> 'base_seq')::numeric::integer, v_deleted,
      case when v_deleted then null else v_item ->> 'type' end,
      case when v_deleted then null else (v_item ->> 'schema_version')::numeric::integer end,
      case when v_deleted then null else v_item -> 'data' end
    )
    on conflict (project_id, user_id, object_id) do update
      set reason = excluded.reason,
          base_seq = excluded.base_seq,
          deleted = excluded.deleted,
          type = excluded.type,
          schema_version = excluded.schema_version,
          data = excluded.data,
          updated_at = now()
    returning id into v_row;
    v_ids := v_ids || to_jsonb(v_row);
  end loop;

  v_note := private.create_notification(
    v_tenant, v_user, 'sync_conflict', p_project, p_payload,
    '/projects/' || p_project::text || '?conflicts=open'
  );

  return jsonb_build_object('ids', v_ids, 'notification_id', v_note);
end
$$;

revoke all on function public.record_sync_conflicts(uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.record_sync_conflicts(uuid, jsonb, jsonb) to authenticated;

-- list_my_sync_conflicts: every row of the caller in the claim tenant, every project, newest first, as one
-- jsonb array (not a set, so PostgREST max_rows does not cut it). A project the caller can no longer see shows
-- its reason only (D-Read); not_open wins over not_editable, which wins over the stored reason (D-Reason).
create function public.list_my_sync_conflicts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
  v_editable boolean;
  v_items jsonb;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  if v_tenant is null or v_user is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;

  -- The Edit model check of save_objects step 3.
  v_editable := exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  );

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'project_id', r.project_id,
      'object_id', r.object_id,
      'reason', case
        when not r.visible then 'not_open'
        when not v_editable then 'not_editable'
        else r.reason end,
      'base_seq', r.base_seq,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'project_name', case when r.visible then p.name end,
      'client_name', case when r.visible then c.name end,
      'mine', case when r.visible then jsonb_build_object(
        'deleted', r.deleted, 'type', r.type, 'schema_version', r.schema_version, 'data', r.data) end,
      'saved', case when r.visible and o.object_id is not null then jsonb_build_object(
        'updated_seq', o.updated_seq, 'deleted', o.deleted, 'type', o.type,
        'schema_version', o.schema_version, 'data', o.data) end,
      'saved_at', case when r.visible then o.updated_at end,
      'saved_by', case when r.visible and exists (
          select 1 from public.membership m where m.tenant_id = v_tenant and m.user_id = o.updated_by
        ) then u.name end
    ) order by r.updated_at desc, r.id desc), '[]'::jsonb)
  into v_items
  from (
    select s.*, private.can_see_project(s.project_id) as visible
    from public.sync_conflict s
    where s.tenant_id = v_tenant and s.user_id = v_user
  ) r
  left join public.project p on r.visible and p.id = r.project_id
  left join public.customer c on r.visible and c.id = p.customer_id
  left join public.model_object o on r.visible and o.project_id = r.project_id and o.object_id = r.object_id
  left join public.app_user u on r.visible and u.id = o.updated_by;

  return v_items;
end
$$;

revoke all on function public.list_my_sync_conflicts() from public, anon, service_role;
grant execute on function public.list_my_sync_conflicts() to authenticated;

-- delete_my_sync_conflict: removes one of the caller's own rows (no scope check, so a not-open row can go).
create function public.delete_my_sync_conflict(p_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_n integer;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  if v_tenant is null or v_user is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  delete from public.sync_conflict s
  where s.id = p_id and s.tenant_id = v_tenant and s.user_id = v_user;
  get diagnostics v_n = row_count;
  return v_n > 0;
end
$$;

revoke all on function public.delete_my_sync_conflict(uuid) from public, anon, service_role;
grant execute on function public.delete_my_sync_conflict(uuid) to authenticated;

-- save_objects_resolving: save_objects with all its checks and codes; on a save, the named rows of the caller
-- whose objects that save wrote are removed in the same transaction (D-Resolves). A bad list refuses with
-- 22023, which rolls the save back.
create function public.save_objects_resolving(
  p_project uuid,
  p_lock_epoch bigint,
  p_changes jsonb,
  p_resolves uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v jsonb;
  v_resolved jsonb;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  if v_tenant is null or v_user is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  v := public.save_objects(p_project, p_lock_epoch, p_changes);
  if v ->> 'status' is distinct from 'saved' then
    return v;
  end if;

  if p_resolves is null
    or cardinality(p_resolves) = 0
    or array_position(p_resolves, null) is not null
    or cardinality(array(select distinct x from unnest(p_resolves) as x)) <> cardinality(p_resolves)
    or cardinality(p_resolves) > jsonb_array_length(p_changes)
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  with gone as (
    delete from public.sync_conflict s
    where s.id = any (p_resolves)
      and s.tenant_id = v_tenant
      and s.user_id = v_user
      and s.project_id = p_project
      and s.object_id in (
        select (o ->> 'object_id')::uuid from jsonb_array_elements(v -> 'objects') as o
      )
    returning s.id
  )
  select coalesce(jsonb_agg(g.id order by g.id), '[]'::jsonb) into v_resolved from gone g;

  return v || jsonb_build_object('resolved', v_resolved);
end
$$;

revoke all on function public.save_objects_resolving(uuid, bigint, jsonb, uuid[]) from public, anon, service_role;
grant execute on function public.save_objects_resolving(uuid, bigint, jsonb, uuid[]) to authenticated;
