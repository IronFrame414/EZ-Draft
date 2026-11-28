-- EZD-1711 (Settled "Webhook"; 07 delivery rules "idempotency key per event"): each Stripe webhook event id once.
-- No API role reads or writes it directly: RLS on with a deny-all policy and the API gate policy; written only by
-- billing_apply_subscription (20261127235711_billing.sql, service_role only). One table per file.

create table public.billing_event (
  id text primary key check (id ~ '^evt_[A-Za-z0-9]{1,250}$'),
  tenant_id uuid not null references public.tenant (id) on delete cascade,
  type text not null check (char_length(type) between 1 and 100),
  received_at timestamptz not null default now()
);

create index billing_event_tenant_id_idx on public.billing_event (tenant_id);

alter table public.billing_event enable row level security;

create policy billing_event_none on public.billing_event
  for all to authenticated
  using (tenant_id = (select private.tenant_id()) and false)
  with check (tenant_id = (select private.tenant_id()) and false);

create policy billing_event_api_gate on public.billing_event as restrictive for all to authenticated
  using ((select private.require_api_gate())) with check ((select private.require_api_gate()));

revoke all on public.billing_event from public, anon, authenticated;
grant select, insert, update, delete on public.billing_event to authenticated;
grant select, insert, update, delete on public.billing_event to service_role;

comment on table public.billing_event is
  'Each Stripe webhook event id applied once (EZD-1711); written only by billing_apply_subscription';
