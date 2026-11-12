-- EZD-236 Build step 5 (vault/plans/EZD-236.md section 1 M3; Q-0211; Q-0568; AC-EZD-236-1): makes the caller's
-- tenant its one benchmark project and writes the given model into it through save_objects. Runs
-- private.require_api_gate() first; no tenant or membership claim, or no granted System status switch, is 42501
-- permission_denied. An existing benchmark project is returned as is (created false), also when a racing call
-- made it first. Any error rolls back the whole call, project row included.
create function public.create_benchmark_project(p_changes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_membership uuid;
  v_id uuid;
  v_saved jsonb;
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

  select id into v_id from public.project where tenant_id = v_tenant and is_benchmark;
  if found then
    return jsonb_build_object('project_id', v_id, 'created', false);
  end if;

  insert into public.project (tenant_id, name, address, type, is_benchmark)
  values (v_tenant, 'Benchmark project', 'Generated for speed tests', 'whole_home_interior', true)
  on conflict (tenant_id) where is_benchmark do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.project where tenant_id = v_tenant and is_benchmark;
    return jsonb_build_object('project_id', v_id, 'created', false);
  end if;

  delete from public.model_object where project_id = v_id;

  v_saved := public.save_objects(v_id, 0, p_changes);
  if (v_saved ->> 'status') is distinct from 'saved' then
    raise exception 'benchmark_write_failed' using errcode = '55000';
  end if;

  return jsonb_build_object('project_id', v_id, 'created', true);
end
$$;

revoke all on function public.create_benchmark_project(jsonb) from public, anon, service_role;
grant execute on function public.create_benchmark_project(jsonb) to authenticated;
