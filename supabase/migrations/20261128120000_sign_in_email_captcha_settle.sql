-- EZD-2019 (external security audit 2026-11-27 X1; AC-EZD-2019-1): a junk captcha token can no longer use up a
-- member's sign-in emails. requestSignIn now settles the per-email row when Auth answers captcha_failed (no
-- email was sent) and keeps the per-address row counted, so the per-email limit counts only rows still marked
-- failed, like the password and code limits. A request that sends an email is never settled, so every sent
-- email still counts: 5 sign-in emails per email in 1 hour (Q-0094) is unchanged. Only the email branch's
-- count differs from 20261027001745_guard_gated_rpcs.sql.
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
    where t.kind = 'email' and t.key_hash = p_email_key and t.failed
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
