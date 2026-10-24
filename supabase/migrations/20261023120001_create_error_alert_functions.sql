-- EZD-024 Step 4 (vault/plans/EZD-024.md; Re-validation V2, V3): the only write paths into error_alert.
-- Callable through the gated API by anon, authenticated and service_role. The caller role is the request role
-- (current_setting('role'), as private.api_request_gate reads it): service_role is the job runner and may
-- record any kind for a tenant; any other caller may record only kind 'error' from the browser, a function or
-- the worker, with tenant and project forced to null. Row cap: 100 new error rows per hour for non-runner
-- callers. Email cap: 20 alerts emailed per rolling hour (Q-0068 (a)).

create function public.record_error_alert(
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

-- Gives an unsent alert back, so a later occurrence can claim and email it. Only the caller that holds the
-- claim knows its uuid.
create function public.release_error_alert_email(p_alert_id uuid, p_claim uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.error_alert a
  set email_claim = null, emailed_at = null
  where a.id = p_alert_id and a.email_claim = p_claim;
  return found;
end
$$;

revoke all on function public.release_error_alert_email(uuid, uuid) from public, anon, service_role;
grant execute on function public.release_error_alert_email(uuid, uuid)
  to anon, authenticated, service_role;
