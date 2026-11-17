-- EZD-125 (S06 Edit lock; Q-0697 decisions 03 "Edit lock data", "Auto release", decisions 10 "Phase 8
-- permissions"; 03b rules 6, 7; 09o Auto-release deadline, lock_epoch, Requests): the edit lock functions.
--
-- Every lock change (acquire, release, auto release, respond, cancel) is one conditional write under
-- select ... for update on the edit_lock row, the same row lock save_objects and make_checkpoint take. Before
-- any of them goes on, an unanswered request whose deadline_at has passed on the database clock is applied:
-- a checkpoint of the holder's saved rows, every pending request of the lock set to auto, holder null,
-- lock_epoch + 1, event_log lock.auto_released with actor system and IP null. The sweep, every lock read and
-- every save apply it the same way.
--
-- lock_epoch goes up on every change of holder (free to a user, a user to free) and never on a re-acquire by
-- the holder (the holder's second tab or device). Each lock change writes its event_log row in the same
-- transaction (actor and IP from the route). Broadcasts come from the triggers at the end of this file and
-- carry ids, statuses and timestamps only; the holder's name is read through read_edit_lock.

-- The trigger reads which kind of release this transaction made (auto release or a holder's release).
-- Set with set_config(..., true), so it lasts to the end of the transaction only.

-- The caller of a lock function: gate, claims, (optionally) a granted edit_model row, then project scope.
-- Returns the tenant. 42501 without claims or the switch, P0002 for a project out of scope.
create function private.edit_lock_caller(p_project uuid, p_need_edit boolean)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_user uuid := private.app_user_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
begin
  perform private.require_api_gate();
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_need_edit and not exists (
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

revoke all on function private.edit_lock_caller(uuid, boolean) from public;

-- The project's edit_lock row, made at first use (epoch 0, free), locked for the rest of the transaction.
create function private.lock_edit_row(p_project uuid, p_tenant uuid)
returns public.edit_lock
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lock public.edit_lock;
begin
  select * into v_lock from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    insert into public.edit_lock (project_id, tenant_id) values (p_project, p_tenant)
      on conflict (project_id) do nothing;
    select * into v_lock from public.edit_lock l where l.project_id = p_project for update;
  end if;
  return v_lock;
end
$$;

revoke all on function private.lock_edit_row(uuid, uuid) from public;

-- The auto release, when an unanswered request of the project has reached its deadline. Takes the edit_lock
-- row lock. True when it released the lock.
create function private.apply_edit_lock_deadline(p_project uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lock public.edit_lock;
  v_request uuid;
begin
  select * into v_lock from public.edit_lock l where l.project_id = p_project for update;
  if not found then
    return false;
  end if;

  select r.id into v_request from public.edit_request r
  where r.project_id = p_project and r.response is null and r.deadline_at <= now()
  order by r.deadline_at, r.id
  limit 1;
  if v_request is null then
    return false;
  end if;

  if v_lock.holder_app_user_id is null then
    -- The holder is gone (app_user removed): nothing to release; the requests end.
    update public.edit_request r set response = 'auto', responded_at = now()
    where r.project_id = p_project and r.response is null;
    return false;
  end if;

  -- The holder's saved work first (03b rule 7), then the release.
  perform private.make_checkpoint(p_project, v_lock.holder_app_user_id);

  perform set_config('ezdraft.lock_change', 'auto', true);
  update public.edit_request r set response = 'auto', responded_at = now()
  where r.project_id = p_project and r.response is null;
  update public.edit_lock l
  set holder_app_user_id = null, since = null, device_id = null, offline = false,
    lock_epoch = l.lock_epoch + 1
  where l.project_id = p_project;

  perform private.write_event_log_as('lock.auto_released', v_lock.tenant_id, null, 'project', p_project,
    jsonb_build_object(
      'request_id', v_request,
      'holder_app_user_id', v_lock.holder_app_user_id,
      'lock_epoch', v_lock.lock_epoch + 1),
    null);
  return true;
end
$$;

revoke all on function private.apply_edit_lock_deadline(uuid) from public;

-- The holder's release, for release_edit_lock and respond_edit_request (release). The caller holds the row
-- lock and checked that the caller is the holder. Every pending request of the lock ends with it.
create function private.release_edit_lock_now(p_project uuid, p_reason text, p_ip inet)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_epoch bigint;
begin
  perform set_config('ezdraft.lock_change', p_reason, true);
  update public.edit_request r set response = 'release', responded_at = now()
  where r.project_id = p_project and r.response is null;
  update public.edit_lock l
  set holder_app_user_id = null, since = null, device_id = null, offline = false,
    lock_epoch = l.lock_epoch + 1
  where l.project_id = p_project
  returning l.lock_epoch into v_epoch;
  perform private.write_event_log('lock.released', 'project', p_project,
    jsonb_build_object('reason', p_reason, 'lock_epoch', v_epoch), p_ip);
  return v_epoch;
end
$$;

revoke all on function private.release_edit_lock_now(uuid, text, inet) from public;

-- Start editing, and the editor's open: a free lock goes to the caller (epoch + 1); the holder's own call
-- (a second tab or device) records the device with the epoch unchanged; a lock held by another person
-- answers who holds it. Needs Edit model.
create function public.acquire_edit_lock(p_project uuid, p_device_id text, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_lock public.edit_lock;
begin
  perform private.require_api_gate();
  v_tenant := private.edit_lock_caller(p_project, true);
  v_user := private.app_user_id();
  if p_device_id is not null and char_length(p_device_id) not between 1 and 100 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform private.lock_edit_row(p_project, v_tenant);
  perform private.apply_edit_lock_deadline(p_project);
  select * into v_lock from public.edit_lock l where l.project_id = p_project;

  if v_lock.holder_app_user_id is null then
    perform set_config('ezdraft.lock_change', 'acquire', true);
    update public.edit_lock l
    set holder_app_user_id = v_user, since = now(), device_id = p_device_id, offline = false,
      lock_epoch = l.lock_epoch + 1
    where l.project_id = p_project
    returning * into v_lock;
    perform private.write_event_log('lock.acquired', 'project', p_project,
      jsonb_build_object('lock_epoch', v_lock.lock_epoch), p_ip);
  elsif v_lock.holder_app_user_id = v_user then
    update public.edit_lock l
    set device_id = coalesce(p_device_id, l.device_id), offline = false
    where l.project_id = p_project
    returning * into v_lock;
  else
    return jsonb_build_object(
      'status', 'held',
      'holder_app_user_id', v_lock.holder_app_user_id,
      'since', v_lock.since,
      'lock_epoch', v_lock.lock_epoch);
  end if;

  return jsonb_build_object(
    'status', 'acquired',
    'holder_app_user_id', v_lock.holder_app_user_id,
    'since', v_lock.since,
    'lock_epoch', v_lock.lock_epoch);
end
$$;

revoke all on function public.acquire_edit_lock(uuid, text, inet) from public, anon, service_role;
grant execute on function public.acquire_edit_lock(uuid, text, inet) to authenticated;

-- Stop editing (stop_editing: the browser drained and made its checkpoint with the thumbnail first) and a
-- tab close (closed: a server checkpoint first, no preview; Q-0664). The holder only. A tab-close release
-- carries the lock_epoch it held, and is refused when the epoch moved since.
create function public.release_edit_lock(
  p_project uuid,
  p_reason text,
  p_lock_epoch bigint default null,
  p_ip inet default null
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
  v_lock public.edit_lock;
  v_epoch bigint;
begin
  perform private.require_api_gate();
  v_tenant := private.edit_lock_caller(p_project, false);
  v_user := private.app_user_id();
  if p_reason is null or p_reason not in ('stop_editing', 'closed') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform private.lock_edit_row(p_project, v_tenant);
  perform private.apply_edit_lock_deadline(p_project);
  select * into v_lock from public.edit_lock l where l.project_id = p_project;

  if v_lock.holder_app_user_id is distinct from v_user then
    return jsonb_build_object('status', 'not_holder');
  end if;
  if p_lock_epoch is not null and p_lock_epoch <> v_lock.lock_epoch then
    return jsonb_build_object('status', 'stale_lock_epoch');
  end if;

  if p_reason = 'closed' then
    perform private.make_checkpoint(p_project, v_user);
  end if;
  v_epoch := private.release_edit_lock_now(p_project, p_reason, p_ip);
  return jsonb_build_object('status', 'released', 'lock_epoch', v_epoch);
end
$$;

revoke all on function public.release_edit_lock(uuid, text, bigint, inet) from public, anon, service_role;
grant execute on function public.release_edit_lock(uuid, text, bigint, inet) to authenticated;

-- Request edit. Needs Edit model. On a free lock answers lock_free; the holder's own request and a second
-- pending request of the same person are refused. deadline_at = now() + the Defaults minutes the route read
-- (whole minutes 1 to 1,440). The holder gets an edit_request notification.
create function public.request_edit_lock(p_project uuid, p_minutes integer, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_lock public.edit_lock;
  v_request public.edit_request;
  v_name text;
begin
  perform private.require_api_gate();
  v_tenant := private.edit_lock_caller(p_project, true);
  v_user := private.app_user_id();
  if p_minutes is null or p_minutes < 1 or p_minutes > 1440 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform private.lock_edit_row(p_project, v_tenant);
  perform private.apply_edit_lock_deadline(p_project);
  select * into v_lock from public.edit_lock l where l.project_id = p_project;

  if v_lock.holder_app_user_id is null then
    return jsonb_build_object('status', 'lock_free', 'lock_epoch', v_lock.lock_epoch);
  end if;
  if v_lock.holder_app_user_id = v_user then
    return jsonb_build_object('status', 'own_lock');
  end if;
  if exists (
    select 1 from public.edit_request r
    where r.project_id = p_project and r.requester_app_user_id = v_user and r.response is null
  ) then
    return jsonb_build_object('status', 'already_requested');
  end if;

  insert into public.edit_request (project_id, tenant_id, requester_app_user_id, requested_at, deadline_at)
  values (p_project, v_tenant, v_user, now(), now() + make_interval(mins => p_minutes))
  returning * into v_request;

  perform private.write_event_log('lock.requested', 'project', p_project,
    jsonb_build_object('request_id', v_request.id, 'deadline_at', v_request.deadline_at), p_ip);

  select coalesce(nullif(btrim(a.name), ''), a.email) into v_name from public.app_user a where a.id = v_user;
  perform private.create_notification(v_tenant, v_lock.holder_app_user_id, 'edit_request', p_project,
    jsonb_build_object('name', coalesce(v_name, '')), '/projects/' || p_project::text);

  return jsonb_build_object(
    'status', 'requested',
    'request_id', v_request.id,
    'requested_at', v_request.requested_at,
    'deadline_at', v_request.deadline_at);
end
$$;

revoke all on function public.request_edit_lock(uuid, integer, inet) from public, anon, service_role;
grant execute on function public.request_edit_lock(uuid, integer, inet) to authenticated;

-- Cancel request: the caller's own pending request ends as cancelled.
create function public.cancel_edit_request(p_project uuid, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_id uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.edit_lock_caller(p_project, false);
  v_user := private.app_user_id();

  perform private.lock_edit_row(p_project, v_tenant);
  perform private.apply_edit_lock_deadline(p_project);

  update public.edit_request r set response = 'cancelled', responded_at = now()
  where r.project_id = p_project and r.requester_app_user_id = v_user and r.response is null
  returning r.id into v_id;
  if v_id is null then
    return jsonb_build_object('status', 'no_request');
  end if;

  perform private.write_event_log('lock.request_cancelled', 'project', p_project,
    jsonb_build_object('request_id', v_id), p_ip);
  return jsonb_build_object('status', 'cancelled', 'request_id', v_id);
end
$$;

revoke all on function public.cancel_edit_request(uuid, inet) from public, anon, service_role;
grant execute on function public.cancel_edit_request(uuid, inet) to authenticated;

-- The holder's answer to a request: keep (the lock stays; the requester may ask again at once) or release
-- (a server checkpoint, then the release with reason request_accepted). The holder only, and only while the
-- request is pending, so a Keep after the deadline loses to the auto release.
create function public.respond_edit_request(
  p_project uuid,
  p_request uuid,
  p_response text,
  p_ip inet default null
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
  v_lock public.edit_lock;
  v_epoch bigint;
begin
  perform private.require_api_gate();
  v_tenant := private.edit_lock_caller(p_project, false);
  v_user := private.app_user_id();
  if p_request is null or p_response is null or p_response not in ('release', 'keep') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  perform private.lock_edit_row(p_project, v_tenant);
  perform private.apply_edit_lock_deadline(p_project);
  select * into v_lock from public.edit_lock l where l.project_id = p_project;

  if v_lock.holder_app_user_id is distinct from v_user then
    return jsonb_build_object('status', 'not_holder');
  end if;
  if not exists (
    select 1 from public.edit_request r
    where r.id = p_request and r.project_id = p_project and r.response is null
  ) then
    return jsonb_build_object('status', 'not_pending');
  end if;

  if p_response = 'keep' then
    update public.edit_request r set response = 'keep', responded_at = now()
    where r.id = p_request and r.response is null;
    perform private.write_event_log('lock.request_declined', 'project', p_project,
      jsonb_build_object('request_id', p_request), p_ip);
    return jsonb_build_object('status', 'kept', 'lock_epoch', v_lock.lock_epoch);
  end if;

  perform private.make_checkpoint(p_project, v_user);
  v_epoch := private.release_edit_lock_now(p_project, 'request_accepted', p_ip);
  return jsonb_build_object('status', 'released', 'lock_epoch', v_epoch);
end
$$;

revoke all on function public.respond_edit_request(uuid, uuid, text, inet) from public, anon, service_role;
grant execute on function public.respond_edit_request(uuid, uuid, text, inet) to authenticated;

-- The lock read (banner, prompt, Requested state): applies an expired deadline first, then answers the holder
-- (id and name), since, epoch, the caller's own pending request and, for the holder, the pending requests to
-- them. Any member who can see the project.
create function public.read_edit_lock(p_project uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_lock public.edit_lock;
  v_mine jsonb;
  v_requests jsonb := '[]'::jsonb;
begin
  perform private.require_api_gate();
  v_tenant := private.edit_lock_caller(p_project, false);
  v_user := private.app_user_id();

  if exists (
    select 1 from public.edit_request r
    where r.project_id = p_project and r.response is null and r.deadline_at <= now()
  ) then
    perform private.apply_edit_lock_deadline(p_project);
  end if;

  select * into v_lock from public.edit_lock l where l.project_id = p_project;

  select jsonb_build_object('id', r.id, 'requested_at', r.requested_at, 'deadline_at', r.deadline_at)
  into v_mine
  from public.edit_request r
  where r.project_id = p_project and r.requester_app_user_id = v_user and r.response is null;

  if v_lock.holder_app_user_id is not null and v_lock.holder_app_user_id = v_user then
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'requester_app_user_id', r.requester_app_user_id,
        'requester_name', coalesce(nullif(btrim(a.name), ''), a.email),
        'requested_at', r.requested_at,
        'deadline_at', r.deadline_at) order by r.requested_at, r.id), '[]'::jsonb)
    into v_requests
    from public.edit_request r
    join public.app_user a on a.id = r.requester_app_user_id
    where r.project_id = p_project and r.response is null;
  end if;

  return jsonb_build_object(
    'lock_epoch', coalesce(v_lock.lock_epoch, 0),
    'holder_app_user_id', v_lock.holder_app_user_id,
    'holder_name', (select coalesce(nullif(btrim(a.name), ''), a.email)
      from public.app_user a where a.id = v_lock.holder_app_user_id),
    'since', v_lock.since,
    'offline', coalesce(v_lock.offline, false),
    'my_request', v_mine,
    'requests', v_requests,
    'now', now());
end
$$;

revoke all on function public.read_edit_lock(uuid) from public, anon, service_role;
grant execute on function public.read_edit_lock(uuid) to authenticated;

-- The sweep's pass (GET /api/jobs/sweep, once a minute in production): every lock with an expired pending
-- request. A lock another transaction holds is skipped and taken at the next sweep (or by its next read or
-- save). Returns the number of locks released. service_role only.
create function public.sweep_edit_locks()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_count integer := 0;
begin
  perform private.require_api_gate();
  for v_project in
    select distinct r.project_id from public.edit_request r
    where r.response is null and r.deadline_at <= now()
  loop
    perform 1 from public.edit_lock l where l.project_id = v_project for update skip locked;
    if found and private.apply_edit_lock_deadline(v_project) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

revoke all on function public.sweep_edit_locks() from public, anon, authenticated;
grant execute on function public.sweep_edit_locks() to service_role;

-- save_objects as in 20261109100000_number_model_objects.sql, step (6) also applying an expired deadline
-- (a save that finds one does the auto release, then answers stale_lock_epoch without raising, so the release
-- commits) and step (7) also refusing a caller who does not hold the lock (a project never locked, epoch 0
-- and no holder, still saves at 0; vault/build/assumptions.md EZD-125).
create or replace function public.save_objects(p_project uuid, p_lock_epoch bigint, p_changes jsonb)
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
  v_holder uuid;
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

  -- (6) one save at a time per project: the edit_lock row is locked for the rest of the transaction. An
  -- expired request is applied first (EZD-125).
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

  -- (7) the generation, and the holder (EZD-125).
  if v_epoch <> p_lock_epoch
    or (v_holder is not null and v_holder <> v_user)
    or (v_holder is null and v_epoch <> 0)
  then
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
    jsonb_agg(jsonb_build_object('object_id', o.object_id, 'updated_seq', o.updated_seq, 'number', private.object_number(o.type, o.data))
      order by o.object_id),
    '[]'::jsonb)
  into v_objects
  from public.model_object o
  where o.project_id = p_project and o.object_id = any (v_seen);

  return jsonb_build_object('status', 'saved', 'tenant_id', v_tenant, 'objects', v_objects);
end
$$;

-- A holder's app_user removed: the foreign key's set-null frees the lock. The row is kept consistent (since and
-- device cleared, epoch + 1, as for any change of holder) and the change is a system release.
create function private.edit_lock_holder_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.holder_app_user_id is not null and new.holder_app_user_id is null then
    new.since := null;
    new.device_id := null;
    new.offline := false;
    if new.lock_epoch = old.lock_epoch then
      new.lock_epoch := old.lock_epoch + 1;
      perform set_config('ezdraft.lock_change', 'auto', true);
    end if;
  end if;
  return new;
end
$$;

revoke all on function private.edit_lock_holder_gone() from public;

create trigger edit_lock_holder_gone
  before update on public.edit_lock
  for each row execute function private.edit_lock_holder_gone();

-- Broadcasts on project:<id> after the change commits (architecture Realtime "Clients never broadcast",
-- "Payload rule"): ids, statuses and timestamps only, never a name. An auto release sends lock.auto_released
-- only; a holder's release sends lock.released with its reason; a re-acquire by the holder sends nothing.
create function private.edit_lock_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_change text := coalesce(current_setting('ezdraft.lock_change', true), '');
begin
  if old.holder_app_user_id is null and new.holder_app_user_id is not null then
    perform private.broadcast_project(new.project_id, 'lock.acquired', jsonb_build_object(
      'holderAppUserId', new.holder_app_user_id,
      'lockEpoch', new.lock_epoch,
      'since', new.since));
  elsif old.holder_app_user_id is not null and new.holder_app_user_id is null then
    if v_change not in ('stop_editing', 'closed', 'request_accepted') then
      perform private.broadcast_project(new.project_id, 'lock.auto_released', jsonb_build_object(
        'formerHolderAppUserId', old.holder_app_user_id,
        'lockEpoch', new.lock_epoch,
        'at', now()));
    else
      perform private.broadcast_project(new.project_id, 'lock.released', jsonb_build_object(
        'formerHolderAppUserId', old.holder_app_user_id,
        'lockEpoch', new.lock_epoch,
        'reason', v_change,
        'at', now()));
    end if;
  end if;
  return null;
end
$$;

revoke all on function private.edit_lock_broadcast() from public;

create trigger edit_lock_broadcast
  after update on public.edit_lock
  for each row execute function private.edit_lock_broadcast();

-- A request sends lock.requested; a Keep lock.request_declined; a Cancel lock.request_cancelled. A request
-- ended by a release or an auto release is covered by the lock's own event.
create function private.edit_request_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.broadcast_project(new.project_id, 'lock.requested', jsonb_build_object(
      'requestId', new.id,
      'requesterAppUserId', new.requester_app_user_id,
      'requestedAt', new.requested_at,
      'deadlineAt', new.deadline_at));
  elsif old.response is null and new.response = 'keep' then
    perform private.broadcast_project(new.project_id, 'lock.request_declined', jsonb_build_object(
      'requestId', new.id,
      'requesterAppUserId', new.requester_app_user_id,
      'respondedAt', new.responded_at));
  elsif old.response is null and new.response = 'cancelled' then
    perform private.broadcast_project(new.project_id, 'lock.request_cancelled', jsonb_build_object(
      'requestId', new.id,
      'requesterAppUserId', new.requester_app_user_id,
      'respondedAt', new.responded_at));
  end if;
  return null;
end
$$;

revoke all on function private.edit_request_broadcast() from public;

create trigger edit_request_broadcast
  after insert or update on public.edit_request
  for each row execute function private.edit_request_broadcast();
