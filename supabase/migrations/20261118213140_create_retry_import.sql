-- EZD-314 (S02 States "Error: import job failed: message with file name and Retry; Cancel import stays available";
-- AC-EZD-314-2): Retry of a failed import. The checks are cancel_import's (20261118090000), in the same order: gate;
-- no tenant, user or membership claim 42501; no granted Edit model 42501 (Retry is a review change, as Cancel is:
-- vault/build/assumptions.md EZD-314); project missing or out of scope P0002; the job not an import of this project
-- P0002. Then, under the project's edit_lock row lock: a review already finished or cancelled answers closed, an
-- edit lock another user holds answers locked, a job still queued or running answers busy, and an import that has
-- not failed answers not_failed; none writes.
--
-- An import has failed when its job failed or one of its sessions did (server/imports/review.ts). Retry removes the
-- failed sessions (the job keeps a session that is not detecting, server/jobs/handlers/import.ts) and the review
-- rows of the job, and puts the job back on the queue as new: queued, due now, no attempts, no error, no run. The
-- route then starts the runner (kickJobRunner). Uploaded source files are not touched.
create function public.retry_import(p_project uuid, p_job uuid)
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
  v_status text;
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

  select j.status into v_status from public.job j where j.id = p_job for update;
  if v_status in ('queued', 'running') then
    return jsonb_build_object('status', 'busy');
  end if;

  if v_status <> 'failed' and not exists (
    select 1 from public.import_session st
    where st.job_id = p_job and st.project_id = p_project and st.status = 'failed'
  ) then
    return jsonb_build_object('status', 'not_failed');
  end if;

  delete from public.import_review_item r where r.job_id = p_job and r.project_id = p_project;
  delete from public.import_session st
  where st.job_id = p_job and st.project_id = p_project and st.status = 'failed';

  update public.job j
  set status = 'queued',
    attempts = 0,
    progress = 0,
    error = null,
    run_after = now(),
    run_id = null,
    lease_expires_at = null,
    state = null,
    result = null,
    started_at = null,
    finished_at = null
  where j.id = p_job;

  return jsonb_build_object('status', 'queued');
end
$$;

revoke all on function public.retry_import(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.retry_import(uuid, uuid) to authenticated;
