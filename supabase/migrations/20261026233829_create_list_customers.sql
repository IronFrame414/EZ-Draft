-- EZD-113 Step 3 (vault/plans/EZD-113.md M3): one page of customers (50, by lower(name), id) with each
-- customer's visible project count from one grouped query (the counts CTE). Invoker, so RLS limits
-- customer to the claim tenant and project to the viewer's scope.
create function public.list_customers(p_search text, p_archived boolean, p_page integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (
    select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t
  ),
  base as (select c.* from public.customer c),
  filtered as (
    select b.* from base b, term
    where (b.archived_at is not null) = p_archived
      and (term.t = '' or b.name ilike '%' || term.t || '%' or b.email ilike '%' || term.t || '%')
  ),
  page as (
    select f.* from filtered f order by lower(f.name), f.id
    limit 50 offset (greatest(coalesce(p_page, 1), 1) - 1) * 50
  ),
  counts as (
    select p.customer_id, count(*) as n from public.project p
    where p.customer_id in (select id from page) group by p.customer_id
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pg.id, 'name', pg.name, 'email', pg.email, 'phone', pg.phone, 'address', pg.address,
        'archivedAt', pg.archived_at, 'projectCount', coalesce(ct.n, 0))
      order by lower(pg.name), pg.id)
      from page pg left join counts ct on ct.customer_id = pg.id), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'active', (select count(*) from base where archived_at is null),
    'archived', (select count(*) from base where archived_at is not null));
$$;
revoke all on function public.list_customers(text, boolean, integer) from public, anon, service_role;
grant execute on function public.list_customers(text, boolean, integer) to authenticated;
