-- EZD-313 (S02 Controls Finish import "Writes accepted items to the model as a new model version; opens 03 Plan",
-- Cancel import "discards detected items. Uploaded source files are kept. No model changes are made"; W2 step 5
-- "Finish: accepted items become model objects with status Existing"; Q-0215 "Detected items are saved until
-- Finish or Cancel ... Cancel returns to the project with nothing imported"; AC-EZD-313-1, -2): the two ends of an
-- import review.
--
-- Both functions check, in order, as save_import_review (20261117213090): gate; no tenant, user or membership claim
-- 42501; no granted Edit model 42501 (S02 Permissions); project missing or out of scope P0002; input outside the
-- rules 22023; the job not an import of this project P0002. Then, under the project's edit_lock row lock (one save
-- at a time, as save_objects step 6): a review already finished or cancelled answers closed, and an edit lock
-- another user holds answers locked (S02 "Also requires holding the edit lock"); neither writes.
--
-- finish_import: the objects are built by the server from the saved review (server/imports/finish-import.ts), so a
-- detected item without a decision answers unresolved (S02 Decisions "Nothing imports with a pending flag"). The
-- objects are inserted as new model_object rows (the numbering trigger numbers them), the import's sessions become
-- finished, and one checkpoint is made (private.make_checkpoint), the "new model version". It answers the version
-- id and each object's number.
--
-- cancel_import: the import's sessions become cancelled and the review rows are removed. No model_object,
-- model_version or source_file row is touched.

create function public.finish_import(p_project uuid, p_job uuid, p_objects jsonb)
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
  v_id uuid;
  v_seen uuid[] := '{}';
  v_holder uuid;
  v_version uuid;
  v_objects jsonb;
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

  if p_objects is null or jsonb_typeof(p_objects) <> 'array' or jsonb_array_length(p_objects) > 5000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  for v_item in select e from jsonb_array_elements(p_objects) as e loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) as k;
    if v_keys is distinct from array['data', 'id', 'schema_version', 'type']
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce((v_item ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', true)
      or coalesce(v_item ->> 'type', '') not in ('wall', 'opening', 'room')
      or coalesce(jsonb_typeof(v_item -> 'schema_version'), '') <> 'number'
      or coalesce(jsonb_typeof(v_item -> 'data'), '') <> 'object'
      or octet_length((v_item -> 'data')::text) > 16384
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

  if not exists (
    select 1 from public.job j
    where j.id = p_job and j.project_id = p_project and j.tenant_id = v_tenant and j.kind = 'import'
  ) then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;

  -- One save at a time per project (save_objects step 6).
  perform 1 from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    insert into public.edit_lock (project_id, tenant_id) values (p_project, v_tenant)
      on conflict (project_id) do nothing;
    perform 1 from public.edit_lock l where l.project_id = p_project for update;
  end if;

  if exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status in ('finished', 'cancelled')
  ) then
    return jsonb_build_object('status', 'closed');
  end if;

  if not exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status = 'ready'
  ) or exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status <> 'ready'
  ) then
    return jsonb_build_object('status', 'not_ready');
  end if;

  select l.holder_app_user_id into v_holder from public.edit_lock l where l.project_id = p_project;
  if v_holder is not null and v_holder <> v_user then
    return jsonb_build_object('status', 'locked');
  end if;

  if exists (
    select 1 from public.import_session st, jsonb_array_elements(st.items) as it
    where st.job_id = p_job and st.project_id = p_project and jsonb_typeof(it) = 'object'
      and not exists (
        select 1 from public.import_review_item r
        where r.job_id = p_job and r.item_id = it ->> 'id' and r.decision is not null
      )
  ) then
    return jsonb_build_object('status', 'unresolved');
  end if;

  if exists (
    select 1 from public.model_object o where o.project_id = p_project and o.object_id = any (v_seen)
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.model_object
    (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, updated_by, deleted)
  select p_project, (e ->> 'id')::uuid, v_tenant, e ->> 'type', e -> 'data',
    (e ->> 'schema_version')::numeric::integer, 1, v_user, false
  from jsonb_array_elements(p_objects) as e;

  update public.import_session st set status = 'finished'
  where st.job_id = p_job and st.project_id = p_project;

  v_version := private.make_checkpoint(p_project, v_user);

  select coalesce(
    jsonb_agg(jsonb_build_object('object_id', o.object_id, 'number', private.object_number(o.type, o.data))
      order by o.object_id),
    '[]'::jsonb)
  into v_objects
  from public.model_object o
  where o.project_id = p_project and o.object_id = any (v_seen);

  return jsonb_build_object(
    'status', 'finished', 'tenant_id', v_tenant, 'model_version_id', v_version, 'objects', v_objects);
end
$$;

revoke all on function public.finish_import(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.finish_import(uuid, uuid, jsonb) to authenticated;

create function public.cancel_import(p_project uuid, p_job uuid)
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
  v_holder uuid;
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

  if not exists (
    select 1 from public.job j
    where j.id = p_job and j.project_id = p_project and j.tenant_id = v_tenant and j.kind = 'import'
  ) then
    raise exception 'import_not_found' using errcode = 'P0002';
  end if;

  perform 1 from public.edit_lock l where l.project_id = p_project for update;

  if exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status in ('finished', 'cancelled')
  ) then
    return jsonb_build_object('status', 'closed');
  end if;

  select l.holder_app_user_id into v_holder from public.edit_lock l where l.project_id = p_project;
  if v_holder is not null and v_holder <> v_user then
    return jsonb_build_object('status', 'locked');
  end if;

  delete from public.import_review_item r where r.job_id = p_job and r.project_id = p_project;

  update public.import_session st set status = 'cancelled'
  where st.job_id = p_job and st.project_id = p_project;

  return jsonb_build_object('status', 'cancelled', 'tenant_id', v_tenant);
end
$$;

revoke all on function public.cancel_import(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.cancel_import(uuid, uuid) to authenticated;
