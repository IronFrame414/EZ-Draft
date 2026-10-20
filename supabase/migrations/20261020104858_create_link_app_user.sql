-- EZD-007b Step 1 (vault/plans/EZD-007b.md; parent vault/plans/EZD-007.md Step 2.2): at first sign-in,
-- tie the verified email of the signed-in auth user to its own app_user row and accept that person's
-- one valid pending invite (Q-0050 (a)). Zero or one row: nothing when the caller is not signed in,
-- when the token's session has ended (finding B4; Q-0052 (c)), when the auth email is not confirmed,
-- or when no app_user row holds that email unlinked or already linked to this auth user. A row linked
-- to a different auth user is never re-pointed (EZD-005 Risks). An active membership means access and
-- nothing is accepted (Q-0043 (a): one active company per person); otherwise the most recent valid
-- invite (private.invite_is_valid, 7 days) becomes active, tie by the higher id, and every other
-- invite stays invited (Q-0099 (b)); otherwise has_access is false. Idempotent. Memberships are
-- locked for update while the decision is made. Executable by authenticated only; default privileges
-- for role postgres in public would otherwise let anon and service_role execute it (finding B3).
-- Listed in GATED_RPC_CALLS (app/test-harness/rls/gate.ts), so the API request gate applies.
create function public.link_app_user()
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
    return query select v_app_user_id, true, v_membership_id, v_tenant_id;
    return;
  end if;

  return query select v_app_user_id, false, null::uuid, null::uuid;
end
$$;

revoke all on function public.link_app_user() from public, anon, service_role;
grant execute on function public.link_app_user() to authenticated;
