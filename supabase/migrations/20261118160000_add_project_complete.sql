-- EZD-137 (S01 Projects; Q-0191; Q-0199; Q-0700 decisions 03 "Completed status", 10 "Phase 9 action and permission
-- table"; Q-0702; examples 09p Status moves): Mark complete, Reopen and the Completed tab.
--
-- 1. project.status gains complete (the check is widened, R12). completed_from (one of the five hand-moved
--    statuses, or null) and completed_at are set only while status is complete.
-- 2. complete_project and reopen_project (Edit model, no lock; Q-0202). Each checks the API gate, claims and an
--    active membership (42501), Edit model (42501), project scope (P0002), as set_project_status does. Mark complete
--    stores the prior status in completed_from and now() in completed_at; Reopen restores completed_from, or draft
--    when it is null, and clears both. Each writes project.status_changed (from, to) in its own transaction; a call
--    that changes nothing writes nothing. archived_at is untouched, so a completed project can be archived and
--    restored and stays complete. Executable by authenticated only; in GATED_RPC_CALLS.
-- 3. set_project_status refuses a completed project (22023): Reopen is the way back (assumptions EZD-137).
-- 4. list_projects takes p_status 'complete' (completed, not archived); All and the five status tabs exclude
--    complete; Complete sorts last (status rank 6). count_projects adds complete; all and the five status counts
--    exclude it.

-- 1. The columns.
alter table public.project
  drop constraint project_status_check,
  add constraint project_status_check
    check (status in ('draft', 'client_review', 'permit_submitted', 'approved', 'in_build', 'complete')),
  add column completed_from text
    check (completed_from in ('draft', 'client_review', 'permit_submitted', 'approved', 'in_build')),
  add column completed_at timestamptz,
  add constraint project_completed_fields_check
    check (status = 'complete' or (completed_from is null and completed_at is null));

-- 2. Mark complete (Edit model).
create function public.complete_project(p_project uuid)
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
  select p.status into v_old from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_old = 'complete' then
    return jsonb_build_object('tenant_id', v_tenant, 'changed', false, 'status', 'complete');
  end if;
  update public.project p
  set status = 'complete', completed_from = v_old, completed_at = now()
  where p.id = p_project and p.tenant_id = v_tenant;
  perform private.write_event_log('project.status_changed', 'project', p_project,
    jsonb_build_object('projectId', p_project, 'from', v_old, 'to', 'complete'), null);
  return jsonb_build_object('tenant_id', v_tenant, 'changed', true, 'status', 'complete');
end
$$;

revoke all on function public.complete_project(uuid) from public, anon, service_role;
grant execute on function public.complete_project(uuid) to authenticated;

-- Reopen (Edit model): completed_from, or draft when it is null; a project that is not complete changes nothing.
create function public.reopen_project(p_project uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_old text;
  v_from text;
  v_to text;
begin
  perform private.require_api_gate();
  v_tenant := private.project_card_tenant(p_project, 'edit_model');
  select p.status, p.completed_from into v_old, v_from from public.project p
  where p.id = p_project and p.tenant_id = v_tenant for update;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if v_old <> 'complete' then
    return jsonb_build_object('tenant_id', v_tenant, 'changed', false, 'status', v_old);
  end if;
  v_to := coalesce(v_from, 'draft');
  update public.project p
  set status = v_to, completed_from = null, completed_at = null
  where p.id = p_project and p.tenant_id = v_tenant;
  perform private.write_event_log('project.status_changed', 'project', p_project,
    jsonb_build_object('projectId', p_project, 'from', 'complete', 'to', v_to), null);
  return jsonb_build_object('tenant_id', v_tenant, 'changed', true, 'status', v_to);
end
$$;

revoke all on function public.reopen_project(uuid) from public, anon, service_role;
grant execute on function public.reopen_project(uuid) to authenticated;

-- 3. Set status: 20261118140000 with a completed project refused.
create or replace function public.set_project_status(p_project uuid, p_status text)
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
  if v_old = 'complete' then
    raise exception 'invalid_input' using errcode = '22023';
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

-- 4. list_projects: 20261118140000 with the Completed tab; same grants.
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
      array_position(array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build', 'complete'], p.status) as status_rank
    from public.project p
    left join public.customer c on c.id = p.customer_id
    cross join term
    where not p.is_benchmark
      and p_sort in ('edited', 'name', 'client', 'status', 'open_items')
      and (case when p_status = 'archived' then p.archived_at is not null
        when p_status is null then p.archived_at is null and p.status <> 'complete'
        else p.archived_at is null and p.status = p_status end)
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

-- count_projects: 20261118140000 with complete; all excludes completed and archived projects.
create or replace function public.count_projects(p_search text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t)
  select jsonb_build_object(
    'all', count(*) filter (where p.archived_at is null and p.status <> 'complete'),
    'draft', count(*) filter (where p.archived_at is null and p.status = 'draft'),
    'client_review', count(*) filter (where p.archived_at is null and p.status = 'client_review'),
    'permit_submitted', count(*) filter (where p.archived_at is null and p.status = 'permit_submitted'),
    'approved', count(*) filter (where p.archived_at is null and p.status = 'approved'),
    'in_build', count(*) filter (where p.archived_at is null and p.status = 'in_build'),
    'complete', count(*) filter (where p.archived_at is null and p.status = 'complete'),
    'archived', count(*) filter (where p.archived_at is not null))
  from public.project p
  left join public.customer c on c.id = p.customer_id
  cross join term
  where not p.is_benchmark
    and (term.t = '' or p.name ilike '%' || term.t || '%' or p.address ilike '%' || term.t || '%' or c.name ilike '%' || term.t || '%');
$$;
revoke all on function public.count_projects(text) from public, anon, service_role;
grant execute on function public.count_projects(text) to authenticated;
