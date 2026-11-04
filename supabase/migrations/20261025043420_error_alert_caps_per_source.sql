-- EZD-143 (vault/plans/EZD-143.md D6, D16; Q-0068 (a); Q-0277 (a); Q-0278 (b)): record_error_alert redefined
-- with the same signature, return type and grants. Changes from 20261023120001 only: the non-runner row cap
-- of 100 new error rows per hour is counted per source group ('function' apart from 'browser' and 'worker'),
-- so the tunnel cannot fill the room of the app's own server errors; and inside the email cap of 20 per
-- rolling hour, 'browser' and 'worker' alerts may use at most 10, so 'function' errors, failed jobs and
-- failed deliveries always have room. Over either cap the row is still written and only the claim is withheld.

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
