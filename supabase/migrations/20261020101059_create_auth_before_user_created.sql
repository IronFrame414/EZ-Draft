-- EZD-007a Step 2.1 (vault/plans/EZD-007a.md; Q-0165 (a)): the before-user-created hook. Supabase Auth
-- calls it before it creates any auth user (sign-up, code request; supabase/config.toml
-- [auth.hook.before_user_created]). Users are invited in EZ Draft (R24 #14), so an account is allowed
-- only for an email that has an app_user row with a membership that is active or holds a valid
-- pending invite (private.invite_is_valid, Q-0050 (a)). app_user.email is stored lower-case, so the
-- incoming email is lower-cased before the lookup (one indexed query per new auth user). Everything
-- else, including a missing or empty email, is refused with http_code 403 and the stable code
-- sign_in_not_allowed (fail closed). Executable by supabase_auth_admin only; schema private is not on
-- the REST API.
create function private.auth_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(nullif(btrim(event -> 'user' ->> 'email'), ''));
  v_allowed boolean := false;
begin
  if v_email is not null then
    select exists (
      select 1
      from public.app_user u
      join public.membership m on m.user_id = u.id
      where u.email = v_email
        and (m.status = 'active' or private.invite_is_valid(m.status, m.invited_at))
    ) into v_allowed;
  end if;

  if v_allowed then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'sign_in_not_allowed')
  );
end
$$;

revoke all on function private.auth_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function private.auth_before_user_created(jsonb) to supabase_auth_admin;
