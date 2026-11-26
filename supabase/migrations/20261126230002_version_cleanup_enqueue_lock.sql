-- EZD-1611a gate fix (EZD-123 enqueue_version_cleanup): the sweep's insert read every company, so a company deleted
-- while it ran broke job_tenant_id_fkey and failed the whole sweep (seen in the gate: cleanup.db.test.ts J10 beside
-- tests that delete their companies). The select now takes a key-share lock on each company row it queues a job for,
-- so a company being deleted is waited for and left out. Same signature, checks and grants; no table or policy change.

create or replace function public.enqueue_version_cleanup(p_now timestamptz default now())
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
        and j.payload ->> 'at' = to_char(v_slot at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  -- A company deleted while the sweep runs is skipped: the row lock waits for the delete and drops the row.
  for key share of t;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke all on function public.enqueue_version_cleanup(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_version_cleanup(timestamptz) to service_role;
