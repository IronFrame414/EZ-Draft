-- EZD-219: the project's plan display scale, project.settings.plan_scale.
-- One of the seven plan scales (09 Q-0664 "Plan display scale"); written only by set_plan_scale.

alter table public.project
  add constraint project_settings_plan_scale_check
  check (
    not (settings ? 'plan_scale')
    or (
      jsonb_typeof(settings -> 'plan_scale') = 'number'
      and (settings ->> 'plan_scale')::numeric in (0.125, 0.1875, 0.25, 0.375, 0.5, 0.75, 1)
    )
  );

-- set_plan_scale: create_checkpoint steps (1)-(4), then the project's plan_scale, other keys kept.
create function public.set_plan_scale(p_project uuid, p_scale numeric)
returns numeric
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

  if p_scale is null or p_scale not in (0.125, 0.1875, 0.25, 0.375, 0.5, 0.75, 1) then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  update public.project p
    set settings = jsonb_set(p.settings, '{plan_scale}', to_jsonb(p_scale), true)
    where p.id = p_project and p.tenant_id = v_tenant;
  if not found then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return p_scale;
end
$$;

revoke all on function public.set_plan_scale(uuid, numeric) from public, anon, service_role;
grant execute on function public.set_plan_scale(uuid, numeric) to authenticated;
