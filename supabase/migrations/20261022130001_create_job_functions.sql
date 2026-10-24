-- EZD-009 Step 2 (vault/plans/EZD-009.md): the queue functions. enqueue_job is the members' only way to add
-- a job (security definer, authenticated only); the six job_* functions are the runner's (invoker,
-- service_role only, called with the secret key). Every write after the claim is fenced by run_id, so a run
-- whose lease expired gets false and cannot overwrite the run that took over. Times come from now().

create function public.enqueue_job(
  p_kind text,
  p_project_id uuid,
  p_payload jsonb,
  p_max_attempts int,
  p_run_after timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_id uuid;
begin
  if v_tenant is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_project_id is not null then
    if not private.can_see_project(p_project_id) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  elsif not private.all_projects() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, run_after, created_by)
  values (
    v_tenant,
    p_project_id,
    p_kind,
    p_payload,
    'queued',
    p_max_attempts,
    coalesce(p_run_after, now()),
    private.app_user_id()
  )
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.enqueue_job(text, uuid, jsonb, int, timestamptz) from public, anon, service_role;
grant execute on function public.enqueue_job(text, uuid, jsonb, int, timestamptz) to authenticated;

create function public.job_claim(p_run_id uuid, p_lease_seconds int, p_only_tenant uuid default null)
returns setof public.job
language sql
volatile
set search_path = ''
as $$
  update public.job
  set status = 'running',
    run_id = p_run_id,
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempts = attempts + 1,
    started_at = coalesce(started_at, now()),
    error = case when status = 'running' then 'lease_expired' else error end
  where id = (
    select j.id
    from public.job j
    where (
        (j.status = 'queued' and j.run_after <= now())
        or (j.status = 'running' and j.lease_expires_at < now() and j.attempts < j.max_attempts)
      )
      and (p_only_tenant is null or j.tenant_id = p_only_tenant)
    order by j.run_after, j.created_at
    for update skip locked
    limit 1
  )
  returning *
$$;

create function public.job_fail_expired(p_only_tenant uuid default null)
returns setof public.job
language sql
volatile
set search_path = ''
as $$
  update public.job
  set status = 'failed',
    error = 'lease_expired',
    run_id = null,
    lease_expires_at = null,
    finished_at = now()
  where id in (
    select j.id
    from public.job j
    where j.status = 'running'
      and j.lease_expires_at < now()
      and j.attempts >= j.max_attempts
      and (p_only_tenant is null or j.tenant_id = p_only_tenant)
    for update skip locked
  )
  returning *
$$;

create function public.job_progress(p_job_id uuid, p_run_id uuid, p_progress int)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  update public.job
  set progress = p_progress
  where id = p_job_id and run_id = p_run_id and status = 'running';
  return found;
end
$$;

create function public.job_complete(p_job_id uuid, p_run_id uuid, p_result jsonb)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  update public.job
  set status = 'done',
    progress = 100,
    result = p_result,
    error = null,
    run_id = null,
    lease_expires_at = null,
    finished_at = now()
  where id = p_job_id and run_id = p_run_id and status = 'running';
  return found;
end
$$;

create function public.job_continue(p_job_id uuid, p_run_id uuid, p_state jsonb)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  update public.job
  set status = 'queued',
    state = p_state,
    run_after = now(),
    attempts = 0,
    run_id = null,
    lease_expires_at = null
  where id = p_job_id and run_id = p_run_id and status = 'running';
  return found;
end
$$;

create function public.job_fail(p_job_id uuid, p_run_id uuid, p_error text, p_retry_after_ms int)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  update public.job
  set status = case
      when p_retry_after_ms is not null and attempts < max_attempts then 'queued'
      else 'failed'
    end,
    error = p_error,
    run_after = case
      when p_retry_after_ms is not null and attempts < max_attempts
        then now() + make_interval(secs => p_retry_after_ms / 1000.0)
      else run_after
    end,
    finished_at = case
      when p_retry_after_ms is not null and attempts < max_attempts then finished_at
      else now()
    end,
    run_id = null,
    lease_expires_at = null
  where id = p_job_id and run_id = p_run_id and status = 'running';
  return found;
end
$$;

revoke all on function public.job_claim(uuid, int, uuid) from public, anon, authenticated, service_role;
revoke all on function public.job_fail_expired(uuid) from public, anon, authenticated, service_role;
revoke all on function public.job_progress(uuid, uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.job_complete(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.job_continue(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.job_fail(uuid, uuid, text, int) from public, anon, authenticated, service_role;
grant execute on function public.job_claim(uuid, int, uuid) to service_role;
grant execute on function public.job_fail_expired(uuid) to service_role;
grant execute on function public.job_progress(uuid, uuid, int) to service_role;
grant execute on function public.job_complete(uuid, uuid, jsonb) to service_role;
grant execute on function public.job_continue(uuid, uuid, jsonb) to service_role;
grant execute on function public.job_fail(uuid, uuid, text, int) to service_role;
