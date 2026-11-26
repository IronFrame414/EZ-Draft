-- EZD-717 (S13 Controls "Issue Rev n"; W11 3-4; 09h Revision rules; 03c permit_revision, electrical_calc; S20 Version
-- rules; AC-EZD-717-1): Issue Rev 0 and Rev N. "Rev 0 = first issued permit set, locked; later issues are Rev 1, 2...
-- with no cap. Every sent version is frozen; editing continues on a working copy."
--
-- 1. public.permit_revision: one row per issue (03c: project_id, rev_no, model_version_id, issued_at, issued_by,
--    sent_to, delta_object_ids, description), plus export_job_id, the PDF export job of the issue. Members read the
--    rows of projects in their scope (EZD-006 template); no member write policy. A row never changes once written,
--    except export_job_id going from null to a job once; it is never deleted while its project stands.
--    delta_object_ids stays empty here: the changed-object set is EZD-718's.
-- 2. public.electrical_calc is created by 20261126225900_create_electrical_calc.sql (one table per file).
-- 3. model_version.cause gains 'issue'. The issued checkpoint is a named row (is_snapshot, label "Rev N"), so the
--    version cleanup never deletes it and model_version_freeze refuses its delete for every caller (20261117200000);
--    model_version_issued_frozen also refuses any change to its name, so it stays named. model_json was already fixed
--    by model_version_immutable. This is the lock: the issued version never changes, and edits after it land on the
--    working copy (model_object rows), which the next issue checkpoints as Rev N + 1.
-- 4. public.issue_permit_set: gate, claims, project scope; a checkpoint of the saved working copy under the edit_lock
--    row lock (make_checkpoint, cause 'issue'); the next rev_no (0 for the first) read under that lock, with Issue
--    permit sets required for Rev 0 and Issue revisions for Rev 1+ (S13 Permissions); the permit_revision row, the
--    electrical_calc row when the browser sent one, and the plan_set.issued event_log row in the same transaction.
--    Project status is not changed: Q-0199 "moved by hand" (Q-0700 05 "A send never changes project.status").
-- 5. public.attach_permit_revision_export: records the issue's export job once (same caller checks).
-- 6. storage_exports_issued_select: a member reads an exports object only when it is the output of an issued
--    revision's export job they can see (permit_revision RLS), so the issue's PDF link can be signed under the
--    member's session. Every other exports object stays closed.

-- 1. permit_revision
create table public.permit_revision (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  rev_no integer not null check (rev_no >= 0),
  model_version_id uuid not null references public.model_version (id),
  issued_at timestamptz not null default now(),
  issued_by uuid references public.app_user (id) on delete set null,
  sent_to text not null default 'department' check (sent_to in ('client', 'department')),
  delta_object_ids uuid[] not null default '{}',
  description text check (description is null or char_length(description) between 1 and 500),
  export_job_id uuid,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create unique index permit_revision_rev_key on public.permit_revision (project_id, rev_no);
create unique index permit_revision_version_key on public.permit_revision (model_version_id);
create index permit_revision_tenant_id_idx on public.permit_revision (tenant_id);
create index permit_revision_export_job_idx on public.permit_revision (export_job_id) where export_job_id is not null;

alter table public.permit_revision enable row level security;

create policy permit_revision_select on public.permit_revision for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy permit_revision_api_gate on public.permit_revision as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

-- The standard grant (EZD-006 Step 6); with no insert, update or delete policy RLS refuses every member write.
grant select, insert, update, delete on public.permit_revision to authenticated;
grant select, insert, update, delete on public.permit_revision to service_role;

comment on table public.permit_revision is 'Data model entity: permit_revision (03c; S13 Issue Rev n; EZD-717)';

-- Owner rights, so the project lookup ignores row-level security (as model_version_freeze).
create function private.permit_revision_freeze()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.tenant_id is distinct from old.tenant_id
      or new.project_id is distinct from old.project_id
      or new.rev_no is distinct from old.rev_no
      or new.model_version_id is distinct from old.model_version_id
      or new.issued_at is distinct from old.issued_at
      or (new.issued_by is distinct from old.issued_by and new.issued_by is not null)
      or new.sent_to is distinct from old.sent_to
      or new.delta_object_ids is distinct from old.delta_object_ids
      or new.description is distinct from old.description
      or (old.export_job_id is not null and new.export_job_id is distinct from old.export_job_id)
    then
      raise exception 'permit_revision_frozen' using errcode = '55000';
    end if;
    return new;
  end if;
  if exists (select 1 from public.project p where p.id = old.project_id)
    and exists (select 1 from public.tenant t where t.id = old.tenant_id)
  then
    raise exception 'permit_revision_frozen' using errcode = '55000';
  end if;
  return old;
end
$$;

revoke all on function private.permit_revision_freeze() from public;

create trigger permit_revision_freeze
  before update or delete on public.permit_revision
  for each row execute function private.permit_revision_freeze();

-- 3. The issued checkpoint
alter table public.model_version drop constraint model_version_cause_check;
alter table public.model_version add constraint model_version_cause_check
  check (cause is null or cause in
    ('stop_editing', 'lock_release', 'finish_import', 'revert_from', 'revert', 'snapshot', 'send', 'issue'));

create function private.model_version_issued_frozen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.is_snapshot is distinct from old.is_snapshot or new.label is distinct from old.label)
    and exists (select 1 from public.permit_revision r where r.model_version_id = old.id)
  then
    raise exception 'model_version_issued_frozen' using errcode = '55000';
  end if;
  return new;
end
$$;

revoke all on function private.model_version_issued_frozen() from public;

create trigger model_version_issued_frozen
  before update on public.model_version
  for each row execute function private.model_version_issued_frozen();

-- 4. Issue
create function public.issue_permit_set(
  p_project uuid, p_description text default null, p_electrical jsonb default null, p_ip inet default null)
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
  v_version uuid;
  v_rev integer;
  v_key text;
  v_now timestamptz;
  v_id uuid;
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
      and up.permission_key in ('issue_permit_sets', 'issue_revisions')
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project)
    or not exists (select 1 from public.project p where p.id = p_project and p.tenant_id = v_tenant)
  then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if (p_description is not null and char_length(p_description) not between 1 and 500)
    or (p_electrical is not null and (
      jsonb_typeof(p_electrical) <> 'object'
      or coalesce(p_electrical ->> 'case', '') not in ('existing', 'proposed')
      or coalesce(p_electrical ->> 'method', '') not in ('standard', 'optional')
      or jsonb_typeof(p_electrical -> 'inputs') is distinct from 'object'
      or jsonb_typeof(p_electrical -> 'results') is distinct from 'object'
      or octet_length(p_electrical::text) > 65536))
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  -- make_checkpoint takes the edit_lock row lock; a second issue waits here and then sees this one's number. The
  -- unique index is the backstop.
  v_version := private.make_checkpoint(p_project, v_user, 'issue', null);

  select coalesce(max(r.rev_no) + 1, 0) into v_rev from public.permit_revision r where r.project_id = p_project;
  v_key := case when v_rev = 0 then 'issue_permit_sets' else 'issue_revisions' end;
  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = v_key
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  update public.model_version v set is_snapshot = true, label = 'Rev ' || v_rev where v.id = v_version;

  v_now := clock_timestamp();
  insert into public.permit_revision
    (tenant_id, project_id, rev_no, model_version_id, issued_at, issued_by, sent_to, description)
  values (v_tenant, p_project, v_rev, v_version, v_now, v_user, 'department', p_description)
  returning id into v_id;

  if p_electrical is not null then
    insert into public.electrical_calc (tenant_id, project_id, model_version_id, "case", method, inputs, results)
    values (v_tenant, p_project, v_version, p_electrical ->> 'case', p_electrical ->> 'method',
      p_electrical -> 'inputs', p_electrical -> 'results');
  end if;

  perform private.write_event_log('plan_set.issued', 'project', p_project,
    jsonb_build_object('permit_revision_id', v_id, 'rev_no', v_rev, 'model_version_id', v_version), p_ip);

  return jsonb_build_object(
    'permit_revision_id', v_id,
    'rev_no', v_rev,
    'model_version_id', v_version,
    'issued_at', v_now);
end
$$;

revoke all on function public.issue_permit_set(uuid, text, jsonb, inet) from public, anon, authenticated, service_role;
grant execute on function public.issue_permit_set(uuid, text, jsonb, inet) to authenticated;

-- 5. The issue's export job
create function public.attach_permit_revision_export(p_revision uuid, p_job uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_membership uuid;
  v_project uuid;
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
      and up.permission_key in ('issue_permit_sets', 'issue_revisions')
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select r.project_id into v_project from public.permit_revision r
  where r.id = p_revision and r.tenant_id = v_tenant and r.export_job_id is null;
  if not found or not private.can_see_project(v_project) then
    raise exception 'revision_not_found' using errcode = 'P0002';
  end if;
  if p_job is null or not exists (
    select 1 from public.job j
    where j.id = p_job and j.tenant_id = v_tenant and j.project_id = v_project and j.kind = 'export')
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.permit_revision r set export_job_id = p_job where r.id = p_revision;
end
$$;

revoke all on function public.attach_permit_revision_export(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.attach_permit_revision_export(uuid, uuid) to authenticated;

-- 6. The issued PDF: <tenant>/<project>/<job>/<key>.pdf (server/jobs/handlers/pdf-export.ts pdfExportDir).
create policy storage_exports_issued_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = (select private.tenant_id())::text
    and exists (
      select 1 from public.permit_revision r
      where r.export_job_id is not null
        and r.tenant_id::text = (storage.foldername(name))[1]
        and r.project_id::text = (storage.foldername(name))[2]
        and r.export_job_id::text = (storage.foldername(name))[3])
  );
