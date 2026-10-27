-- EZD-190 Step 3 (vault/plans/EZD-190.md sections 1 and 3; Q-0330): every security definer function in
-- public that anon or authenticated can execute (except health) runs private.require_api_gate() first, so
-- a request PostgREST served without its pre-request hook is refused (42501 api_gate). Each function is
-- copied from its source migration (named above it) with only the guard added; signatures, volatility,
-- security definer, search_path and grants are unchanged.

-- current_app_user_id: from 20261020104900_create_current_app_user_id.sql
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.require_api_gate() then null::uuid
    when private.session_is_live()
      then (select a.id from public.app_user a where a.auth_user_id = auth.uid())
    else null::uuid
  end
$$;

revoke all on function public.current_app_user_id() from public, anon, service_role;
grant execute on function public.current_app_user_id() to authenticated;

-- link_app_user: from 20261020104858_create_link_app_user.sql
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
    return query select v_app_user_id, true, v_membership_id, v_tenant_id;
    return;
  end if;

  return query select v_app_user_id, false, null::uuid, null::uuid;
end
$$;

revoke all on function public.link_app_user() from public, anon, service_role;
grant execute on function public.link_app_user() to authenticated;

-- enqueue_job: from 20261022130001_create_job_functions.sql
create or replace function public.enqueue_job(
  p_kind text,
  p_project_id uuid,
  p_payload jsonb,
  p_max_attempts int,
  p_run_after timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := private.tenant_id();
  v_id uuid;
begin
  perform private.require_api_gate();
  if v_tenant is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_project_id is not null then
    if not private.can_see_project(p_project_id) then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
  elsif not private.all_projects() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, run_after, created_by)
  values (
    v_tenant,
    p_project_id,
    p_kind,
    p_payload,
    'queued',
    p_max_attempts,
    coalesce(p_run_after, now()),
    private.app_user_id()
  )
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.enqueue_job(text, uuid, jsonb, int, timestamptz) from public, anon, service_role;
grant execute on function public.enqueue_job(text, uuid, jsonb, int, timestamptz) to authenticated;

-- record_error_alert: from 20261025043420_error_alert_caps_per_source.sql
create or replace function public.record_error_alert(
  p_kind text,
  p_source text,
  p_fingerprint text,
  p_title text,
  p_ref text,
  p_tenant_id uuid,
  p_project_id uuid
)
returns table (alert_id uuid, is_new boolean, email_claim uuid, capped boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_runner boolean := coalesce(current_setting('role', true), '') = 'service_role';
  v_tenant uuid := p_tenant_id;
  v_project uuid := p_project_id;
  v_id uuid;
  v_new boolean;
  v_emailed_at timestamptz;
  v_claim uuid;
begin
  perform private.require_api_gate();
  if not v_runner then
    if p_kind is distinct from 'error' or p_source is null
      or p_source not in ('browser', 'function', 'worker') then
      raise exception 'not_authorized' using errcode = '42501';
    end if;
    v_tenant := null;
    v_project := null;

    if not exists (select 1 from public.error_alert a where a.fingerprint = p_fingerprint)
      and (
        select count(*) from public.error_alert a
        where a.kind = 'error' and a.first_seen_at > now() - interval '1 hour'
          and (
            (p_source = 'function' and a.source in ('function'))
            or (p_source <> 'function' and a.source in ('browser', 'worker'))
          )
      ) >= 100 then
      return query select null::uuid, false, null::uuid, true;
      return;
    end if;
  end if;

  insert into public.error_alert as a (tenant_id, project_id, kind, source, fingerprint, title, ref)
  values (v_tenant, v_project, p_kind, p_source, p_fingerprint, p_title, p_ref)
  on conflict (fingerprint) do update
    set occurrences = a.occurrences + 1, last_seen_at = now()
  returning a.id, (a.xmax = 0), a.emailed_at, a.email_claim
  into v_id, v_new, v_emailed_at, v_claim;

  if v_emailed_at is not null or v_claim is not null then
    return query select v_id, v_new, null::uuid, false;
    return;
  end if;

  -- One claim at a time, so concurrent first errors never pass the email cap together.
  perform pg_advisory_xact_lock(hashtext('public.error_alert email cap'));
  if (
    select count(*) from public.error_alert a
    where a.emailed_at is not null and a.emailed_at > now() - interval '1 hour'
  ) >= 20 then
    return query select v_id, v_new, null::uuid, true;
    return;
  end if;

  -- Browser and worker alerts may use at most 10 of the 20 (Q-0278 (b)).
  if p_source in ('browser', 'worker') and (
    select count(*) from public.error_alert a
    where a.emailed_at is not null and a.emailed_at > now() - interval '1 hour'
      and a.source in ('browser', 'worker')
  ) >= 10 then
    return query select v_id, v_new, null::uuid, true;
    return;
  end if;

  v_claim := gen_random_uuid();
  update public.error_alert a
  set email_claim = v_claim, emailed_at = now()
  where a.id = v_id;
  return query select v_id, v_new, v_claim, false;
end
$$;

revoke all on function public.record_error_alert(text, text, text, text, text, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.record_error_alert(text, text, text, text, text, uuid, uuid)
  to anon, authenticated, service_role;

-- release_error_alert_email: from 20261023120001_create_error_alert_functions.sql
create or replace function public.release_error_alert_email(p_alert_id uuid, p_claim uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_api_gate();
  update public.error_alert a
  set email_claim = null, emailed_at = null
  where a.id = p_alert_id and a.email_claim = p_claim;
  return found;
end
$$;

revoke all on function public.release_error_alert_email(uuid, uuid) from public, anon, service_role;
grant execute on function public.release_error_alert_email(uuid, uuid)
  to anon, authenticated, service_role;

-- sign_in_throttle_take: from 20261023130001_create_sign_in_throttle_functions.sql
create or replace function public.sign_in_throttle_take(p_kind text, p_email_key text, p_ip_key text)
returns table (allowed boolean, limited_by text, attempt_id uuid, ip_attempt_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_attempt uuid := null;
  v_ip_attempt uuid := null;
begin
  perform private.require_api_gate();
  if p_kind is null or p_kind not in ('password', 'code', 'email', 'link')
    or (p_email_key is null and p_kind <> 'link')
    or (p_email_key is not null and p_email_key !~ '^[0-9a-f]{64}$')
    or (p_ip_key is not null and p_ip_key !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid_throttle_input' using errcode = '22023';
  end if;

  -- The longest window is 1 hour.
  delete from public.sign_in_throttle where at < now() - interval '1 hour';

  -- Fixed order (IP, then email), so two requests at once cannot both pass the last free slot.
  if p_ip_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('sign_in_throttle:' || p_ip_key, 0));
  end if;
  if p_email_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('sign_in_throttle:' || p_email_key, 0));
  end if;

  if p_ip_key is not null then
    select count(*) into v_count from public.sign_in_throttle t
    where t.kind = 'ip' and t.key_hash = p_ip_key and t.failed
      and t.at > now() - interval '15 minutes';
    if v_count >= 30 then
      return query select false, 'ip'::text, null::uuid, null::uuid;
      return;
    end if;
  end if;

  if p_kind = 'password' then
    select count(*) into v_count from public.sign_in_throttle t
    where t.kind = 'password' and t.key_hash = p_email_key and t.failed
      and t.at > now() - interval '15 minutes';
    if v_count >= 5 then
      return query select false, p_kind, null::uuid, null::uuid;
      return;
    end if;
  elsif p_kind = 'code' then
    select count(*) into v_count from public.sign_in_throttle t
    where t.kind = 'code' and t.key_hash = p_email_key and t.failed
      and t.at > now() - interval '15 minutes';
    if v_count >= 10 then
      return query select false, p_kind, null::uuid, null::uuid;
      return;
    end if;
  elsif p_kind = 'email' then
    select count(*) into v_count from public.sign_in_throttle t
    where t.kind = 'email' and t.key_hash = p_email_key
      and t.at > now() - interval '1 hour';
    if v_count >= 5 then
      return query select false, p_kind, null::uuid, null::uuid;
      return;
    end if;
  end if;

  if p_ip_key is not null then
    insert into public.sign_in_throttle (kind, key_hash, failed)
    values ('ip', p_ip_key, true)
    returning id into v_ip_attempt;
  end if;
  if p_kind <> 'link' then
    insert into public.sign_in_throttle (kind, key_hash, failed)
    values (p_kind, p_email_key, true)
    returning id into v_attempt;
  end if;

  return query select true, null::text, v_attempt, v_ip_attempt;
end;
$$;

revoke all on function public.sign_in_throttle_take(text, text, text) from public, anon, service_role;
grant execute on function public.sign_in_throttle_take(text, text, text) to anon, authenticated;

-- sign_in_throttle_settle: from 20261023130001_create_sign_in_throttle_functions.sql
create or replace function public.sign_in_throttle_settle(p_attempt_id uuid, p_ip_attempt_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.require_api_gate();
  update public.sign_in_throttle set failed = false
  where id in (p_attempt_id, p_ip_attempt_id);
end;
$$;

revoke all on function public.sign_in_throttle_settle(uuid, uuid) from public, anon, service_role;
grant execute on function public.sign_in_throttle_settle(uuid, uuid) to anon, authenticated;

-- error_tunnel_take: from 20261025043419_create_error_tunnel_take.sql
create or replace function public.error_tunnel_take(p_ip_key text, p_events integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.require_api_gate();
  if p_ip_key is null or p_ip_key !~ '^[0-9a-f]{64}$' or p_events is null or p_events < 1 then
    raise exception 'invalid_throttle_input' using errcode = '22023';
  end if;

  delete from public.error_tunnel_throttle where at < now() - interval '1 hour';

  -- One take per key at a time, so two envelopes at once cannot both pass the last free slots.
  perform pg_advisory_xact_lock(hashtextextended('error_tunnel_throttle:' || p_ip_key, 0));

  select count(*) into v_count from public.error_tunnel_throttle t
  where t.key_hash = p_ip_key and t.at > now() - interval '1 hour';
  if v_count + p_events > 60 then
    return false;
  end if;

  insert into public.error_tunnel_throttle (key_hash)
  select p_ip_key from generate_series(1, p_events);
  return true;
end
$$;

revoke all on function public.error_tunnel_take(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.error_tunnel_take(text, integer) to anon;

-- update_tenant_identity: from 20261026130000_create_update_tenant_identity.sql
create or replace function public.update_tenant_identity(
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
  perform private.require_api_gate();
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
