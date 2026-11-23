-- EZD-611a (03c code_check_run; 09c Code check engine): the stored check runs. See the header of
-- 20261123100000_create_code_rule.sql, item 2.
create table public.code_check_run (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  project_id uuid not null,
  -- The checkpoint checked; null for an on-demand run of the working copy.
  model_version_id uuid references public.model_version (id) on delete set null,
  -- The project's edition at the run; record_code_check_run takes only editions the app knows.
  edition text not null check (char_length(edition) between 1 and 64),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  accepted_notes jsonb not null default '[]' check (jsonb_typeof(accepted_notes) = 'array'),
  created_by uuid references public.app_user (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (project_id, tenant_id) references public.project (id, tenant_id) on delete cascade
);

create index code_check_run_tenant_id_idx on public.code_check_run (tenant_id);
create index code_check_run_project_list_idx on public.code_check_run (project_id, created_at desc);
create index code_check_run_model_version_id_idx on public.code_check_run (model_version_id);
create index code_check_run_created_by_idx on public.code_check_run (created_by);

alter table public.code_check_run enable row level security;

create policy code_check_run_select on public.code_check_run for select to authenticated
  using (
    tenant_id = (select private.tenant_id())
    and ((select private.all_projects()) or project_id = any ((select private.listed_project_ids())::uuid[]))
  );

create policy code_check_run_api_gate on public.code_check_run as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

grant select, insert, update, delete on public.code_check_run to authenticated;
grant select, insert, update, delete on public.code_check_run to service_role;

comment on table public.code_check_run is 'Data model entity: code_check_run (03c code_check_run; EZD-611a)';

-- record_code_check_run(p_project, p_model_version, p_edition, p_warnings): stores one run and returns its id. The
-- caller needs Run code check and sight of the project (42501 otherwise, so a hidden project says nothing); the
-- checkpoint, when given, must be one of that project's (22023); the edition must be one the app knows and the
-- results an array of at most 20,000 entries (22023).
create function public.record_code_check_run(
  p_project uuid,
  p_model_version uuid,
  p_edition text,
  p_warnings jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_id uuid;
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null or p_project is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'run_code_check' and up.granted
  ) or not private.can_see_project(p_project) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_edition is null or not private.is_code_edition(p_edition)
    or p_warnings is null or jsonb_typeof(p_warnings) <> 'array' or jsonb_array_length(p_warnings) > 20000 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if p_model_version is not null and not exists (
    select 1 from public.model_version mv
    where mv.id = p_model_version and mv.project_id = p_project and mv.tenant_id = v_tenant
  ) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  insert into public.code_check_run (tenant_id, project_id, model_version_id, edition, warnings, created_by)
  values (v_tenant, p_project, p_model_version, p_edition, p_warnings, private.app_user_id())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_code_check_run(uuid, uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.record_code_check_run(uuid, uuid, text, jsonb) to authenticated;
