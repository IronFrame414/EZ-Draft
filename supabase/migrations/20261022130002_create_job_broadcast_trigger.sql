-- EZD-009 Step 3 (vault/plans/EZD-009.md): job.progress on the project channel (EZD-018), pushed from the
-- database after each insert and each status or progress change. The payload is ids, statuses and
-- counters only (EZD-018 Step 3 payload rule). A failed send never rolls back the job write it reports:
-- the browser refetches on resync. Tenant-level jobs (null project_id) push nothing.
create function private.job_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.project_id is not null
    and (tg_op = 'INSERT'
      or new.status is distinct from old.status
      or new.progress is distinct from old.progress) then
    begin
      perform private.broadcast_project(
        new.project_id,
        'job.progress',
        jsonb_build_object(
          'jobId', new.id,
          'kind', new.kind,
          'status', new.status,
          'progress', new.progress,
          'attempts', new.attempts
        )
      );
    exception when others then
      raise warning 'job_broadcast_failed';
    end;
  end if;
  return null;
end
$$;

revoke all on function private.job_broadcast() from public;

create trigger job_broadcast
  after insert or update on public.job
  for each row execute function private.job_broadcast();
