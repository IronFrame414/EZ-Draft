-- EZD-108 Step 1 (vault/plans/EZD-108.md section 1 Data): the signed-in user's own profile. `app_user`
-- stays select-only to authenticated; update_my_profile writes the caller's own row only (language and
-- iPad drawing, S15 Avatar; Q-0392) and current_user_has_password reads only the caller's own auth row
-- (Q-0412). When nothing changed no update runs, so updated_at stays. Executable by authenticated only
-- behind the API request gate (L-016; 20261027001745_guard_gated_rpcs.sql); both are listed in
-- GATED_RPC_CALLS (app/test-harness/rls/gate.ts).
create function public.update_my_profile(
  p_language text,
  p_ipad_input_mode text
)
returns table (
  saved_language text,
  saved_ipad_input_mode text,
  language_changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_old_language text;
  v_old_mode text;
begin
  perform private.require_api_gate();
  v_user := private.app_user_id();
  if v_user is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_language is null or p_language not in ('en', 'es')
    or p_ipad_input_mode is null or p_ipad_input_mode not in ('pencil', 'finger') then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select u.language, u.ipad_input_mode
    into v_old_language, v_old_mode
  from public.app_user u
  where u.id = v_user
  for update;

  if v_old_language is distinct from p_language or v_old_mode is distinct from p_ipad_input_mode then
    update public.app_user u
    set language = p_language,
        ipad_input_mode = p_ipad_input_mode
    where u.id = v_user;
  end if;

  return query
  select u.language, u.ipad_input_mode, v_old_language is distinct from p_language
  from public.app_user u
  where u.id = v_user;
end
$$;

revoke all on function public.update_my_profile(text, text) from public, anon, service_role;
grant execute on function public.update_my_profile(text, text) to authenticated;

create function public.current_user_has_password()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_api_gate();
  return coalesce(
    (select coalesce(u.encrypted_password, '') <> '' from auth.users u where u.id = auth.uid()),
    false
  );
end
$$;

revoke all on function public.current_user_has_password() from public, anon, service_role;
grant execute on function public.current_user_has_password() to authenticated;
