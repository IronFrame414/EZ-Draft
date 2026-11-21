-- EZD-709 (S15b; R24 #7; AC-EZD-709-1, AC-EZD-709-2): the title block settings.
--
-- update_tenant_title_block(p_show_company): the one write of Settings > Title block (tenant stays select-only,
-- the update_tenant_code_edition pattern). The layout is fixed; the user controls the company-block switch only
-- (S15b Decision 1), stored as tenant.title_block.show_company. A missing key reads as on (assumptions EZD-709).
-- It checks the caller's own settings_title_block row (42501) and takes a boolean (22023 invalid_input for
-- null). Under the tenant row lock; `changed` lists what changed ('show_company'); nothing changed means no
-- update. Other keys of tenant.title_block are kept.

create function public.update_tenant_title_block(p_show_company boolean)
returns table (tenant_id uuid, title_block jsonb, changed text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_old public.tenant;
  v_block jsonb;
  v_changed text[] := array[]::text[];
begin
  perform private.require_api_gate();
  if v_tenant is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_permission up
    join public.membership m on m.id = up.membership_id and m.tenant_id = up.tenant_id
    where up.membership_id = v_membership and up.tenant_id = v_tenant and m.status = 'active'
      and up.permission_key = 'settings_title_block' and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_show_company is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_old from public.tenant t where t.id = v_tenant for update;
  v_block := case when jsonb_typeof(v_old.title_block) = 'object' then v_old.title_block else '{}'::jsonb end;

  -- A missing or non-boolean value reads as on; saving the value already in effect is no change.
  if (case when jsonb_typeof(v_block -> 'show_company') = 'boolean'
        then (v_block ->> 'show_company')::boolean else true end) is distinct from p_show_company then
    v_changed := array_append(v_changed, 'show_company');
    update public.tenant t
    set title_block = v_block || jsonb_build_object('show_company', p_show_company)
    where t.id = v_tenant;
  end if;

  return query select t.id, t.title_block, v_changed from public.tenant t where t.id = v_tenant;
end
$$;
revoke all on function public.update_tenant_title_block(boolean) from public, anon, service_role;
grant execute on function public.update_tenant_title_block(boolean) to authenticated;
