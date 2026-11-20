-- EZD-124 (S01 Card overflow menu; Q-0199; Q-0201; Q-0202; Q-0700 decisions 03 "Project Delete", 05, 10 "Phase 9
-- action and permission table"; Q-0702; Q-0708; examples 09p Delete confirmation): the project card menu.
--
-- 1. rename_project, set_project_status (Edit model, no lock; Q-0202), archive_project, restore_project and
--    delete_project (Delete projects). Each checks, in order: the API gate, claims and an active membership
--    (42501), the permission switch (42501), project scope (P0002), then its input (22023). Each writes its
--    event_log row (project.renamed, project.status_changed, project.archived, project.restored,
--    project.deleted) in its own transaction; a call that changes nothing writes nothing. Executable by
--    authenticated only; in GATED_RPC_CALLS.
-- 2. delete_project(p_project, p_confirm_name): p_confirm_name, already trimmed by the route, must equal the
--    project name exactly, case included (09p Delete confirmation), else 22023 name_mismatch. The edit_lock row
--    is locked first, then the project row (the order update_project_settings and send_to_client use). It sets
--    notification.project_id to null (no foreign key), deletes the project row (the cascade removes
--    model_object, model_version, edit_lock, edit_request, job, source_file, sync_conflict, membership_project,
--    error_alert, sent_package and the other project rows; the client link stops resolving with its
--    sent_package row), writes project.deleted, and queues a company-level project_purge job (project_id null,
--    the project id in the payload).
-- 3. job kind project_purge (widening the check only).
-- 4. list_project_purge_files(p_tenant, p_project, p_limit): service_role only. The Storage objects under
--    <tenant>/<project>/ in the five buckets, nothing while the project row still exists.
-- 5. The EZD-025 sent-file trigger lets a delete through only when no project row with the path's project id
--    exists, checked by private.project_row_gone (owner rights, ignores row-level security; the second path
--    segment must be a uuid, anything else stays refused). Moves and overwrites stay refused. The trigger
--    function now runs with owner rights so every caller (the Storage API's service role included) can run the
--    helper.
-- 6. membership_project_end_sessions skips when the project row is gone: a project Delete signs no one out.
-- 7. list_projects takes p_status 'archived' (archived projects only; every other tab and search excludes
--    them) and each item carries archived; count_projects adds archived and its other counts exclude it.

-- 3. The job kind.
alter table public.job
  drop constraint job_kind_check,
  add constraint job_kind_check check (
    kind in ('import', 'export', 'render', 'ai_read', 'thumbnail', 'diff', 'cleanup', 'test', 'notification_email',
      'project_purge')
  );

-- The caller's company after the gate, claims, an active membership and a granted p_permission; then scope.
create function private.project_card_tenant(p_project uuid, p_permission text)
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
  if v_tenant is null or v_user is null or v_membership is null or not exists (
    select 1 from public.membership m
    where m.id = v_membership and m.tenant_id = v_tenant and m.status = 'active'
  ) or not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership and up.tenant_id = v_tenant
      and up.permission_key = p_permission and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  return v_tenant;
end
$$;

revoke all on function private.project_card_tenant(uuid, text) from public;

-- 1. Rename (Edit model). The name is trimmed of spaces, not blank, at most 1,000 characters (as create_project).
create function public.rename_project(p_project uuid, p_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_old text;
  v_name text;
begin
  perform private.require_api_gate();
  v_tenant := private.project_card_tenant(p_project, 'edit_model');
  v_name := btrim(coalesce(p_name, ''));
  if length(v_name) = 0 or length(v_name) > 1000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select p.name into v_old from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_old = v_name then
    return jsonb_build_object('tenant_id', v_tenant, 'changed', false, 'name', v_name);
  end if;
  update public.project p set name = v_name where p.id = p_project and p.tenant_id = v_tenant;
  perform private.write_event_log('project.renamed', 'project', p_project,
    jsonb_build_object('projectId', p_project, 'from', v_old, 'to', v_name), null);
  return jsonb_build_object('tenant_id', v_tenant, 'changed', true, 'name', v_name);
end
$$;

revoke all on function public.rename_project(uuid, text) from public, anon, service_role;
grant execute on function public.rename_project(uuid, text) to authenticated;

-- Set status (Edit model): one of the five hand-moved statuses (Q-0199); Complete is not one of them.
create function public.set_project_status(p_project uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_old text;
begin
  perform private.require_api_gate();
  v_tenant := private.project_card_tenant(p_project, 'edit_model');
  if p_status is null
    or p_status not in ('draft', 'client_review', 'permit_submitted', 'approved', 'in_build') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select p.status into v_old from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_old = p_status then
    return jsonb_build_object('tenant_id', v_tenant, 'changed', false, 'status', p_status);
  end if;
  update public.project p set status = p_status where p.id = p_project and p.tenant_id = v_tenant;
  perform private.write_event_log('project.status_changed', 'project', p_project,
    jsonb_build_object('projectId', p_project, 'from', v_old, 'to', p_status), null);
  return jsonb_build_object('tenant_id', v_tenant, 'changed', true, 'status', p_status);
end
$$;

revoke all on function public.set_project_status(uuid, text) from public, anon, service_role;
grant execute on function public.set_project_status(uuid, text) to authenticated;

-- Archive (Delete projects): sets archived_at; already archived changes nothing.
create function public.archive_project(p_project uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_archived timestamptz;
begin
  perform private.require_api_gate();
  v_tenant := private.project_card_tenant(p_project, 'delete_projects');
  select p.archived_at into v_archived from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_archived is not null then
    return jsonb_build_object('tenant_id', v_tenant, 'changed', false);
  end if;
  update public.project p set archived_at = now() where p.id = p_project and p.tenant_id = v_tenant;
  perform private.write_event_log('project.archived', 'project', p_project,
    jsonb_build_object('projectId', p_project), null);
  return jsonb_build_object('tenant_id', v_tenant, 'changed', true);
end
$$;

revoke all on function public.archive_project(uuid) from public, anon, service_role;
grant execute on function public.archive_project(uuid) to authenticated;

-- Restore (Delete projects): clears archived_at; a project that is not archived changes nothing.
create function public.restore_project(p_project uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_archived timestamptz;
begin
  perform private.require_api_gate();
  v_tenant := private.project_card_tenant(p_project, 'delete_projects');
  select p.archived_at into v_archived from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_archived is null then
    return jsonb_build_object('tenant_id', v_tenant, 'changed', false);
  end if;
  update public.project p set archived_at = null where p.id = p_project and p.tenant_id = v_tenant;
  perform private.write_event_log('project.restored', 'project', p_project,
    jsonb_build_object('projectId', p_project), null);
  return jsonb_build_object('tenant_id', v_tenant, 'changed', true);
end
$$;

revoke all on function public.restore_project(uuid) from public, anon, service_role;
grant execute on function public.restore_project(uuid) to authenticated;

-- 2. Delete (Delete projects), at any time, even after a send (Q-0201).
create function public.delete_project(p_project uuid, p_confirm_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_name text;
  v_job uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.project_card_tenant(p_project, 'delete_projects');
  if p_confirm_name is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  perform private.lock_edit_row(p_project, v_tenant);
  select p.name into v_name from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if p_confirm_name <> v_name then
    raise exception 'name_mismatch' using errcode = '22023';
  end if;

  update public.notification n set project_id = null
  where n.tenant_id = v_tenant and n.project_id = p_project;
  delete from public.project p where p.id = p_project and p.tenant_id = v_tenant;
  perform private.write_event_log('project.deleted', 'project', p_project,
    jsonb_build_object('projectId', p_project, 'name', v_name), null);
  insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, created_by)
  values (v_tenant, null, 'project_purge', jsonb_build_object('projectId', p_project), 'queued', 5,
    private.app_user_id())
  returning id into v_job;
  return jsonb_build_object('tenant_id', v_tenant, 'job_id', v_job);
end
$$;

revoke all on function public.delete_project(uuid, text) from public, anon, service_role;
grant execute on function public.delete_project(uuid, text) to authenticated;

-- 4. The purge job's file list (secret key only).
create function public.list_project_purge_files(p_tenant uuid, p_project uuid, p_limit integer)
returns table (bucket_id text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.bucket_id, o.name
  from storage.objects o
  where p_tenant is not null and p_project is not null
    and not exists (select 1 from public.project p where p.id = p_project)
    and o.bucket_id in ('sources', 'renders', 'exports', 'media', 'jobs')
    and starts_with(o.name, p_tenant::text || '/' || p_project::text || '/')
  order by o.bucket_id, o.name
  limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$$;

revoke all on function public.list_project_purge_files(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.list_project_purge_files(uuid, uuid, integer) to service_role;

-- 5. The sent-file trigger. Owner rights, so no caller's row-level security hides a live project.
create function private.project_row_gone(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_segment text := split_part(coalesce(p_name, ''), '/', 2);
begin
  if v_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return not exists (select 1 from public.project p where p.id = v_segment::uuid);
end
$$;

revoke all on function private.project_row_gone(text) from public;

create or replace function private.refuse_sent_file_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.bucket_id = 'exports' and old.name ~ '^[^/]+/[^/]+/sent/' then
    if tg_op = 'DELETE' then
      if not private.project_row_gone(old.name) then
        raise exception 'sent_file_change_refused' using errcode = 'P0001';
      end if;
    elsif new.bucket_id is distinct from old.bucket_id
      or new.name is distinct from old.name
      or new.version is distinct from old.version then
      raise exception 'sent_file_change_refused' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.refuse_sent_file_change() from public;

-- 6. No session ends when membership_project rows go with their project.
create or replace function private.membership_project_end_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.project p where p.id = old.project_id) then
    return null;
  end if;
  if tg_op = 'DELETE'
    or new.membership_id is distinct from old.membership_id
    or new.project_id is distinct from old.project_id
  then
    perform private.end_user_sessions(
      (select m.user_id from public.membership m
       where m.id = old.membership_id and m.status = 'active')
    );
  end if;
  return null;
end
$$;

revoke all on function private.membership_project_end_sessions() from public;

-- 7. list_projects: 20261117200000 with the Archived tab and each item's archived; same grants.
create or replace function public.list_projects(p_sort text, p_status text default null, p_after jsonb default null, p_search text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t),
  base as (
    select p.id, p.name, p.address, p.status, p.open_items_count, p.updated_at, p.thumbnail_path,
      (p.archived_at is not null) as archived,
      (select max(v.version_no) from public.model_version v where v.project_id = p.id and v.is_sent) as version_no,
      c.name as client_name,
      (c.name is null) as client_missing,
      left(lower(coalesce(c.name, '')), 500) as client_key,
      left(lower(p.name), 500) as name_key,
      array_position(array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'], p.status) as status_rank
    from public.project p
    left join public.customer c on c.id = p.customer_id
    cross join term
    where not p.is_benchmark
      and p_sort in ('edited', 'name', 'client', 'status', 'open_items')
      and (case when p_status = 'archived' then p.archived_at is not null
        else p.archived_at is null and (p_status is null or p.status = p_status) end)
      and (term.t = '' or p.name ilike '%' || term.t || '%' or p.address ilike '%' || term.t || '%' or c.name ilike '%' || term.t || '%')
  ),
  after_cursor as (
    select b.* from base b
    where p_after is null or case p_sort
      when 'edited' then (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
      when 'name' then (b.name_key, b.id) > (p_after ->> 'n', (p_after ->> 'id')::uuid)
      when 'client' then (b.client_missing, b.client_key, b.id) > ((p_after ->> 'm')::boolean, p_after ->> 'c', (p_after ->> 'id')::uuid)
      when 'status' then b.status_rank > (p_after ->> 'r')::integer
        or (b.status_rank = (p_after ->> 'r')::integer and (b.updated_at, b.id) < ((p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid))
      when 'open_items' then (b.open_items_count, b.updated_at, b.id) < ((p_after ->> 'o')::integer, (p_after ->> 'u')::timestamptz, (p_after ->> 'id')::uuid)
    end
  ),
  ranked as (
    select a.*, row_number() over (order by
      case when p_sort = 'name' then a.name_key end asc,
      case when p_sort = 'client' then a.client_missing end asc,
      case when p_sort = 'client' then a.client_key end asc,
      case when p_sort = 'status' then a.status_rank end asc,
      case when p_sort = 'open_items' then a.open_items_count end desc,
      case when p_sort in ('edited', 'status', 'open_items') then a.updated_at end desc,
      case when p_sort in ('name', 'client') then a.id end asc,
      case when p_sort in ('edited', 'status', 'open_items') then a.id end desc) as rn
    from after_cursor a
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'clientName', r.client_name, 'address', r.address,
        'status', r.status, 'openItems', r.open_items_count, 'hasThumbnail', r.thumbnail_path is not null,
        'versionNo', r.version_no, 'archived', r.archived)
      order by r.rn) from ranked r where r.rn <= 48), '[]'::jsonb),
    'next', (select jsonb_build_object('id', r.id, 'u', r.updated_at, 'n', r.name_key,
        'm', r.client_missing, 'c', r.client_key, 'r', r.status_rank, 'o', r.open_items_count)
      from ranked r where r.rn = 48 and exists (select 1 from ranked x where x.rn = 49)));
$$;
revoke all on function public.list_projects(text, text, jsonb, text) from public, anon, service_role;
grant execute on function public.list_projects(text, text, jsonb, text) to authenticated;

-- count_projects: 20261106140001 with archived; All and the five status counts exclude archived projects.
create or replace function public.count_projects(p_search text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t)
  select jsonb_build_object(
    'all', count(*) filter (where p.archived_at is null),
    'draft', count(*) filter (where p.archived_at is null and p.status = 'draft'),
    'client_review', count(*) filter (where p.archived_at is null and p.status = 'client_review'),
    'permit_submitted', count(*) filter (where p.archived_at is null and p.status = 'permit_submitted'),
    'approved', count(*) filter (where p.archived_at is null and p.status = 'approved'),
    'in_build', count(*) filter (where p.archived_at is null and p.status = 'in_build'),
    'archived', count(*) filter (where p.archived_at is not null))
  from public.project p
  left join public.customer c on c.id = p.customer_id
  cross join term
  where not p.is_benchmark
    and (term.t = '' or p.name ilike '%' || term.t || '%' or p.address ilike '%' || term.t || '%' or c.name ilike '%' || term.t || '%');
$$;
revoke all on function public.count_projects(text) from public, anon, service_role;
grant execute on function public.count_projects(text) to authenticated;
