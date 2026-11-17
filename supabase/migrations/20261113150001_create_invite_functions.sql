-- EZD-105 (S15 Invite user, Row: Resend, More menu Cancel invite; Q-0695 decisions 10 rows 59, 61-63; Q-0043;
-- Q-0216; Q-0029; S15 Decision 13): the invite writes and the invitee's accept.
--
-- create_invite, resend_invite and cancel_invite run under the inviter's session, behind the API request gate,
-- and need settings_users (private.users_writer_tenant, 42501 otherwise; Q-0695 row 59). Each writes its
-- event_log row in its own transaction (Q-0695 decisions 03 row 33; AC-EZD-105-8) with the request IP the
-- route passes. The app makes the per-invite random value and the token's sha-256 and passes both in, so the
-- server-held HKDF key never reaches the database (invite-token.ts).
--
-- Refusals (Q-0695 row 63), each with nothing written: invalid_email / invalid_input (22023); already_member,
-- already_invited, deactivated_member (the screen offers Reactivate) and email_in_use (active in another
-- company; never names it) (P0001); member_not_found (P0002); member_state (22023).
--
-- accept_invite and invite_status are for the invitee, who has no session yet: service_role only, called from
-- the one server-only secret-key file (app/src/server/auth/admin-auth.ts). accept_invite is the one database
-- step of Q-0695 row 61: it checks the token, that the invite is live (7 days from the last send) and that
-- the email has no other active company, makes the membership active, marks the invite accepted and writes
-- user.joined (via invite_link). The session is made only after it commits.

create function private.invite_scope_default(p_role_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Owner and Designer start on All projects; Foreman, Crew and every custom role on Listed (S15 D13;
  -- Q-0695 row 63; 09n Project scope row 5).
  select case when r.preset in ('owner', 'designer') then 'all' else 'listed' end
  from public.role r where r.id = p_role_id;
$$;

revoke all on function private.invite_scope_default(uuid) from public;

-- Last sender or an active Owner-preset member of the invite's company may see its link and code (Q-0216;
-- Q-0706). Read by list_users (invoker) for canCopyLink and by invite_link_secret.
create function private.can_see_invite_link(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.membership m
    join public.membership vm
      on vm.id = nullif(auth.jwt() ->> 'membership_id', '')::uuid
      and vm.tenant_id = m.tenant_id
      and vm.status = 'active'
    left join public.role vr on vr.id = vm.role_id and vr.tenant_id = vm.tenant_id
    where m.id = p_membership_id
      and m.status = 'invited'
      and (vr.preset = 'owner' or exists (
        select 1 from public.invite i
        where i.membership_id = m.id and i.sent_by = private.app_user_id()))
  );
$$;

revoke all on function private.can_see_invite_link(uuid) from public;
grant execute on function private.can_see_invite_link(uuid) to authenticated;

create function public.create_invite(
  p_email text,
  p_name text,
  p_role_id uuid,
  p_language text,
  p_scope text,
  p_secret text,
  p_token_sha256 text,
  p_ip inet default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_scope text;
  v_user uuid;
  v_status text;
  v_membership uuid;
  v_invited_at timestamptz := now();
  v_invite uuid;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();

  if char_length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if (v_name is not null and char_length(v_name) > 100)
    or p_role_id is null
    or p_language is null or p_language not in ('en', 'es')
    or (p_scope is not null and p_scope not in ('all', 'listed'))
    or p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
    or p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
    or not exists (select 1 from public.role r where r.id = p_role_id and r.tenant_id = v_tenant)
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  v_scope := coalesce(p_scope, private.invite_scope_default(p_role_id));

  -- One invite at a time per email, whether or not the person exists yet.
  perform pg_advisory_xact_lock(hashtextextended('ezd-invite:' || v_email, 0));

  select u.id into v_user from public.app_user u where u.email = v_email for update;
  if v_user is not null then
    select m.status into v_status
    from public.membership m
    where m.tenant_id = v_tenant and m.user_id = v_user;
    if v_status = 'active' then
      raise exception 'already_member' using errcode = 'P0001';
    elsif v_status = 'invited' then
      raise exception 'already_invited' using errcode = 'P0001';
    elsif v_status = 'deactivated' then
      raise exception 'deactivated_member' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.membership o
      where o.user_id = v_user and o.status = 'active' and o.tenant_id <> v_tenant
    ) then
      raise exception 'email_in_use' using errcode = 'P0001';
    end if;
    -- The person is active nowhere: the inviter's name and language apply (a name already on file is kept
    -- when none is typed).
    update public.app_user u
    set name = coalesce(v_name, u.name), language = p_language
    where u.id = v_user;
  else
    insert into public.app_user (email, name, language)
    values (v_email, v_name, p_language)
    returning id into v_user;
  end if;

  insert into public.membership (tenant_id, user_id, status, scope, invited_at, role_id)
  values (v_tenant, v_user, 'invited', v_scope, v_invited_at, p_role_id)
  returning id into v_membership;

  insert into public.invite (tenant_id, membership_id, secret, token_sha256, expires_at, created_by, sent_by)
  values (v_tenant, v_membership, p_secret, p_token_sha256, v_invited_at + interval '7 days', v_actor, v_actor)
  returning id into v_invite;

  perform private.write_event_log_as('user.invited', v_tenant, v_actor, 'membership', v_membership,
    jsonb_build_object('membershipId', v_membership, 'appUserId', v_user, 'roleId', p_role_id,
      'scope', v_scope), p_ip);

  return (
    select jsonb_build_object(
      'membershipId', v_membership,
      'appUserId', v_user,
      'tenantId', v_tenant,
      'roleId', p_role_id,
      'scope', v_scope,
      'email', v_email,
      'language', p_language,
      'expiresAt', v_invited_at + interval '7 days',
      'companyName', t.name,
      'companyEmail', nullif(btrim(coalesce(t.contact ->> 'email', '')), ''),
      'inviterName', (select a.name from public.app_user a where a.id = v_actor))
    from public.tenant t where t.id = v_tenant);
end
$$;

revoke all on function public.create_invite(text, text, uuid, text, text, text, text, inet)
  from public, anon, service_role;
grant execute on function public.create_invite(text, text, uuid, text, text, text, text, inet)
  to authenticated;

-- Resend (S15 Row: Resend; Q-0695 rows 61, 63): a new random value and token hash, invited_at and expires_at
-- moved to now and now + 7 days, the code tries back to 0, and the caller becomes the sender. The old link and
-- code stop working because their token hash and random value are gone. A pending row with no invite row
-- (made before EZD-105) gets one.
create function public.resend_invite(
  p_membership_id uuid,
  p_secret text,
  p_token_sha256 text,
  p_ip inet default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_user uuid;
  v_status text;
  v_now timestamptz := now();
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
  if p_secret is null or p_secret !~ '^[0-9a-f]{64}$'
    or p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select m.user_id, m.status into v_user, v_status
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'invited' then
    raise exception 'member_state' using errcode = '22023';
  end if;

  update public.membership m set invited_at = v_now where m.id = p_membership_id;

  insert into public.invite as i
    (tenant_id, membership_id, secret, token_sha256, expires_at, created_by, sent_by)
  values (v_tenant, p_membership_id, p_secret, p_token_sha256, v_now + interval '7 days', v_actor, v_actor)
  on conflict (membership_id) do update
  set secret = excluded.secret,
    token_sha256 = excluded.token_sha256,
    expires_at = excluded.expires_at,
    code_tries = 0,
    accepted_at = null,
    cancelled_at = null,
    sent_by = excluded.sent_by;

  perform private.write_event_log_as('user.invite_resent', v_tenant, v_actor, 'membership', p_membership_id,
    jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user), p_ip);

  return (
    select jsonb_build_object(
      'membershipId', p_membership_id,
      'appUserId', v_user,
      'tenantId', v_tenant,
      'email', u.email,
      'language', u.language,
      'expiresAt', v_now + interval '7 days',
      'companyName', t.name,
      'companyEmail', nullif(btrim(coalesce(t.contact ->> 'email', '')), ''),
      'inviterName', (select a.name from public.app_user a where a.id = v_actor))
    from public.app_user u, public.tenant t
    where u.id = v_user and t.id = v_tenant);
end
$$;

revoke all on function public.resend_invite(uuid, text, text, inet) from public, anon, service_role;
grant execute on function public.resend_invite(uuid, text, text, inet) to authenticated;

-- Cancel invite (S15 More menu; Q-0695 row 62): deletes the invited membership; its switches, listed
-- projects and invite cascade. The person's other companies are untouched (the session triggers end
-- sessions only when the old status was active, 20261113120000).
create function public.cancel_invite(p_membership_id uuid, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_actor uuid;
  v_user uuid;
  v_status text;
begin
  perform private.require_api_gate();
  v_tenant := private.users_writer_tenant();
  v_actor := private.event_log_actor();
  select m.user_id, m.status into v_user, v_status
  from public.membership m
  where m.id = p_membership_id and m.tenant_id = v_tenant
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'invited' then
    raise exception 'member_state' using errcode = '22023';
  end if;

  delete from public.membership m where m.id = p_membership_id;
  set constraints all immediate;
  perform private.write_event_log_as('user.invite_cancelled', v_tenant, v_actor, 'membership',
    p_membership_id, jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user), p_ip);
  return jsonb_build_object('membershipId', p_membership_id, 'appUserId', v_user, 'tenantId', v_tenant);
end
$$;

revoke all on function public.cancel_invite(uuid, inet) from public, anon, service_role;
grant execute on function public.cancel_invite(uuid, inet) to authenticated;

-- The random value of a pending invite, for its Copy link and code (Q-0216; Q-0706): only the last sender
-- and active Owner-preset members get it; anyone else, or a row that is not a pending invite, gets
-- member_not_found.
create function public.invite_link_secret(p_membership_id uuid)
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
    and private.can_see_invite_link(p_membership_id);
  if v_secret is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('membershipId', p_membership_id, 'secret', v_secret, 'expiresAt', v_expires);
end
$$;

revoke all on function public.invite_link_secret(uuid) from public, anon, service_role;
grant execute on function public.invite_link_secret(uuid) to authenticated;

-- What the invite page shows on GET (nothing is changed): whether the link is live, and the company name.
create function public.invite_status(p_token_sha256 text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('live', true, 'companyName', t.name)
    from public.invite i
    join public.membership m on m.id = i.membership_id and m.tenant_id = i.tenant_id
    join public.tenant t on t.id = i.tenant_id
    where i.token_sha256 = p_token_sha256
      and i.accepted_at is null
      and i.cancelled_at is null
      and i.expires_at > now()
      and private.invite_is_valid(m.status, m.invited_at)
  ), jsonb_build_object('live', false));
$$;

revoke all on function public.invite_status(text) from public, anon, authenticated;
grant execute on function public.invite_status(text) to service_role;

create function public.accept_invite(p_token_sha256 text, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite uuid;
  v_membership uuid;
  v_tenant uuid;
  v_user uuid;
  v_email text;
  v_status text;
  v_invited_at timestamptz;
  v_expires timestamptz;
  v_accepted timestamptz;
  v_cancelled timestamptz;
begin
  if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'refused');
  end if;

  select i.id, i.membership_id, i.tenant_id, i.expires_at, i.accepted_at, i.cancelled_at
  into v_invite, v_membership, v_tenant, v_expires, v_accepted, v_cancelled
  from public.invite i
  where i.token_sha256 = p_token_sha256;
  if v_invite is null then
    return jsonb_build_object('status', 'refused');
  end if;

  select m.user_id into v_user from public.membership m where m.id = v_membership;
  -- The same lock order as link_app_user and reactivate_member: the person, then their memberships.
  select u.email into v_email from public.app_user u where u.id = v_user for update;
  perform 1 from public.membership m where m.user_id = v_user for update;
  select m.status, m.invited_at into v_status, v_invited_at
  from public.membership m where m.id = v_membership;
  perform 1 from public.invite i where i.id = v_invite for update;
  select i.expires_at, i.accepted_at, i.cancelled_at into v_expires, v_accepted, v_cancelled
  from public.invite i where i.id = v_invite;

  if v_status is distinct from 'invited'
    or v_accepted is not null
    or v_cancelled is not null
    or v_expires <= now()
    or not private.invite_is_valid(v_status, v_invited_at)
  then
    return jsonb_build_object('status', 'refused');
  end if;
  -- One active company per person (Q-0043).
  if exists (
    select 1 from public.membership o
    where o.user_id = v_user and o.status = 'active' and o.id <> v_membership
  ) then
    return jsonb_build_object('status', 'refused');
  end if;

  update public.membership m set status = 'active' where m.id = v_membership;
  update public.invite i set accepted_at = now() where i.id = v_invite;
  perform private.write_event_log_as('user.joined', v_tenant, v_user, 'membership', v_membership,
    jsonb_build_object('membershipId', v_membership, 'appUserId', v_user, 'via', 'invite_link'), p_ip);

  return jsonb_build_object(
    'status', 'accepted',
    'membershipId', v_membership,
    'appUserId', v_user,
    'tenantId', v_tenant,
    'email', v_email);
end
$$;

revoke all on function public.accept_invite(text, inet) from public, anon, authenticated;
grant execute on function public.accept_invite(text, inet) to service_role;

-- list_users from 20261113120001 (EZD-106), word for word, except canCopyLink: an invited row whose link the
-- viewer may see (the last sender or an active Owner-preset member; private.can_see_invite_link; Q-0706).
create or replace function public.list_users(p_search text, p_page integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with term as (
    select replace(replace(replace(btrim(coalesce(p_search, '')), '\', '\\'), '%', '\%'), '_', '\_') as t
  ),
  base as (
    select m.id, m.status, m.last_active_at, m.invited_at, u.name, u.email, u.language,
      r.id as role_id, r.name as role_name, r.preset as role_preset,
      r.default_permissions as role_defaults,
      case m.status when 'active' then 0 when 'invited' then 1 else 2 end as status_order
    from public.membership m
    join public.app_user u on u.id = m.user_id
    left join public.role r on r.id = m.role_id and r.tenant_id = m.tenant_id
    where m.status in ('active', 'invited', 'deactivated')
  ),
  filtered as (
    select b.* from base b, term
    where term.t = ''
      or coalesce(b.name, '') ilike '%' || term.t || '%'
      or b.email ilike '%' || term.t || '%'
  ),
  page as (
    select f.* from filtered f
    order by f.status_order, lower(coalesce(nullif(btrim(f.name), ''), f.email)), f.id
    limit 50 offset (greatest(coalesce(p_page, 1), 1) - 1) * 50
  ),
  grants as (
    select p.membership_id, array_agg(p.permission_key order by p.permission_key) as keys
    from public.user_permission p
    where p.granted and p.membership_id in (select id from page)
    group by p.membership_id
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'membershipId', pg.id,
        'status', pg.status,
        'name', pg.name,
        'email', pg.email,
        'language', pg.language,
        'role', case when pg.role_id is null then null else jsonb_build_object(
          'id', pg.role_id, 'name', pg.role_name, 'preset', pg.role_preset,
          'defaultPermissions', to_jsonb(pg.role_defaults)) end,
        'grantedKeys', to_jsonb(coalesce(g.keys, '{}'::text[])),
        'lastActiveAt', pg.last_active_at,
        'invitedAt', pg.invited_at,
        'canCopyLink', pg.status = 'invited' and (select private.can_see_invite_link(pg.id)))
      order by pg.status_order, lower(coalesce(nullif(btrim(pg.name), ''), pg.email)), pg.id)
      from page pg left join grants g on g.membership_id = pg.id), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'preset', r.preset,
        'defaultPermissions', to_jsonb(r.default_permissions))
      order by case r.preset when 'owner' then 0 when 'designer' then 1 when 'foreman' then 2
        when 'crew' then 3 else 4 end, lower(r.name), r.id)
      from public.role r), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'active', (select count(*) from base where status = 'active'),
    'invited', (select count(*) from base where status = 'invited'),
    'en', (select count(*) from base where status <> 'deactivated' and language = 'en'),
    'es', (select count(*) from base where status <> 'deactivated' and language = 'es'));
$$;
