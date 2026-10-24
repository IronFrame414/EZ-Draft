-- EZD-006 Step 2 (vault/plans/EZD-006.md): the custom access token hook. Supabase Auth calls it on
-- every token it issues (sign-in and each refresh; supabase/config.toml [auth.hook.custom_access_token]).
-- One indexed query: app_user by auth_user_id (unique index) left-joined to the active memberships
-- (membership_user_id_idx). Claims added: app_user_id when an app_user row is linked; tenant_id,
-- membership_id and project_scope when exactly one active membership exists. Two or more active
-- memberships set app_user_id only (Q-0043 (a): one active company per person; the write paths refuse
-- a second, this hook fails closed). invited and deactivated memberships never produce a tenant claim.
-- No row: the claims are returned unchanged. The hook never fails sign-in.
create function private.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := (event ->> 'user_id')::uuid;
  v_claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_app_user_id uuid;
  v_active int;
  v_membership_id uuid;
  v_tenant_id uuid;
  v_scope text;
begin
  if v_auth_user_id is null then
    return jsonb_build_object('claims', v_claims);
  end if;

  select u.id,
    count(m.id),
    (array_agg(m.id))[1],
    (array_agg(m.tenant_id))[1],
    (array_agg(m.scope))[1]
  into v_app_user_id, v_active, v_membership_id, v_tenant_id, v_scope
  from public.app_user u
  left join public.membership m on m.user_id = u.id and m.status = 'active'
  where u.auth_user_id = v_auth_user_id
  group by u.id;

  if v_app_user_id is null then
    return jsonb_build_object('claims', v_claims);
  end if;

  v_claims := v_claims || jsonb_build_object('app_user_id', v_app_user_id);
  if v_active = 1 then
    v_claims := v_claims || jsonb_build_object(
      'tenant_id', v_tenant_id,
      'membership_id', v_membership_id,
      'project_scope', v_scope
    );
  end if;
  return jsonb_build_object('claims', v_claims);
end
$$;

revoke all on function private.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function private.custom_access_token_hook(jsonb) to supabase_auth_admin;
