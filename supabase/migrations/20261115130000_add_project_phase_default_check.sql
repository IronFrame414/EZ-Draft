-- EZD-214: the project's phase view, project.phase_default (03 Q-0664 "View default").
-- existing or proposed; new projects start Existing; nothing stored before is changed but this column.
-- Written by the View control through set_phase_default (Edit model), never by a direct update from the app.

update public.project
  set phase_default = 'existing'
  where phase_default is null or phase_default not in ('existing', 'proposed');

alter table public.project
  alter column phase_default set default 'existing',
  alter column phase_default set not null,
  add constraint project_phase_default_check check (phase_default in ('existing', 'proposed'));

-- set_phase_default: the set_plan_scale gate (api gate, Edit model, project in scope), then the project's view.
create function public.set_phase_default(p_project uuid, p_phase text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_user uuid;
  v_membership uuid;
begin
  perform private.require_api_gate();

  v_tenant := private.tenant_id();
  v_user := private.app_user_id();
  v_membership := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'edit_model'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  if p_phase is null or p_phase not in ('existing', 'proposed') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.project p
    set phase_default = p_phase
    where p.id = p_project and p.tenant_id = v_tenant;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return p_phase;
end
$$;

revoke all on function public.set_phase_default(uuid, text) from public, anon, service_role;
grant execute on function public.set_phase_default(uuid, text) to authenticated;

-- project_update (RLS) lets any member who sees the project update the row, so a direct change of phase_default
-- by an API role is refused: the column is written only through set_phase_default (definer, Edit model).
create function private.project_phase_default_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phase_default is distinct from old.phase_default
    and current_user in ('authenticated', 'anon') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger project_phase_default_guard
  before update of phase_default on public.project
  for each row execute function private.project_phase_default_guard();

-- A trigger function is not called by a role; nobody executes it directly.
revoke all on function private.project_phase_default_guard() from public, anon, authenticated, service_role;
