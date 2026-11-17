-- EZD-237 (vault/plans/EZD-237.md section 1 M1, F1, F2; 03e benchmark_run; Q-0664 03-data-model, 05-screens;
-- 11 rules 9, 10; AC-EZD-237-1, -2): one row per benchmark run, with the device, the app version and the frame
-- times per step (pan, zoom, drag) and memory in `results`. No money field (03b rule 2). No API role reads or
-- writes a row: RLS on with one deny-all policy and the API request gate policy; rows are written by
-- record_benchmark_run (System status and Edit model) and read by list_benchmark_runs (System status), both
-- security definer. The table grants follow the default convention (authenticated holds the four data
-- privileges, so the policy is what refuses them), because the locked rls.audit.test.ts pins the TABLE_GRANTS
-- key list (the event_log and invite precedent, 20261113140000, 20261113150000). Policies never read
-- permission rows (EZD-102); the definer functions check the switches.
create table public.benchmark_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  created_by uuid references public.app_user (id) on delete set null,
  device jsonb not null check (jsonb_typeof(device) = 'object'),
  app_version text not null check (char_length(app_version) between 1 and 64),
  results jsonb not null check (jsonb_typeof(results) = 'object'),
  run_at timestamptz not null default now()
);

create index benchmark_run_tenant_run_at_idx on public.benchmark_run (tenant_id, run_at desc, id desc);
create index benchmark_run_created_by_idx on public.benchmark_run (created_by);

alter table public.benchmark_run enable row level security;

create policy benchmark_run_none on public.benchmark_run
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

create policy benchmark_run_api_gate on public.benchmark_run as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.benchmark_run from public, anon, authenticated;
grant select, insert, update, delete on public.benchmark_run to authenticated;
grant select, insert, update, delete on public.benchmark_run to service_role;

comment on table public.benchmark_run is 'Data model entity: benchmark_run (EZD-237)';

-- F1: writes one run for the caller's tenant. Gate first; no tenant, membership or app user claim, or a missing
-- System status or Edit model switch, is 42501 permission_denied; a non-object device or results, or an app
-- version outside 1 to 64 characters, is 22023 invalid_input.
create function public.record_benchmark_run(p_device jsonb, p_app_version text, p_results jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_membership uuid;
  v_user uuid;
  v_id uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_user := private.app_user_id();
  if v_tenant is null or v_membership is null or v_user is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'settings_system_status'
      and up.granted
  ) or not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_device is null or jsonb_typeof(p_device) is distinct from 'object'
    or p_results is null or jsonb_typeof(p_results) is distinct from 'object'
    or p_app_version is null or char_length(p_app_version) not between 1 and 64 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.benchmark_run (tenant_id, created_by, device, app_version, results)
  values (v_tenant, v_user, p_device, p_app_version, p_results)
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.record_benchmark_run(jsonb, text, jsonb) from public, anon, service_role;
grant execute on function public.record_benchmark_run(jsonb, text, jsonb) to authenticated;

-- F2: one page of the caller's tenant's runs, newest first, 50 per page, with the total. Gate first; no tenant
-- or membership claim, or no System status switch, is 42501; a page outside 1 to 1,000,000 is 22023.
create function public.list_benchmark_runs(p_page integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_membership uuid;
  v_total bigint;
  v_rows jsonb;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'settings_system_status'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_page is null or p_page < 1 or p_page > 1000000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select count(*) into v_total from public.benchmark_run where tenant_id = v_tenant;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'run_at', r.run_at,
        'device', r.device,
        'app_version', r.app_version,
        'results', r.results
      )
      order by r.run_at desc, r.id desc
    ),
    '[]'::jsonb
  ) into v_rows
  from (
    select id, run_at, device, app_version, results from public.benchmark_run
    where tenant_id = v_tenant
    order by run_at desc, id desc
    limit 50 offset (p_page - 1) * 50
  ) r;

  return jsonb_build_object('total', v_total, 'rows', v_rows);
end
$$;

revoke all on function public.list_benchmark_runs(integer) from public, anon, service_role;
grant execute on function public.list_benchmark_runs(integer) to authenticated;
