-- EZD-128 (vault/plans/EZD-128.md Build step 1, Database columns, Database functions; Q-0697 decisions 04
-- "Project switcher data"; Q-0698; Q-0726; Q-0202; Q-0568; AC-EZD-128-2): each member's recently opened projects,
-- one row per (membership, project), its opened_at moved to now() on every editor load. No API role reads or
-- writes a row: RLS on with one deny-all policy (carrying the tenant and scope helpers the audit asks for) and the
-- API request gate policy; record_project_open (the model route, at editor load) and list_recent_projects (the
-- project switcher) are the only ways in, both security definer. The table grants follow the default convention
-- (authenticated holds the four data privileges, so the policy is what refuses them), because the locked
-- rls.audit.test.ts pins the TABLE_GRANTS key list (the benchmark_run and edit_request precedent,
-- 20261116120000, 20261116140000). Rows per membership are bounded by the company's project count.
create table public.project_recent (
  tenant_id uuid not null references public.tenant (id),
  membership_id uuid not null,
  project_id uuid not null,
  opened_at timestamptz not null default now(),
  primary key (membership_id, project_id),
  foreign key (membership_id, tenant_id) references public.membership (id, tenant_id) on delete cascade,
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index project_recent_tenant_id_idx on public.project_recent (tenant_id);
create index project_recent_project_id_idx on public.project_recent (project_id);
create index project_recent_membership_opened_idx on public.project_recent (membership_id, opened_at desc);

alter table public.project_recent enable row level security;

create policy project_recent_none on public.project_recent
  for all to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
    and false
  )
  with check (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
    and false
  );

create policy project_recent_api_gate on public.project_recent as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.project_recent from public, anon, authenticated;
grant select, insert, update, delete on public.project_recent to authenticated;
grant select, insert, update, delete on public.project_recent to service_role;

comment on table public.project_recent is 'Each member''s recently opened projects; reached only through record_project_open and list_recent_projects (EZD-128)';

-- Records that the caller opened p_project: one row per (membership, project), opened_at set to now(). Gate
-- first; no user or tenant claim, or no active membership in the claim tenant, is 42501 permission_denied; a
-- null id is 22023 invalid_input; a project of another company, outside the caller's listed scope or missing is
-- P0002 project_not_found.
create function public.record_project_open(p_project uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_project is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select m.id into v_membership
  from public.membership m
  where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active';
  if v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  insert into public.project_recent (tenant_id, membership_id, project_id, opened_at)
  values (v_tenant, v_membership, p_project, now())
  on conflict (membership_id, project_id) do update set opened_at = excluded.opened_at;
end
$$;

revoke all on function public.record_project_open(uuid) from public, anon, service_role;
grant execute on function public.record_project_open(uuid) to authenticated;

-- The caller's recently opened projects, newest first (ties by id, descending), at most p_limit (1 to 20):
-- `[{ id, name, clientName }]`. Archived projects, the benchmark project, projects outside the caller's scope
-- (read live), other members' rows and p_exclude are left out. Gate first; claims and membership as
-- record_project_open (42501); a p_limit out of bounds is 22023.
create function public.list_recent_projects(p_limit integer, p_exclude uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_tenant uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  v_tenant := private.tenant_id();
  if v_user is null or v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  select m.id into v_membership
  from public.membership m
  where m.tenant_id = v_tenant and m.user_id = v_user and m.status = 'active';
  if v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object('id', x.id, 'name', x.name, 'clientName', x.client_name)
      order by x.opened_at desc, x.id desc
    )
    from (
      select p.id, p.name, c.name as client_name, r.opened_at
      from public.project_recent r
      join public.project p on p.id = r.project_id and p.tenant_id = v_tenant
      left join public.customer c on c.id = p.customer_id and c.tenant_id = v_tenant
      where r.tenant_id = v_tenant
        and r.membership_id = v_membership
        and p.archived_at is null
        and not p.is_benchmark
        and (p_exclude is null or p.id <> p_exclude)
        and ((select private.all_projects()) or p.id = any ((select private.listed_project_ids())::uuid[]))
      order by r.opened_at desc, p.id desc
      limit p_limit
    ) x
  ), '[]'::jsonb);
end
$$;

revoke all on function public.list_recent_projects(integer, uuid) from public, anon, service_role;
grant execute on function public.list_recent_projects(integer, uuid) to authenticated;
