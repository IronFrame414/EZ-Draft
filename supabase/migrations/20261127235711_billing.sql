-- EZD-1711 (AC-EZD-1711-1..3; Q-0220, Q-0236, Q-0237, Q-0372, Q-0795; vault/build/assumptions/EZD-1711.md Settled):
-- billing for companies other than Worth Properties.
--
-- tenant.billing_exempt: Worth Properties (tenant 1) is never billed (Q-0372). The billing functions refuse an
-- exempt company, and an exempt company always has full use.
--
-- billing_account: one row per billed company, holding only Stripe ids and status (no card data, no dollar
-- column; the amounts live in Stripe, Q-0236). lapsed_at is the day the subscription stopped (unpaid, canceled,
-- paused, incomplete_expired, or the trial ended with no card); Q-0795: 14 days of view and export from then, then
-- only the paywall. last_event_at is the Stripe created time of the last applied event, so an older event that
-- arrives late never undoes a newer one.
--
-- billing_event (20261127235710_billing_event.sql, one table per file): each Stripe event id once (07 delivery
-- rules "idempotency key per event").
--
-- No API role reads or writes either table directly: RLS on with a deny-all policy and the API gate policy
-- (project_recent / sent_package convention). billing_gate() is the signed-in member's read; the webhook route
-- writes through billing_apply_subscription and onboarding (EZD-1713) through billing_start_trial, both
-- service_role only.
--
-- private.billing_mode(tenant): 'full' | 'grace' | 'locked'. resolve_share_link and resolve_sent_package answer
-- "not available" for a locked company's client links (Q-0795).

alter table public.tenant add column billing_exempt boolean not null default false;

comment on column public.tenant.billing_exempt is
  'True for Worth Properties (tenant 1): never billed, never limited by billing (Q-0372; EZD-1711)';

update public.tenant set billing_exempt = true where id = '00000000-0000-4000-8000-000000000001';

create table public.billing_account (
  tenant_id uuid primary key references public.tenant (id) on delete cascade,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{1,250}$'),
  stripe_subscription_id text check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{1,250}$'),
  status text not null check (status in (
    'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'paused', 'incomplete', 'incomplete_expired')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  office_seats_billed integer not null default 5 check (office_seats_billed >= 0),
  lapsed_at timestamptz,
  last_event_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.billing_account enable row level security;

create policy billing_account_none on public.billing_account
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

create policy billing_account_api_gate on public.billing_account as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.billing_account from public, anon, authenticated;
grant select, insert, update, delete on public.billing_account to authenticated;
grant select, insert, update, delete on public.billing_account to service_role;

comment on table public.billing_account is
  'A billed company''s Stripe ids and subscription status; reached only through billing_gate, billing_apply_subscription and billing_start_trial (EZD-1711)';

-- The day use stopped: the stored lapse, or the trial end when the trial ran out with no card and the
-- webhook has not said so yet. Null while the company may use everything.
create function private.billing_lapse_start(p_row public.billing_account)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select coalesce(
    p_row.lapsed_at,
    case when p_row.status = 'trialing' and p_row.trial_ends_at is not null and p_row.trial_ends_at <= now()
      then p_row.trial_ends_at end);
$$;

revoke all on function private.billing_lapse_start(public.billing_account) from public;

-- Q-0795: full use until the lapse; view and export for 14 days from it; then locked.
create function private.billing_mode(p_tenant uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.billing_account;
  v_start timestamptz;
begin
  if p_tenant is null then
    return 'full';
  end if;
  if exists (select 1 from public.tenant t where t.id = p_tenant and t.billing_exempt) then
    return 'full';
  end if;
  select * into v_row from public.billing_account b where b.tenant_id = p_tenant;
  if not found then
    return 'full';
  end if;
  v_start := private.billing_lapse_start(v_row);
  if v_start is null then
    return 'full';
  end if;
  if now() < v_start + interval '14 days' then
    return 'grace';
  end if;
  return 'locked';
end
$$;

revoke all on function private.billing_mode(uuid) from public;

-- The signed-in member's company billing state, for the request gate, the banner, the paywall and
-- Settings > Billing. applies is false for an exempt company or one with no billing account (no Billing
-- section, no paywall, no meter). days_left: grace days left (grace) or trial days left (trialing).
create function public.billing_gate()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_row public.billing_account;
  v_mode text;
  v_start timestamptz;
  v_days integer;
begin
  perform private.require_api_gate();
  v_tenant := private.tenant_id();
  if v_tenant is null then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if exists (select 1 from public.tenant t where t.id = v_tenant and t.billing_exempt) then
    return jsonb_build_object('applies', false, 'mode', 'full');
  end if;
  select * into v_row from public.billing_account b where b.tenant_id = v_tenant;
  if not found then
    return jsonb_build_object('applies', false, 'mode', 'full');
  end if;
  v_mode := private.billing_mode(v_tenant);
  v_start := private.billing_lapse_start(v_row);
  if v_mode = 'grace' then
    v_days := ceil(extract(epoch from (v_start + interval '14 days' - now())) / 86400.0)::integer;
  elsif v_mode = 'full' and v_row.status = 'trialing' and v_row.trial_ends_at is not null then
    v_days := greatest(0, ceil(extract(epoch from (v_row.trial_ends_at - now())) / 86400.0)::integer);
  else
    v_days := null;
  end if;
  return jsonb_build_object(
    'applies', true,
    'mode', v_mode,
    'status', v_row.status,
    'days_left', v_days,
    'trial_ends_at', v_row.trial_ends_at,
    'current_period_end', v_row.current_period_end,
    'has_subscription', v_row.stripe_subscription_id is not null,
    'stripe_customer_id', v_row.stripe_customer_id);
end
$$;

revoke all on function public.billing_gate() from public, anon, authenticated, service_role;
grant execute on function public.billing_gate() to authenticated;

-- Onboarding (EZD-1713): the new company's Stripe customer and its 14-day trial with no card (Q-0237). An exempt
-- company is refused (22023 billing_exempt).
create function public.billing_start_trial(
  p_tenant uuid,
  p_customer text,
  p_subscription text,
  p_trial_ends_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_tenant is null or p_customer is null or p_trial_ends_at is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenant t where t.id = p_tenant and t.billing_exempt) then
    raise exception 'billing_exempt' using errcode = '22023';
  end if;
  insert into public.billing_account (tenant_id, stripe_customer_id, stripe_subscription_id, status, trial_ends_at)
  values (p_tenant, p_customer, p_subscription, 'trialing', p_trial_ends_at)
  on conflict (tenant_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    status = 'trialing',
    trial_ends_at = excluded.trial_ends_at,
    lapsed_at = null,
    updated_at = now();
end
$$;

revoke all on function public.billing_start_trial(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.billing_start_trial(uuid, text, text, timestamptz) to service_role;

-- The webhook's write (POST /api/billing/stripe-webhook, after the signature check): one subscription event.
-- Returns applied | duplicate (event id seen) | stale (older than the last applied event) | unknown_customer |
-- exempt. A lapsed status sets lapsed_at once (repeat events keep the first day); any other status clears it, so
-- paying again restores everything (Q-0795). A status change writes billing.status_changed (no amounts).
create function public.billing_apply_subscription(
  p_event_id text,
  p_event_type text,
  p_event_created timestamptz,
  p_customer text,
  p_subscription text,
  p_status text,
  p_trial_ends_at timestamptz,
  p_period_end timestamptz,
  p_seats integer
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.billing_account;
  v_lapsed boolean;
begin
  if p_event_id is null or p_event_type is null or p_event_created is null or p_customer is null
    or p_status is null then
    raise exception 'invalid_input' using errcode = '22023';
  end if;

  select * into v_row from public.billing_account b where b.stripe_customer_id = p_customer for update;
  if not found then
    return 'unknown_customer';
  end if;
  if exists (select 1 from public.tenant t where t.id = v_row.tenant_id and t.billing_exempt) then
    return 'exempt';
  end if;

  insert into public.billing_event (id, tenant_id, type) values (p_event_id, v_row.tenant_id, p_event_type)
  on conflict (id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  if v_row.last_event_at is not null and p_event_created < v_row.last_event_at then
    return 'stale';
  end if;

  v_lapsed := p_status in ('unpaid', 'canceled', 'paused', 'incomplete_expired');

  update public.billing_account b set
    stripe_subscription_id = coalesce(p_subscription, b.stripe_subscription_id),
    status = p_status,
    trial_ends_at = p_trial_ends_at,
    current_period_end = p_period_end,
    office_seats_billed = coalesce(p_seats, b.office_seats_billed),
    lapsed_at = case when v_lapsed then coalesce(b.lapsed_at, now()) else null end,
    last_event_at = p_event_created,
    updated_at = now()
  where b.tenant_id = v_row.tenant_id;

  if v_row.status is distinct from p_status then
    perform private.write_event_log_as('billing.status_changed', v_row.tenant_id, null, 'billing_account',
      v_row.tenant_id, jsonb_build_object('oldStatus', v_row.status, 'status', p_status), null);
  end if;
  return 'applied';
end
$$;

revoke all on function public.billing_apply_subscription(text, text, timestamptz, text, text, text, timestamptz, timestamptz, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.billing_apply_subscription(text, text, timestamptz, text, text, text, timestamptz, timestamptz, integer)
  to service_role;

-- Client links (Q-0795): after the 14 days a locked company's links answer unavailable, which the client page
-- shows as "This link isn't available." (error.share_link_unavailable). Everything else is unchanged from 20261127213107_share_link_view_hourly.sql.
create or replace function public.resolve_share_link(p_token_hash text, p_view boolean default false)
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

  -- EZD-1711: a locked company's link is not available.
  if private.billing_mode(v_row.tenant_id) = 'locked' then
    return jsonb_build_object('status', 'unavailable');
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
    -- EZD-2006: at most once per link per rolling hour. One check per link at a time, so page opens at the
    -- same moment cannot each write a row.
    perform pg_advisory_xact_lock(hashtextextended('share_link.viewed:' || v_row.id::text, 0));
    if not exists (
      select 1 from public.event_log e
      where e.tenant_id = v_row.tenant_id
        and e.at > now() - interval '1 hour'
        and e.action = 'share_link.viewed'
        and e.object_id = v_row.id
    ) then
      perform private.write_event_log_as('share_link.viewed', v_row.tenant_id, null, 'sent_package', v_row.id,
        jsonb_build_object('projectId', v_row.project_id), null);
    end if;
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

-- Unchanged from 20261117134712_create_send_functions.sql except the locked-company filter (EZD-1711).
create or replace function public.resolve_sent_package(p_token_hash text)
returns table (
  sent_package_id uuid,
  tenant_id uuid,
  project_id uuid,
  model_version_id uuid,
  kind text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_api_gate();

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  return query
  select s.id, s.tenant_id, s.project_id, s.model_version_id, s.kind, s.expires_at
  from public.sent_package s
  where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now()
    and private.billing_mode(s.tenant_id) <> 'locked';
end
$$;

revoke all on function public.resolve_sent_package(text)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_sent_package(text) to anon;
