-- EZD-314 (S01 States "Import in progress: card shows \"Importing\" in place of the open-items indicator"; AC-EZD-314-5):
-- list_projects is 20261118160000's, with one more item field, importing: an import of the project is in progress,
-- that is its import job is queued or running, or one of its import sessions is still detecting or in review
-- (detecting or ready; Finish and Cancel close every session of the import, 20261118090000). A session is counted
-- only through its import job: one whose job is gone (job_id set null) has no review left to finish. A failed
-- import is not in progress (vault/build/assumptions.md EZD-314). The reads run as the caller (security invoker), so RLS on job and
-- import_session decides what is seen; same grants.
create or replace function public.list_projects(p_sort text, p_status text default null, p_after jsonb default null, p_search text default '')
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t),
  base as (
    select p.id, p.name, p.address, p.status, p.open_items_count, p.updated_at, p.thumbnail_path,
      (p.archived_at is not null) as archived,
      (select max(v.version_no) from public.model_version v where v.project_id = p.id and v.is_sent) as version_no,
      (exists (select 1 from public.job j
          where j.project_id = p.id and j.kind = 'import' and j.status in ('queued', 'running'))
        or exists (select 1 from public.import_session st
          join public.job j on j.id = st.job_id and j.project_id = p.id and j.kind = 'import'
          where st.project_id = p.id and st.status in ('detecting', 'ready'))) as importing,
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
        'versionNo', r.version_no, 'archived', r.archived, 'importing', r.importing)
      order by r.rn) from ranked r where r.rn <= 48), '[]'::jsonb),
    'next', (select jsonb_build_object('id', r.id, 'u', r.updated_at, 'n', r.name_key,
        'm', r.client_missing, 'c', r.client_key, 'r', r.status_rank, 'o', r.open_items_count)
      from ranked r where r.rn = 48 and exists (select 1 from ranked x where x.rn = 49)));
$$;
revoke all on function public.list_projects(text, text, jsonb, text) from public, anon, service_role;
grant execute on function public.list_projects(text, text, jsonb, text) to authenticated;
