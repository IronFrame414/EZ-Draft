// EZD-1711 (AC-EZD-1711-1, -2, -3; CLAUDE.md rule 4; Q-0795; Q-0372; Settled "Where status lives", "Tenant 1 is
// never billed", "Webhook", "Paywall rule", "Events"). Expected values: Q-0795 ("from the day the subscription
// becomes unpaid or canceled, or the trial ends with no card, members can open and export projects for 14 days and
// client links keep working ... After 14 days only the paywall page shows and client links show 'This link isn't
// available' ... Paying again restores everything"); Q-0237 (14-day trial with no card); Q-0372 (Worth Properties
// never billed). SQL now() cannot be faked, so ageing backdates lapsed_at and trial_ends_at through the harness.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { TENANT_1_ID } from '../../../test-utils/seed-ids';
import { POST as resolveRoute } from '../../app/api/share-links/resolve/route';
import { en } from '../messages/catalogs/en';
import { resolveClientLink } from '../sends/resolve';
import { newClientToken } from '../sends/token';
import { resolveShareLink } from '../share-links/share-links';
import { parseBillingGate } from './state-parse';
import { newCustomerId, newEventId, newSubscriptionId } from './fixtures/stripe-events';

const DAY_MS = 24 * 60 * 60 * 1000;
let clock = Math.floor(Date.now() / 1000);
const nextCreated = () => new Date(++clock * 1000).toISOString();

type Apply = {
  eventId?: string;
  created?: string;
  customer: string;
  status: string;
  trialEndsAt?: string | null;
};

async function apply(a: Apply): Promise<string> {
  const { data, error } = await adminDb().rpc('billing_apply_subscription', {
    p_event_id: a.eventId ?? newEventId(),
    p_event_type: 'customer.subscription.updated',
    p_event_created: a.created ?? nextCreated(),
    p_customer: a.customer,
    p_subscription: newSubscriptionId(),
    p_status: a.status,
    p_trial_ends_at: a.trialEndsAt ?? null,
    p_period_end: null,
    p_seats: null,
  });
  if (error) throw error;
  return data as string;
}

async function startTrial(tenant: string, customer: string, trialEndsAt: Date) {
  return adminDb().rpc('billing_start_trial', {
    p_tenant: tenant,
    p_customer: customer,
    p_subscription: newSubscriptionId(),
    p_trial_ends_at: trialEndsAt.toISOString(),
  });
}

const gate = async (s: Session) => {
  const { data, error } = await (s.serverDb as unknown as SupabaseClient).rpc('billing_gate');
  if (error) throw error;
  return parseBillingGate(data);
};

const account = async (tenant: string) =>
  (
    await harnessSql()<{ status: string; lapsed_at: Date | null }[]>`
      select status, lapsed_at from public.billing_account where tenant_id = ${tenant}::uuid`
  )[0];

async function sendLink(tenant: string, project: string): Promise<string> {
  const sql = harnessSql();
  const [v] = await sql<{ id: string }[]>`
    insert into public.model_version (project_id, tenant_id, model_json, schema_version)
    values (${project}::uuid, ${tenant}::uuid, '{}'::jsonb, 1) returning id`;
  const { token, hash } = newClientToken();
  await sql`
    insert into public.sent_package (tenant_id, project_id, model_version_id, kind, recipients, token_hash, expires_at)
    values (${tenant}::uuid, ${project}::uuid, ${v.id}::uuid, 'client', '["client@example.test"]'::jsonb, ${hash},
      now() + interval '30 days')`;
  return token;
}

const OWNER = ['view_projects', 'settings_company', 'see_company_costs'] as const;

describe('EZD-1711 billing (database)', () => {
  let a = '';
  let b = '';
  let customerA = '';
  let customerB = '';
  let sA: Session;
  let sB: Session;
  let tokenA = '';

  beforeAll(async () => {
    a = await createTenant();
    b = await createTenant();
    customerA = newCustomerId();
    customerB = newCustomerId();
    const ma = await createMember({ tenantId: a, scope: 'all' });
    const mb = await createMember({ tenantId: b, scope: 'all' });
    await setPermissions(a, ma.membershipId, [...OWNER]);
    await setPermissions(b, mb.membershipId, [...OWNER]);
    sA = await signIn(ma.email);
    sB = await signIn(mb.email);
    // AC-EZD-1711-1: a test company onboarded with the stub (a 14-day trial, no card).
    expect((await startTrial(a, customerA, new Date(Date.now() + 14 * DAY_MS))).error).toBeNull();
    const [project] = await createProjects(a, 1);
    tokenA = await sendLink(a, project);
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('D1 rule 4: no member reads or writes billing_account or billing_event, own company or another', async () => {
    expect((await startTrial(b, customerB, new Date(Date.now() + 14 * DAY_MS))).error).toBeNull();
    for (const s of [sA, sB]) {
      const db = s.serverDb;
      const own = await db.from('billing_account').select('tenant_id');
      expect(own.error).toBeNull();
      expect(own.data).toEqual([]);
      const ev = await db.from('billing_event').select('id');
      expect(ev.data ?? []).toEqual([]);
      const ins = await db
        .from('billing_account')
        .insert({ tenant_id: a, stripe_customer_id: newCustomerId(), status: 'active' });
      expect(ins.error).not.toBeNull();
      await db.from('billing_account').update({ status: 'active' }).eq('tenant_id', b);
      await db.from('billing_account').delete().eq('tenant_id', a);
    }
    // Nothing changed: A is still trialing, B is still trialing.
    expect((await account(a)).status).toBe('trialing');
    expect((await account(b)).status).toBe('trialing');
    // The write functions are service-role only.
    const viaMember = await (sA.serverDb as unknown as SupabaseClient).rpc('billing_apply_subscription', {
      p_event_id: newEventId(),
      p_event_type: 'customer.subscription.updated',
      p_event_created: nextCreated(),
      p_customer: customerB,
      p_subscription: newSubscriptionId(),
      p_status: 'unpaid',
      p_trial_ends_at: null,
      p_period_end: null,
      p_seats: null,
    });
    expect(viaMember.error).not.toBeNull();
    const trialViaMember = await (sA.serverDb as unknown as SupabaseClient).rpc('billing_start_trial', {
      p_tenant: b,
      p_customer: newCustomerId(),
      p_subscription: null,
      p_trial_ends_at: new Date().toISOString(),
    });
    expect(trialViaMember.error).not.toBeNull();
    expect((await account(b)).status).toBe('trialing');
    // billing_gate answers only the caller's own company.
    expect((await gate(sA)).applies).toBe(true);
    await apply({ customer: customerB, status: 'unpaid' });
    expect((await gate(sB)).mode).toBe('grace');
    expect((await gate(sA)).mode).toBe('full');
  });

  it('D2 the trial: full use, 14 days left (Q-0237)', async () => {
    const st = await gate(sA);
    expect(st).toMatchObject({ applies: true, mode: 'full', status: 'trialing', daysLeft: 14 });
  });

  it('D3 AC-EZD-1711-1: a webhook marks the subscription unpaid: grace from now, 14 days, logged once', async () => {
    const before = Date.now();
    expect(await apply({ customer: customerA, status: 'unpaid' })).toBe('applied');
    const row = await account(a);
    expect(row.status).toBe('unpaid');
    expect(row.lapsed_at).not.toBeNull();
    expect(row.lapsed_at!.getTime()).toBeGreaterThanOrEqual(before - 60_000);
    expect(await gate(sA)).toMatchObject({ mode: 'grace', status: 'unpaid', daysLeft: 14 });
    const logged = await harnessSql()<{ details: Record<string, unknown>; object_type: string }[]>`
      select details, object_type from public.event_log
      where tenant_id = ${a}::uuid and action = 'billing.status_changed' order by at`;
    expect(logged.map((r) => r.details)).toEqual([{ oldStatus: 'trialing', status: 'unpaid' }]);
    expect(logged[0].object_type).toBe('billing_account');
  });

  it('D4 the same event twice is applied once; an older event never undoes a newer one; a repeat lapse keeps day 1', async () => {
    const eventId = newEventId();
    const first = nextCreated();
    expect(await apply({ eventId, created: first, customer: customerA, status: 'unpaid' })).toBe(
      'applied',
    );
    expect(await apply({ eventId, created: first, customer: customerA, status: 'active' })).toBe(
      'duplicate',
    );
    const old = new Date(Date.now() - 3600_000).toISOString();
    expect(await apply({ created: old, customer: customerA, status: 'active' })).toBe('stale');
    expect((await account(a)).status).toBe('unpaid');
    await harnessSql()`update public.billing_account set lapsed_at = now() - interval '3 days'
      where tenant_id = ${a}::uuid`;
    await apply({ customer: customerA, status: 'canceled' });
    expect(await gate(sA)).toMatchObject({ mode: 'grace', daysLeft: 11 });
    expect(await apply({ customer: newCustomerId(), status: 'unpaid' })).toBe('unknown_customer');
  });

  it('D5 AC-EZD-1711-3: client links work during the 14 days', async () => {
    expect((await resolveShareLink(tokenA)).status).toBe('active');
    expect(await resolveClientLink(tokenA)).not.toBeNull();
  });

  it('D6 AC-EZD-1711-3: the 14-day boundary: 1 day left a minute before, locked a minute after', async () => {
    await harnessSql()`update public.billing_account
      set lapsed_at = now() - interval '14 days' + interval '1 minute' where tenant_id = ${a}::uuid`;
    expect(await gate(sA)).toMatchObject({ mode: 'grace', daysLeft: 1 });
    await harnessSql()`update public.billing_account
      set lapsed_at = now() - interval '14 days' - interval '1 minute' where tenant_id = ${a}::uuid`;
    expect((await gate(sA)).mode).toBe('locked');
  });

  it('D7 AC-EZD-1711-3: on day 15 client links show "This link isn\'t available"', async () => {
    expect(await resolveShareLink(tokenA)).toEqual({ status: 'unavailable' });
    expect(await resolveClientLink(tokenA)).toBeNull();
    const res = await resolveRoute(
      new Request('http://localhost:3000/api/share-links/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: tokenA }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message_key: string } };
    expect(body.error.code).toBe('share_link_unavailable');
    expect((en as Record<string, unknown>)[body.error.message_key]).toBe("This link isn't available.");
    // No data is deleted (Q-0795; Q-0089).
    const [n] = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.project where tenant_id = ${a}::uuid`;
    expect(n.n).toBe(1);
  });

  it('D8 AC-EZD-1711-3: paying again restores everything', async () => {
    expect(await apply({ customer: customerA, status: 'active' })).toBe('applied');
    expect((await account(a)).lapsed_at).toBeNull();
    expect(await gate(sA)).toMatchObject({ mode: 'full', status: 'active', daysLeft: null });
    expect((await resolveShareLink(tokenA)).status).toBe('active');
    expect(await resolveClientLink(tokenA)).not.toBeNull();
  });

  it('D9 Q-0795: a trial that ended with no card starts the 14 days from its end', async () => {
    const c = await createTenant();
    const m = await createMember({ tenantId: c, scope: 'all' });
    await setPermissions(c, m.membershipId, ['view_projects']);
    const s = await signIn(m.email);
    expect((await startTrial(c, newCustomerId(), new Date(Date.now() - 2 * DAY_MS))).error).toBeNull();
    expect(await gate(s)).toMatchObject({ mode: 'grace', status: 'trialing', daysLeft: 12 });
    await harnessSql()`update public.billing_account set trial_ends_at = now() - interval '15 days'
      where tenant_id = ${c}::uuid`;
    expect((await gate(s)).mode).toBe('locked');
  });

  it('D10 AC-EZD-1711-2: Worth Properties is billing exempt; an exempt company is never billed or limited', async () => {
    const [t1] = await harnessSql()<{ billing_exempt: boolean }[]>`
      select billing_exempt from public.tenant where id = ${TENANT_1_ID}::uuid`;
    expect(t1.billing_exempt).toBe(true);
    const x = await createTenant();
    const m = await createMember({ tenantId: x, scope: 'all' });
    await setPermissions(x, m.membershipId, [...OWNER]);
    const s = await signIn(m.email);
    const customer = newCustomerId();
    expect((await startTrial(x, customer, new Date(Date.now() + DAY_MS))).error).toBeNull();
    await harnessSql()`update public.tenant set billing_exempt = true where id = ${x}::uuid`;
    expect(await gate(s)).toEqual({ applies: false, mode: 'full' });
    expect(await apply({ customer, status: 'unpaid' })).toBe('exempt');
    expect((await account(x)).status).toBe('trialing');
    await harnessSql()`update public.billing_account set lapsed_at = now() - interval '30 days'
      where tenant_id = ${x}::uuid`;
    expect(await gate(s)).toEqual({ applies: false, mode: 'full' });
    const refused = await startTrial(x, newCustomerId(), new Date());
    expect(refused.error?.message).toBe('billing_exempt');
  });

  it('D11 a company with no billing account is not billed', async () => {
    const y = await createTenant();
    const m = await createMember({ tenantId: y, scope: 'all' });
    await setPermissions(y, m.membershipId, ['view_projects']);
    expect(await gate(await signIn(m.email))).toEqual({ applies: false, mode: 'full' });
  });

  // Rule 4: one company's billing rows are invisible and unwritable to another company's member.
  describeTenantIsolation('billing_account', {
    makeRow: (tenantId) => ({
      tenant_id: tenantId,
      stripe_customer_id: newCustomerId(),
      status: 'trialing',
    }),
    update: { status: 'active' },
  });
  describeTenantIsolation('billing_event', {
    makeRow: (tenantId) => ({
      id: newEventId(),
      tenant_id: tenantId,
      type: 'customer.subscription.updated',
    }),
    update: { type: 'customer.subscription.deleted' },
  });
});
