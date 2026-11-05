-- EZD-117a Step 1 (vault/plans/EZD-117a.md M1): one keyset page of 48 projects for the Projects page,
-- in one of five sort orders, optionally filtered by status, with the client name from customer and a
-- cursor for the next page (null on the last page). Invoker, so RLS limits project to the claim tenant
-- and the viewer's scope; archived projects are never listed.
create function public.list_projects(p_sort text, p_status text default null, p_after jsonb default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select p.id, p.name, p.address, p.status, p.open_items_count, p.updated_at,
      c.name as client_name,
      (c.name is null) as client_missing,
      left(lower(coalesce(c.name, '')), 500) as client_key,
      left(lower(p.name), 500) as name_key,
      array_position(array['draft', 'client_review', 'permit_submitted', 'approved', 'in_build'], p.status) as status_rank
    from public.project p
    left join public.customer c on c.id = p.customer_id
    where p.archived_at is null
      and p_sort in ('edited', 'name', 'client', 'status', 'open_items')
      and (p_status is null or p.status = p_status)
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
        'status', r.status, 'openItems', r.open_items_count)
      order by r.rn) from ranked r where r.rn <= 48), '[]'::jsonb),
    'next', (select jsonb_build_object('id', r.id, 'u', r.updated_at, 'n', r.name_key,
        'm', r.client_missing, 'c', r.client_key, 'r', r.status_rank, 'o', r.open_items_count)
      from ranked r where r.rn = 48 and exists (select 1 from ranked x where x.rn = 49)));
$$;
revoke all on function public.list_projects(text, text, jsonb) from public, anon, service_role;
grant execute on function public.list_projects(text, text, jsonb) to authenticated;
