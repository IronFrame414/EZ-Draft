-- EZD-123 (R24 #4; W15; S20 Cleanup sheet; Q-0700 03 "Daily cleanup", 05 "Cleanup sheet", 10 permission table;
-- Q-0708; examples 09p Cleanup clock; AC-EZD-123-1, -3, -6, -7, -8): the version cleanup.
--
-- 1. private.cleanup_days: a company's Defaults day value (version_cleanup_age 30, version_cleanup_grace 7; whole
--    days, 0 allowed, Q-0706), the registry default when not stored.
-- 2. public.enqueue_version_cleanup(p_now): service_role, called by the once-a-minute sweep. From the day's run time
--    (08:00 UTC, about 03:00 in Florida; vault/build/assumptions/EZD-123.md) it queues one `cleanup` job per company
--    that has working rows, at most once per company per day (the run time is in the payload, so a retry keeps it).
-- 3. public.run_version_cleanup(p_tenant, p_now, p_dry_run): service_role, called by the cleanup job handler with the
--    payload's run time as p_now, so a run is exact and repeatable.
--    a. Deletes first: rows neither sent nor named, at least age days old, stamped before this run, at least grace
--       days before p_now. A row
--       stamped in this run is never deleted in it (Q-0708: with grace 0 it goes at the next daily run).
--    b. Then stamps: rows neither sent nor named, never shown, made at least age days before p_now, get
--       cleanup_shown_at = p_now.
--    c. Per project, cleanup.deleted and cleanup.due go to the event log, and cleanup_due goes in the app and by email
--       (create_notification) to each active member with Edit model granted whose scope includes the project: one
--       per person per project per run. An event row lists at most the first 100 ids (event_log details are
--       limited to 16 KB) and the full count.
--    With p_dry_run it answers the same two id lists and writes nothing. Run twice with the same p_now, the second
--    run finds nothing to do.
-- 4. public.save_cleanup_choices: the sheet's Save choices. Edit model, project scope and the lock (revert_to_version
--    steps 6 and 7). Kept rows become named snapshots with their trimmed names; the listed rows to delete go only when
--    they are this project's, already shown, and neither snapshot nor sent, so a row named or sent at the same moment
--    is skipped, never an error (Q-0700 05). Writes cleanup.deleted.
-- Sent and named rows are refused by model_version_freeze for every caller (20261117200000).

create index model_version_cleanup_idx on public.model_version (tenant_id, created_at)
  where not is_sent and not is_snapshot;

create function private.cleanup_days(p_defaults jsonb, p_key text, p_default integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when (p_defaults ->> p_key) ~ '^[0-9]{1,3}$' then (p_defaults ->> p_key)::integer
    else p_default
  end
$$;

revoke all on function private.cleanup_days(jsonb, text, integer) from public, anon, authenticated;

create function public.enqueue_version_cleanup(p_now timestamptz default now())
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot timestamptz;
  v_count integer;
begin
  perform private.require_api_gate();
  if p_now is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_slot := (date_trunc('day', p_now at time zone 'UTC') + interval '8 hours') at time zone 'UTC';
  if p_now < v_slot then
    return 0;
  end if;
  -- Two sweeps at once queue one job per company.
  perform pg_advisory_xact_lock(hashtext('enqueue_version_cleanup'));
  insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, run_after)
  select t.id, null, 'cleanup',
    jsonb_build_object('at', to_char(v_slot at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
    'queued', 5, now()
  from public.tenant t
  where exists (
      select 1 from public.model_version v
      where v.tenant_id = t.id and not v.is_sent and not v.is_snapshot)
    and not exists (
      select 1 from public.job j
      where j.tenant_id = t.id and j.kind = 'cleanup'
        and j.payload ->> 'at' = to_char(v_slot at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.enqueue_version_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_version_cleanup(timestamptz) to service_role;

create function public.run_version_cleanup(p_tenant uuid, p_now timestamptz, p_dry_run boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_defaults jsonb;
  v_age integer;
  v_grace integer;
  v_delete uuid[];
  v_due uuid[];
  v_row record;
begin
  perform private.require_api_gate();
  if p_tenant is null or p_now is null or p_dry_run is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select t.defaults into v_defaults from public.tenant t where t.id = p_tenant;
  if not found then
    return jsonb_build_object('deleted', '[]'::jsonb, 'due', '[]'::jsonb);
  end if;
  v_age := private.cleanup_days(v_defaults, 'version_cleanup_age', 30);
  v_grace := private.cleanup_days(v_defaults, 'version_cleanup_grace', 7);

  select coalesce(array_agg(v.id order by v.created_at, v.id), '{}') into v_delete
  from public.model_version v
  where v.tenant_id = p_tenant
    and not v.is_sent and not v.is_snapshot
    and v.cleanup_shown_at is not null
    and v.cleanup_shown_at < p_now
    and v.cleanup_shown_at <= p_now - make_interval(days => v_grace)
    -- Never a row younger than age, also when age was raised after the row was shown (AC-EZD-123-7).
    and v.created_at <= p_now - make_interval(days => v_age);

  select coalesce(array_agg(v.id order by v.created_at, v.id), '{}') into v_due
  from public.model_version v
  where v.tenant_id = p_tenant
    and not v.is_sent and not v.is_snapshot
    and v.cleanup_shown_at is null
    and v.created_at <= p_now - make_interval(days => v_age);

  if p_dry_run then
    return jsonb_build_object('deleted', to_jsonb(v_delete), 'due', to_jsonb(v_due));
  end if;

  -- (a) Deletes, then the event log per project.
  for v_row in
    with gone as (
      delete from public.model_version v
      where v.id = any (v_delete) and v.tenant_id = p_tenant
        and not v.is_sent and not v.is_snapshot
      returning v.id, v.project_id
    )
    select g.project_id, array_agg(g.id order by g.id) as ids from gone g group by g.project_id
  loop
    perform private.write_event_log_as('cleanup.deleted', p_tenant, null, 'project', v_row.project_id,
      jsonb_build_object('versionIds', to_jsonb(v_row.ids[1:100]), 'count', cardinality(v_row.ids), 'by', 'run'),
      null);
  end loop;

  -- (b) Stamps, then (c) the event log and cleanup_due per project.
  for v_row in
    with shown as (
      update public.model_version v set cleanup_shown_at = p_now
      where v.id = any (v_due) and v.tenant_id = p_tenant
        and not v.is_sent and not v.is_snapshot and v.cleanup_shown_at is null
      returning v.id, v.project_id
    )
    select s.project_id, array_agg(s.id order by s.id) as ids from shown s group by s.project_id
  loop
    perform private.write_event_log_as('cleanup.due', p_tenant, null, 'project', v_row.project_id,
      jsonb_build_object('versionIds', to_jsonb(v_row.ids[1:100]), 'count', cardinality(v_row.ids)), null);
    perform private.create_notification(p_tenant, m.user_id, 'cleanup_due', v_row.project_id, '{}'::jsonb,
      '/projects/' || v_row.project_id::text)
    from public.membership m
    where m.tenant_id = p_tenant
      and m.status = 'active'
      and exists (
        select 1 from public.user_permission up
        where up.membership_id = m.id and up.tenant_id = p_tenant
          and up.permission_key = 'edit_model' and up.granted);
  end loop;

  return jsonb_build_object('deleted', to_jsonb(v_delete), 'due', to_jsonb(v_due));
end
$$;

revoke all on function public.run_version_cleanup(uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.run_version_cleanup(uuid, timestamptz, boolean) to service_role;

create function public.save_cleanup_choices(
  p_project uuid, p_lock_epoch bigint, p_keep jsonb, p_delete uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_item jsonb;
  v_id uuid;
  v_name text;
  v_keep_ids uuid[] := '{}';
  v_kept uuid[] := '{}';
  v_deleted uuid[];
  v_epoch bigint;
  v_holder uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.version_edit_caller(p_project);
  v_user := private.app_user_id();

  if p_lock_epoch is null or p_lock_epoch < 0 or p_keep is null or jsonb_typeof(p_keep) <> 'array'
    or p_delete is null or array_position(p_delete, null) is not null
    or cardinality(p_delete) <> cardinality(array(select distinct d from unnest(p_delete) d))
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  for v_item in select e from jsonb_array_elements(p_keep) e loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(jsonb_typeof(v_item -> 'id'), '') <> 'string'
      or coalesce(jsonb_typeof(v_item -> 'name'), '') <> 'string'
      or (v_item ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      or btrim(v_item ->> 'name') = ''
    then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_id := (v_item ->> 'id')::uuid;
    if v_id = any (v_keep_ids) or v_id = any (p_delete) then
      raise exception 'invalid_input' using errcode = '22023';
    end if;
    v_keep_ids := v_keep_ids || v_id;
  end loop;

  -- revert_to_version step 6: one writer at a time; an expired request is applied first.
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

  -- revert_to_version step 7: the generation and the holder.
  if v_epoch <> p_lock_epoch
    or (v_holder is not null and v_holder <> v_user)
    or (v_holder is null and v_epoch <> 0)
  then
    return jsonb_build_object('status', 'stale_lock_epoch');
  end if;

  -- Kept rows: working rows of this project become named snapshots.
  for v_item in select e from jsonb_array_elements(p_keep) e loop
    v_id := (v_item ->> 'id')::uuid;
    v_name := btrim(v_item ->> 'name');
    update public.model_version v set is_snapshot = true, label = v_name
    where v.id = v_id and v.project_id = p_project and v.tenant_id = v_tenant
      and not v.is_sent and not v.is_snapshot;
    if found then
      v_kept := v_kept || v_id;
    end if;
  end loop;

  -- Unticked rows: only shown rows of this project that are neither snapshot nor sent.
  with gone as (
    delete from public.model_version v
    where v.id = any (p_delete) and v.project_id = p_project and v.tenant_id = v_tenant
      and not v.is_sent and not v.is_snapshot and v.cleanup_shown_at is not null
    returning v.id
  )
  select coalesce(array_agg(g.id order by g.id), '{}') into v_deleted from gone g;

  if cardinality(v_deleted) > 0 then
    perform private.write_event_log('cleanup.deleted', 'project', p_project,
      jsonb_build_object('versionIds', to_jsonb(v_deleted[1:100]), 'count', cardinality(v_deleted), 'by', 'sheet'),
      null);
  end if;

  return jsonb_build_object('status', 'saved', 'tenant_id', v_tenant,
    'kept', to_jsonb(v_kept), 'deleted', to_jsonb(v_deleted));
end
$$;

revoke all on function public.save_cleanup_choices(uuid, bigint, jsonb, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.save_cleanup_choices(uuid, bigint, jsonb, uuid[]) to authenticated;
