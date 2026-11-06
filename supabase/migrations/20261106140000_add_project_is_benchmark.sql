-- EZD-236 Build step 3 (vault/plans/EZD-236.md section 1 M1; Q-0568): the benchmark project flag, one benchmark
-- project per tenant. Only a definer function (create_benchmark_project) sets the flag: the guard refuses an API
-- role that sets it on insert or changes it on update (inside a definer function current_user is the owner,
-- 20261019170002_create_api_request_gate.sql).
alter table public.project add column is_benchmark boolean not null default false;

create unique index project_benchmark_tenant_key on public.project (tenant_id) where is_benchmark;

create function private.project_benchmark_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated', 'service_role')
    and ((tg_op = 'INSERT' and new.is_benchmark)
      or (tg_op = 'UPDATE' and new.is_benchmark is distinct from old.is_benchmark))
  then
    raise exception 'benchmark_flag_server_only' using errcode = '42501';
  end if;
  return new;
end
$$;

revoke all on function private.project_benchmark_guard() from public;

create trigger project_benchmark_guard
  before insert or update of is_benchmark on public.project
  for each row execute function private.project_benchmark_guard();
