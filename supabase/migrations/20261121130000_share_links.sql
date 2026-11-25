-- EZD-1201 (S18 States "Expired ... Contractor renews for 30 days"; 03c share_link; 11 Security "Share links: random
-- token, 30-day expiry, renewable, revocable"; 07 share_link.expiring; Q-0700 03 and 10 rows): share links. The
-- client sent_package row is the share link (Q-0700: token_hash, expires_at and revoked_at already live there and
-- EZD-1201 reuses EZD-111's resolver), so no second token store is made (vault/build/assumptions.md EZD-1201).
-- This migration adds renewed_at and reminder_sent_at and five definer functions:
--
-- resolve_share_link: the client link's status for the signed-out client page (EZD-1202). active (the
--   resolve_sent_package fields), expired (the company name only, for "Ask [Company] to renew it"), or
--   not_found (unknown, malformed, revoked, deleted project). With p_view it writes share_link.viewed for an
--   active link; an expired link writes share_link.expired once per expiry. anon only.
-- renew_share_link: Send to client and project scope; a revoked link is refused. expires_at = now + the given
--   days (the route passes Defaults "Share link expiry", 30 days), renewed_at = now, reminder_sent_at cleared;
--   writes share_link.renewed. The token is unchanged, so the client's emailed link works again.
-- revoke_share_link: Send to client and project scope; sets revoked_at once.
-- list_share_links: the Share panel rows (Q-0213: on or off, who it was sent to, expiry). No token, no hash.
-- sweep_share_link_reminders: service_role; stamps reminder_sent_at and writes share_link.expiring once per
--   link when it is within the company's Defaults "Share link reminder" lead (7 days) of expiry.

alter table public.sent_package
  add column renewed_at timestamptz,
  add column reminder_sent_at timestamptz;

create index sent_package_reminder_idx on public.sent_package (expires_at)
  where revoked_at is null and reminder_sent_at is null;

-- Send to client for the request's member; 42501 otherwise. Called only by the definer functions below.
create function private.require_send_to_client()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_user uuid := private.app_user_id();
  v_membership uuid := nullif(auth.jwt() ->> 'membership_id', '')::uuid;
begin
  if v_tenant is null or v_user is null or v_membership is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.user_permission up
    where up.membership_id = v_membership
      and up.tenant_id = v_tenant
      and up.permission_key = 'send_to_client'
      and up.granted
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
end
$$;

revoke all on function private.require_send_to_client() from public, anon, authenticated, service_role;

create function public.resolve_share_link(p_token_hash text, p_view boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.sent_package;
  v_company text;
begin
  perform private.require_api_gate();

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_row from public.sent_package s
  where s.token_hash = p_token_hash and s.revoked_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select t.name into v_company from public.tenant t where t.id = v_row.tenant_id;

  if v_row.expires_at <= now() then
    -- Once per expiry: an anonymous caller cannot add a row per request to the append-only log.
    if not exists (
      select 1 from public.event_log e
      where e.tenant_id = v_row.tenant_id
        and e.at >= coalesce(v_row.renewed_at, v_row.created_at)
        and e.action = 'share_link.expired'
        and e.object_id = v_row.id
    ) then
      perform private.write_event_log_as('share_link.expired', v_row.tenant_id, null, 'sent_package', v_row.id,
        jsonb_build_object('projectId', v_row.project_id, 'expiresAt', v_row.expires_at), null);
    end if;
    return jsonb_build_object('status', 'expired', 'company', v_company);
  end if;

  if coalesce(p_view, false) then
    perform private.write_event_log_as('share_link.viewed', v_row.tenant_id, null, 'sent_package', v_row.id,
      jsonb_build_object('projectId', v_row.project_id), null);
  end if;

  return jsonb_build_object(
    'status', 'active',
    'sent_package_id', v_row.id,
    'tenant_id', v_row.tenant_id,
    'project_id', v_row.project_id,
    'model_version_id', v_row.model_version_id,
    'kind', v_row.kind,
    'expires_at', v_row.expires_at,
    'company', v_company);
end
$$;

revoke all on function public.resolve_share_link(text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_share_link(text, boolean) to anon;

create function public.renew_share_link(p_sent_package uuid, p_expiry_days integer, p_ip inet default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_row public.sent_package;
  v_now timestamptz;
begin
  perform private.require_api_gate();
  perform private.require_send_to_client();
  v_tenant := private.tenant_id();

  if p_expiry_days is null or p_expiry_days not between 1 and 365 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_row from public.sent_package s
  where s.id = p_sent_package and s.tenant_id = v_tenant
  for update;
  if not found or not private.can_see_project(v_row.project_id) then
    raise exception 'share_link_not_found' using errcode = 'P0002';
  end if;
  if v_row.revoked_at is not null then
    raise exception 'share_link_revoked' using errcode = 'P0001';
  end if;

  v_now := clock_timestamp();
  update public.sent_package s
  set expires_at = v_now + make_interval(days => p_expiry_days),
      renewed_at = v_now,
      reminder_sent_at = null
  where s.id = v_row.id
  returning * into v_row;

  perform private.write_event_log('share_link.renewed', 'sent_package', v_row.id,
    jsonb_build_object('projectId', v_row.project_id, 'expiresAt', v_row.expires_at), p_ip);

  return jsonb_build_object(
    'id', v_row.id, 'expires_at', v_row.expires_at, 'renewed_at', v_row.renewed_at);
end
$$;

revoke all on function public.renew_share_link(uuid, integer, inet)
  from public, anon, authenticated, service_role;
grant execute on function public.renew_share_link(uuid, integer, inet) to authenticated;

create function public.revoke_share_link(p_sent_package uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_row public.sent_package;
begin
  perform private.require_api_gate();
  perform private.require_send_to_client();
  v_tenant := private.tenant_id();

  select * into v_row from public.sent_package s
  where s.id = p_sent_package and s.tenant_id = v_tenant
  for update;
  if not found or not private.can_see_project(v_row.project_id) then
    raise exception 'share_link_not_found' using errcode = 'P0002';
  end if;

  if v_row.revoked_at is null then
    update public.sent_package s set revoked_at = clock_timestamp()
    where s.id = v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object('id', v_row.id, 'revoked_at', v_row.revoked_at);
end
$$;

revoke all on function public.revoke_share_link(uuid) from public, anon, authenticated, service_role;
grant execute on function public.revoke_share_link(uuid) to authenticated;

create function public.list_share_links(p_project uuid)
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
  perform private.require_send_to_client();
  v_tenant := private.tenant_id();

  if p_project is null or not private.can_see_project(p_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'version_no', v.version_no,
      'recipient', s.recipients -> 0,
      'email_sent_at', s.email_sent_at,
      'created_at', s.created_at,
      'expires_at', s.expires_at,
      'renewed_at', s.renewed_at,
      'revoked_at', s.revoked_at,
      'status', case
        when s.revoked_at is not null then 'revoked'
        when s.expires_at <= now() then 'expired'
        else 'active' end
    ) order by s.created_at desc, s.id)
    from public.sent_package s
    join public.model_version v on v.id = s.model_version_id
    where s.project_id = p_project and s.tenant_id = v_tenant and s.kind = 'client'
  ), '[]'::jsonb);
end
$$;

revoke all on function public.list_share_links(uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_share_links(uuid) to authenticated;

create function public.sweep_share_link_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  perform private.require_api_gate();
  for v_row in
    update public.sent_package s
    set reminder_sent_at = clock_timestamp()
    from public.tenant t
    where t.id = s.tenant_id
      and s.revoked_at is null
      and s.reminder_sent_at is null
      and s.expires_at > now()
      and s.expires_at - make_interval(days => case
        when (t.defaults ->> 'share_link_reminder_lead') ~ '^[0-9]{1,3}$'
          then (t.defaults ->> 'share_link_reminder_lead')::integer
        else 7 end) <= now()
    returning s.id, s.tenant_id, s.project_id, s.expires_at
  loop
    perform private.write_event_log_as('share_link.expiring', v_row.tenant_id, null, 'sent_package', v_row.id,
      jsonb_build_object('projectId', v_row.project_id, 'expiresAt', v_row.expires_at), null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

revoke all on function public.sweep_share_link_reminders() from public, anon, authenticated;
grant execute on function public.sweep_share_link_reminders() to service_role;
