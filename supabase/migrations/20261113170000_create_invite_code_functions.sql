-- EZD-138 (S15 Users + permissions, board S15j; Q-0216; Q-0695 decisions 10 row 61; Q-0706; 09n "Invite expiry"
-- and "Invite code tries"): the invite link and 6-digit code shown again on the pending row, and the invite code
-- on the sign-in page.
--
-- The link and the code are worked out in the app from invite.secret with the server-held key
-- (app/src/server/users/invite-token.ts); these functions hand the random value to the server only and never
-- see the key, the link or the code. An invite is live while its membership is invited, it is neither accepted
-- nor cancelled, expires_at is in the future and private.invite_is_valid holds (the same test accept_invite
-- uses), so the code, the link and the shown row stop together.
--
-- invite_links_for_viewer: the Users page (authenticated, behind the API request gate, settings_users needed
-- through private.users_writer_tenant). Rows only for live invites of the caller's company that the caller may
-- see: the last sender or an active Owner-preset member (private.can_see_invite_link; Q-0216).
--
-- invite_code_take: the sign-in page's invite code (the invitee has no session): service_role only, called
-- from the one server-only secret-key file (app/src/server/auth/admin-auth.ts), as accept_invite. It returns
-- every live invite for the email whose code is not locked, adding one try to each before the app compares
-- (so concurrent tries never pass 5), and whether a live invite for the email is already locked. Five tries
-- lock the code until Resend (resend_invite sets code_tries = 0); the link never reads code_tries.

create function public.invite_links_for_viewer(p_membership_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  perform private.require_api_gate();
  if p_membership_ids is null then
    raise exception 'invalid_ids' using errcode = '22023';
  end if;
  if cardinality(p_membership_ids) > 50 then
    raise exception 'too_many_ids' using errcode = '22023';
  end if;
  v_tenant := private.users_writer_tenant();
  return coalesce((
    select jsonb_agg(jsonb_build_object('membershipId', i.membership_id, 'secret', i.secret)
      order by i.membership_id)
    from public.invite i
    join public.membership m on m.id = i.membership_id and m.tenant_id = i.tenant_id
    where i.membership_id = any (p_membership_ids)
      and i.tenant_id = v_tenant
      and m.status = 'invited'
      and i.accepted_at is null
      and i.cancelled_at is null
      and i.expires_at > now()
      and private.invite_is_valid(m.status, m.invited_at)
      and private.can_see_invite_link(i.membership_id)
  ), '[]'::jsonb);
end
$$;

revoke all on function public.invite_links_for_viewer(uuid[]) from public, anon, service_role;
grant execute on function public.invite_links_for_viewer(uuid[]) to authenticated;

create function public.invite_code_take(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invites jsonb;
  v_locked boolean;
begin
  if v_email = '' then
    return jsonb_build_object('invites', '[]'::jsonb, 'locked', false);
  end if;

  with live as (
    select i.id, i.code_tries, m.invited_at
    from public.invite i
    join public.membership m on m.id = i.membership_id and m.tenant_id = i.tenant_id
    join public.app_user a on a.id = m.user_id
    where a.email = v_email
      and m.status = 'invited'
      and i.accepted_at is null
      and i.cancelled_at is null
      and i.expires_at > now()
      and private.invite_is_valid(m.status, m.invited_at)
    for update of i
  ),
  bumped as (
    update public.invite i set code_tries = i.code_tries + 1
    from live l
    where i.id = l.id and l.code_tries < 5
    returning i.id, i.secret, i.code_tries, l.invited_at
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object('secret', b.secret, 'tries', b.code_tries)
        order by b.invited_at desc nulls last, b.id desc) from bumped b), '[]'::jsonb),
    exists (select 1 from live l where l.code_tries >= 5)
  into v_invites, v_locked;

  return jsonb_build_object('invites', v_invites, 'locked', v_locked);
end
$$;

revoke all on function public.invite_code_take(text) from public, anon, authenticated;
grant execute on function public.invite_code_take(text) to service_role;

-- invite_link_secret from 20261113150001 (EZD-105), word for word, except that an accepted, cancelled or
-- expired invite is not found: Copy link stops with the code (AC-EZD-138-1).
create or replace function public.invite_link_secret(p_membership_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_secret text;
  v_expires timestamptz;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  select i.secret, i.expires_at into v_secret, v_expires
  from public.invite i
  join public.membership m on m.id = i.membership_id and m.tenant_id = i.tenant_id
  where i.membership_id = p_membership_id
    and i.tenant_id = v_tenant
    and m.status = 'invited'
    and i.accepted_at is null
    and i.cancelled_at is null
    and i.expires_at > now()
    and private.invite_is_valid(m.status, m.invited_at)
    and private.can_see_invite_link(p_membership_id);
  if v_secret is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('membershipId', p_membership_id, 'secret', v_secret, 'expiresAt', v_expires);
end
$$;

revoke all on function public.invite_link_secret(uuid) from public, anon, service_role;
grant execute on function public.invite_link_secret(uuid) to authenticated;
