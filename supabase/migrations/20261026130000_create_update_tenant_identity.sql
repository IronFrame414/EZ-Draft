-- EZD-112 Step 1 (vault/plans/EZD-112.md section 1): the one write path for the company identity on
-- Settings > Company (S15a): name, logo path, license number and contact. `tenant` stays select-only to
-- authenticated (ARCH Row-level security "Grants"); this function writes the claim tenant's row only.
-- The route checks `settings_company` with can() first; the user_permission check here is the backstop
-- (03b rule 1). `changed` lists name, logo, license_no, contact (that order) whose value changed; when
-- nothing changed no update runs, so updated_at stays. Executable by authenticated only (ARCH Function
-- grants convention); listed in GATED_RPC_CALLS (app/test-harness/rls/gate.ts).
create function public.update_tenant_identity(
  p_name text,
  p_license_no text,
  p_contact jsonb,
  p_set_logo boolean,
  p_logo_path text
)
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_logo_path text,
  tenant_license_no text,
  tenant_contact jsonb,
  tenant_updated_at timestamptz,
  changed text[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
  v_old_name text;
  v_old_logo text;
  v_old_license text;
  v_old_contact jsonb;
  v_new_logo text;
  v_changed text[] := array[]::text[];
begin
  if v_tenant is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'settings_company'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'company_name_required' using errcode = '22023';
  end if;

  if p_contact is null or jsonb_typeof(p_contact) <> 'object' then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  if p_set_logo and p_logo_path is not null
    and p_logo_path !~ ('^' || v_tenant::text || '/tenant/logo/[0-9a-f-]{36}\.(png|jpg|svg)$') then
    raise exception 'logo_path_invalid' using errcode = '22023';
  end if;

  select t.name, t.logo_path, t.license_no, t.contact
    into v_old_name, v_old_logo, v_old_license, v_old_contact
  from public.tenant t
  where t.id = v_tenant
  for update;

  if p_set_logo then
    v_new_logo := p_logo_path;
  else
    v_new_logo := v_old_logo;
  end if;

  if v_old_name is distinct from p_name then
    v_changed := v_changed || 'name'::text;
  end if;
  if v_old_logo is distinct from v_new_logo then
    v_changed := v_changed || 'logo'::text;
  end if;
  if v_old_license is distinct from p_license_no then
    v_changed := v_changed || 'license_no'::text;
  end if;
  if v_old_contact is distinct from p_contact then
    v_changed := v_changed || 'contact'::text;
  end if;

  if cardinality(v_changed) > 0 then
    update public.tenant t
    set name = p_name,
        logo_path = v_new_logo,
        license_no = p_license_no,
        contact = p_contact
    where t.id = v_tenant;
  end if;

  return query
  select t.id, t.name, t.logo_path, t.license_no, t.contact, t.updated_at, v_changed
  from public.tenant t
  where t.id = v_tenant;
end
$$;

revoke all on function public.update_tenant_identity(text, text, jsonb, boolean, text) from public, anon, service_role;
grant execute on function public.update_tenant_identity(text, text, jsonb, boolean, text) to authenticated;
