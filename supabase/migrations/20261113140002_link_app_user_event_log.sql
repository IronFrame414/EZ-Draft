-- EZD-109 (vault/plans/EZD-109.md Build step 3; Q-0695 decisions 03 row 33): link_app_user from
-- 20261027001745_guard_gated_rpcs.sql, word for word, except that an invite accepted at sign-in writes its
-- user.joined event_log row in the acceptance transaction (actor the joining person, IP null: the function
-- takes no argument). Signature, return table, volatility, security definer, search_path and grants unchanged.

create or replace function public.link_app_user()
returns table (
  app_user_id uuid,
  has_access boolean,
  accepted_membership_id uuid,
  accepted_tenant_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_email text;
  v_app_user_id uuid;
  v_membership_id uuid;
  v_tenant_id uuid;
begin
  perform private.require_api_gate();
  if v_auth_user_id is null then
    return;
  end if;

  if not private.session_is_live() then
    return;
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_auth_user_id
    and u.email_confirmed_at is not null;
  if v_email is null then
    return;
  end if;

  update public.app_user a
  set auth_user_id = v_auth_user_id
  where a.email = v_email
    and (a.auth_user_id is null or a.auth_user_id = v_auth_user_id);

  select a.id into v_app_user_id
  from public.app_user a
  where a.auth_user_id = v_auth_user_id;
  if v_app_user_id is null then
    return;
  end if;

  perform 1
  from public.membership m
  where m.user_id = v_app_user_id
  for update;

  if exists (
    select 1 from public.membership m
    where m.user_id = v_app_user_id and m.status = 'active'
  ) then
    return query select v_app_user_id, true, null::uuid, null::uuid;
    return;
  end if;

  select m.id, m.tenant_id into v_membership_id, v_tenant_id
  from public.membership m
  where m.user_id = v_app_user_id
    and private.invite_is_valid(m.status, m.invited_at)
  order by m.invited_at desc, m.id desc
  limit 1;

  if v_membership_id is not null then
    update public.membership
    set status = 'active'
    where id = v_membership_id and status = 'invited';
    if found then
      perform private.write_event_log_as('user.joined', v_tenant_id, v_app_user_id, 'membership',
        v_membership_id, jsonb_build_object('membershipId', v_membership_id, 'appUserId', v_app_user_id,
        'via', 'sign_in'), null);
    end if;
    return query select v_app_user_id, true, v_membership_id, v_tenant_id;
    return;
  end if;

  return query select v_app_user_id, false, null::uuid, null::uuid;
end
$$;

revoke all on function public.link_app_user() from public, anon, service_role;
grant execute on function public.link_app_user() to authenticated;
