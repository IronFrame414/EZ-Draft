-- EZD-2020 (external security audit 2026-11-27 X3): alerts from the public error tunnel are unverified. Anyone
-- can post a made-up browser error, so a tunnel report (source browser or worker) no longer gets its own owner
-- email: record_error_alert still records and counts it but never hands out a claim, and the sweep sends one
-- digest per hour through claim_tunnel_alert_digest (service_role only). The cap of 20 emails per rolling hour
-- now counts only function, job and webhook alerts, so stamped digest rows never use up room for real errors;
-- the browser share of 10 (Q-0278 (b)) goes, because tunnel rows never claim one by one.

-- record_error_alert: from 20261104050640_error_alert_row_cap_lock.sql
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
    perform pg_advisory_xact_lock(hashtextextended('error_alert_row_cap:' || case when p_source = 'function' then 'function' else 'browser_worker' end, 0));

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

  -- EZD-2020: a tunnel report (browser or worker; the worker tag is the sender's) never gets its own email.
  -- It waits for the hourly digest (claim_tunnel_alert_digest).
  if p_source in ('browser', 'worker') then
    return query select v_id, v_new, null::uuid, false;
    return;
  end if;

  -- One claim at a time, so concurrent first errors never pass the email cap together.
  perform pg_advisory_xact_lock(hashtext('public.error_alert email cap'));
  if (
    select count(*) from public.error_alert a
    where a.emailed_at is not null and a.emailed_at > now() - interval '1 hour'
      and a.source not in ('browser', 'worker')
  ) >= 20 then
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

-- claim_tunnel_alert_digest: at most one digest per rolling hour. Stamps every tunnel error row not yet
-- emailed with one claim and returns them; none when a tunnel digest went out in the last hour or nothing waits.
create function public.claim_tunnel_alert_digest()
returns table (
  claim uuid,
  alert_id uuid,
  source text,
  title text,
  occurrences integer,
  ref text,
  first_seen_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_claim uuid := gen_random_uuid();
begin
  perform private.require_api_gate();
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.error_alert tunnel digest'));
  if exists (
    select 1 from public.error_alert a
    where a.kind = 'error' and a.source in ('browser', 'worker')
      and a.emailed_at is not null and a.emailed_at > now() - interval '1 hour'
  ) then
    return;
  end if;
  return query
    with stamped as (
      update public.error_alert a
      set email_claim = v_claim, emailed_at = now()
      where a.kind = 'error' and a.source in ('browser', 'worker')
        and a.emailed_at is null and a.email_claim is null
      returning a.id, a.source, a.title, a.occurrences, a.ref, a.first_seen_at
    )
    select v_claim, s.id, s.source, s.title, s.occurrences, s.ref, s.first_seen_at
    from stamped s
    order by s.first_seen_at, s.id;
end
$$;

revoke all on function public.claim_tunnel_alert_digest() from public, anon, authenticated, service_role;
grant execute on function public.claim_tunnel_alert_digest() to service_role;

-- release_tunnel_alert_digest: a digest that could not be sent gives its rows back for the next sweep.
create function public.release_tunnel_alert_digest(p_claim uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform private.require_api_gate();
  if coalesce(current_setting('role', true), '') <> 'service_role' then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.error_alert a
  set email_claim = null, emailed_at = null
  where a.email_claim = p_claim and a.kind = 'error' and a.source in ('browser', 'worker');
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

revoke all on function public.release_tunnel_alert_digest(uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_tunnel_alert_digest(uuid) to service_role;
