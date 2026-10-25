// EZD-143 B1-B10 (vault/plans/EZD-143.md section 4; Data; D4-D6, D13, D16), local stack.
// error_tunnel_take (anon only, gated; 60 slots per key per rolling hour), the row cap of record_error_alert
// counted per source group (function apart from browser + worker; 100 each) and the browser + worker share
// of the alert emails (10 of the 20 per rolling hour). Holds the error-alert lock from the start of
// beforeAll to the end of afterAll and clears error_alert and error_tunnel_throttle in beforeAll, afterAll
// and beforeEach (D13). fillErrorRows is copied unchanged from alerts.db.test.ts (D13); "emailed" rows are
// fillErrorRows(n, { emailed_at: new Date().toISOString(), source }) (EZD-024 T7 (b) pattern).
import { randomBytes } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { clearStubOutbox } from '../email/test-harness/stub-transport';
import { initErrorReporting } from './sentry-options';
import { reportError } from './report';
import { clearSentryStubOutbox } from './test-harness/sentry-stub-transport';

const nonce = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');
const fingerprint = () => randomBytes(32).toString('hex');
const freshKey = () => randomBytes(32).toString('hex');
type Row = Record<string, unknown>;

async function clearRows() {
  await harnessSql()`delete from public.error_alert`;
  await harnessSql()`delete from public.error_tunnel_throttle`;
}

async function prefill(key: string, n: number, age = 0): Promise<void> {
  await harnessSql()`
    insert into public.error_tunnel_throttle (key_hash, at)
    select ${key}, now() - make_interval(secs => ${age})
    from generate_series(1, ${n})`;
}

async function throttleRows(key: string): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from public.error_tunnel_throttle where key_hash = ${key}`;
  return rows[0].n as number;
}

async function take(
  key: string | null,
  events: number | null,
): Promise<{ data: unknown; error: { code?: string } | null }> {
  const { data, error } = await anonDb({ gate: true }).rpc('error_tunnel_take', {
    p_ip_key: key,
    p_events: events,
  });
  return { data, error };
}

async function rowByFingerprint(f: string): Promise<Row | null> {
  const { data, error } = await adminDb()
    .from('error_alert')
    .select('*')
    .eq('fingerprint', f)
    .maybeSingle();
  expect(error).toBeNull();
  return (data as Row | null) ?? null;
}

async function rowsByTitle(text: string): Promise<Row[]> {
  const { data, error } = await adminDb()
    .from('error_alert')
    .select('*')
    .ilike('title', `%${text}%`);
  expect(error).toBeNull();
  return (data as Row[]) ?? [];
}

async function record(
  f: string,
  over: Row = {},
): Promise<{ data: Row[] | null; error: { code?: string } | null }> {
  const { data, error } = await anonDb({ gate: true }).rpc('record_error_alert', {
    p_kind: 'error',
    p_source: 'browser',
    p_fingerprint: f,
    p_title: 'Error: x',
    p_ref: null,
    p_tenant_id: null,
    p_project_id: null,
    ...over,
  });
  return { data: data as Row[] | null, error };
}

async function fillErrorRows(n: number, extra: Row = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({
    kind: 'error',
    source: 'browser',
    fingerprint: fingerprint(),
    title: `Error: filler ${i}`,
    ...extra,
  }));
  const { error } = await adminDb().from('error_alert').insert(rows);
  expect(error, 'admin insert into error_alert').toBeNull();
}

const emailed = (source: string): Row => ({ emailed_at: new Date().toISOString(), source });

async function emailedInLastHour(): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from public.error_alert
    where emailed_at is not null and emailed_at > now() - interval '1 hour'`;
  return rows[0].n as number;
}

describe('EZD-143 tunnel throttle and per-source row caps', () => {
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdErrorAlertLock();
    await clearRows();
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
  }, 180000);

  beforeEach(async () => {
    await clearRows();
    clearStubOutbox();
    clearSentryStubOutbox();
  });

  afterAll(async () => {
    try {
      await clearRows();
      await cleanup();
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-143 B1 error_tunnel_take gives 60 slots per key and inserts one row per event', async () => {
    const k1 = freshKey();
    const a = await take(k1, 1);
    expect(a.error).toBeNull();
    expect(a.data).toBe(true);
    expect(await throttleRows(k1)).toBe(1);

    const k2 = freshKey();
    await prefill(k2, 59);
    const b1 = await take(k2, 1);
    expect(b1.error).toBeNull();
    expect(b1.data).toBe(true);
    const b2 = await take(k2, 1);
    expect(b2.error).toBeNull();
    expect(b2.data).toBe(false);
    expect(await throttleRows(k2)).toBe(60);

    const k3 = freshKey();
    const c = await take(k3, 60);
    expect(c.error).toBeNull();
    expect(c.data).toBe(true);
    expect(await throttleRows(k3)).toBe(60);

    const k4 = freshKey();
    const d = await take(k4, 61);
    expect(d.error).toBeNull();
    expect(d.data).toBe(false);
    expect(await throttleRows(k4)).toBe(0);
  });

  it('EZD-143 B2 bad input is refused with 22023', async () => {
    expect((await take('abc', 1)).error?.code).toBe('22023');
    expect((await take(null, 1)).error?.code).toBe('22023');
    expect((await take(freshKey(), 0)).error?.code).toBe('22023');
    expect((await take(freshKey(), null)).error?.code).toBe('22023');
  });

  it('EZD-143 B3 two takes at once cannot both get the last slot', async () => {
    const key = freshKey();
    await prefill(key, 59);
    const results = await Promise.all([take(key, 1), take(key, 1)]);
    for (const r of results) expect(r.error).toBeNull();
    expect(results.filter((r) => r.data === true)).toHaveLength(1);
    expect(await throttleRows(key)).toBe(60);
  });

  it('EZD-143 B4 only anon may execute error_tunnel_take and no API role reads the table', async () => {
    const sql = harnessSql();
    const can = async (role: string) =>
      (
        await sql`select has_function_privilege(${role}, 'public.error_tunnel_take(text, integer)', 'execute') as ok`
      )[0].ok;
    expect(await can('anon')).toBe(true);
    expect(await can('authenticated')).toBe(false);
    expect(await can('service_role')).toBe(false);

    const anonSelect = await anonDb({ gate: true }).from('error_tunnel_throttle').select('*');
    expect(anonSelect.error?.code).toBe('42501');

    const member = await createMember({ tenantId: await createTenant(), scope: 'all' });
    const { serverDb } = await signIn(member.email);
    const memberSelect = await serverDb.from('error_tunnel_throttle').select('*');
    expect(memberSelect.error?.code).toBe('42501');
  });

  it('EZD-143 B5 done when: a function error is still recorded while the browser row count is full', async () => {
    await fillErrorRows(100);
    const n = nonce();
    const result = await reportError(new Error('EZD-143 cap ' + n), {
      source: 'function',
      location: '/api/cap',
    });
    const rows = await rowsByTitle(n);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('function');
    expect(result.alert).not.toBe('capped');

    const F = fingerprint();
    const browser = await record(F, { p_source: 'browser' });
    expect(browser.error).toBeNull();
    expect(browser.data?.[0].capped).toBe(true);
    expect(browser.data?.[0].alert_id).toBeNull();
    expect(await rowByFingerprint(F)).toBeNull();
  });

  it('EZD-143 B6 the function row cap is counted apart from the browser one', async () => {
    await fillErrorRows(100, { source: 'function' });
    const F = fingerprint();
    const fn = await record(F, { p_source: 'function' });
    expect(fn.error).toBeNull();
    expect(fn.data?.[0].capped).toBe(true);
    expect(await rowByFingerprint(F)).toBeNull();

    const G = fingerprint();
    const browser = await record(G, { p_source: 'browser' });
    expect(browser.error).toBeNull();
    expect(browser.data?.[0].capped).toBe(false);
    expect(await rowByFingerprint(G)).not.toBeNull();
  });

  it('EZD-143 B7 worker rows share the browser row cap', async () => {
    await fillErrorRows(50, { source: 'browser' });
    await fillErrorRows(50, { source: 'worker' });
    const F = fingerprint();
    const worker = await record(F, { p_source: 'worker' });
    expect(worker.error).toBeNull();
    expect(worker.data?.[0].capped).toBe(true);
    expect(await rowByFingerprint(F)).toBeNull();
  });

  it('EZD-143 B8 browser alerts use at most 10 of the 20 emails an hour', async () => {
    await fillErrorRows(10, emailed('browser'));
    const H1 = fingerprint();
    const first = await record(H1, { p_source: 'browser' });
    expect(first.error).toBeNull();
    expect(first.data?.[0]).toMatchObject({ is_new: true, email_claim: null, capped: true });
    const h1Row = await rowByFingerprint(H1);
    expect(h1Row).not.toBeNull();
    expect(h1Row?.emailed_at).toBeNull();

    const H2 = fingerprint();
    const second = await record(H2, { p_source: 'function' });
    expect(second.error).toBeNull();
    expect(second.data?.[0].is_new).toBe(true);
    expect(second.data?.[0].email_claim).not.toBeNull();
    expect(second.data?.[0].capped).toBe(false);
    expect(await emailedInLastHour()).toBe(11);
  });

  it('EZD-143 B9 worker alerts share the browser email share', async () => {
    await fillErrorRows(5, emailed('browser'));
    await fillErrorRows(5, emailed('worker'));
    const worker = await record(fingerprint(), { p_source: 'worker' });
    expect(worker.error).toBeNull();
    expect(worker.data?.[0].email_claim).toBeNull();
    expect(worker.data?.[0].capped).toBe(true);

    const fn = await record(fingerprint(), { p_source: 'function' });
    expect(fn.error).toBeNull();
    expect(fn.data?.[0].email_claim).not.toBeNull();
    expect(fn.data?.[0].capped).toBe(false);
  });

  it('EZD-143 B10 the total of 20 emails still bounds every source, and the hour rolls', async () => {
    await fillErrorRows(20, emailed('function'));
    const H3 = fingerprint();
    const browser = await record(H3, { p_source: 'browser' });
    expect(browser.error).toBeNull();
    expect(browser.data?.[0].email_claim).toBeNull();
    expect(browser.data?.[0].capped).toBe(true);

    const H4 = fingerprint();
    const fn = await record(H4, { p_source: 'function' });
    expect(fn.error).toBeNull();
    expect(fn.data?.[0].email_claim).toBeNull();
    expect(fn.data?.[0].capped).toBe(true);

    await harnessSql()`update public.error_alert set emailed_at = now() - interval '61 minutes' where emailed_at is not null`;
    const again = await record(H3, { p_source: 'browser' });
    expect(again.error).toBeNull();
    expect(again.data?.[0].is_new).toBe(false);
    expect(again.data?.[0].email_claim).not.toBeNull();
    expect(again.data?.[0].capped).toBe(false);
  });
});
