// EZD-143 T1-T9 (vault/plans/EZD-143.md section 4; D1-D3, D5, D8-D10, D13, D14), local stack.
// The tunnel counts event items per client address (clientIp, throttleKey('ip', ...) of EZD-033) in a
// rolling hour; over 60 the whole envelope gets 429 and nothing is forwarded or recorded. Helpers copied
// unchanged from route.test.ts (D14): pending + the next/server mock (after() runs at once and is awaited),
// nonce, eventPayload, envelope, rowsFor; envelope2 and tunnel(body, address?) added per D14. Holds the
// error-alert lock and clears error_alert and error_tunnel_throttle in beforeAll and afterAll (D13).
// Key(x) = throttleKey('ip', clientIp(new Headers({ 'x-forwarded-for': x }), {})) (D13).
import { randomBytes } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../../test-harness/sentry-outbox';
import { adminDb, closeHarness, harnessSql } from '../../../../test-harness/rls/fixtures';
import { clientIp, throttleKey } from '../../../server/auth/throttle';
import { clearStubOutbox, readStubOutbox } from '../../../server/email/test-harness/stub-transport';
import { reportError } from '../../../server/errors/report';
import { initErrorReporting } from '../../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../../server/errors/test-harness/sentry-stub-transport';
import { POST } from './route';

const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => unknown) => {
    pending.push(Promise.resolve().then(callback));
  },
}));

const nonce = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');
const PLACEHOLDER_DSN = 'https://public@ezdraft.invalid/1';

function eventPayload(n: string, source: string) {
  return {
    event_id: '0123456789abcdef0123456789abcdef',
    exception: { values: [{ type: 'Error', value: `EZD-024 tunnel ${n} a@b.test` }] },
    tags: { 'ezd.source': source },
    request: {
      url: 'https://h.test/p/6f1c9a2e-1111-4222-8333-444455556666/plan?x=1',
      cookies: { s: '1' },
      data: 'x',
      query_string: 'x=1',
      headers: { 'User-Agent': 'UA', Authorization: 'Bearer t' },
    },
    user: { id: 'u1', email: 'a@b.test', ip_address: '1.2.3.4' },
    extra: { k: 'v' },
    breadcrumbs: [{ message: 'clicked' }],
  };
}

function envelope(opts: { dsn?: string; nonce: string; source?: string }): string {
  const lines = [
    {
      dsn: opts.dsn ?? PLACEHOLDER_DSN,
      event_id: '0123456789abcdef0123456789abcdef',
      sent_at: new Date().toISOString(),
    },
    { type: 'event' },
    eventPayload(opts.nonce, opts.source ?? 'browser'),
    { type: 'session' },
    {
      sid: '0123456789abcdef0123456789abcdef',
      init: true,
      started: new Date().toISOString(),
      status: 'ok',
    },
  ];
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

// D14: one header, two event items from eventPayload, no session item.
function envelope2(n1: string, n2: string): string {
  const lines = [
    {
      dsn: PLACEHOLDER_DSN,
      event_id: '0123456789abcdef0123456789abcdef',
      sent_at: new Date().toISOString(),
    },
    { type: 'event' },
    eventPayload(n1, 'browser'),
    { type: 'event' },
    eventPayload(n2, 'browser'),
  ];
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

async function tunnel(body: string, address?: string) {
  pending.length = 0;
  const response = await POST(
    new Request('http://localhost/api/monitoring', {
      method: 'POST',
      body,
      headers: address ? { 'x-forwarded-for': address } : {},
    }),
  );
  await Promise.all(pending);
  return response;
}

async function rowsFor(n: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await adminDb().from('error_alert').select('*').ilike('title', `%${n}%`);
  expect(error).toBeNull();
  return data ?? [];
}

// D13 Key(x).
function keyOf(address: string): string {
  const ip = clientIp(new Headers({ 'x-forwarded-for': address }), {});
  expect(ip, `clientIp(${address})`).not.toBeNull();
  return throttleKey('ip', ip as string);
}

// D13: n rows for the key aged `age` seconds. "Full" = 60 rows aged 0 s (section 4).
async function prefill(key: string, n: number, age = 0): Promise<void> {
  await harnessSql()`
    insert into public.error_tunnel_throttle (key_hash, at)
    select ${key}, now() - make_interval(secs => ${age})
    from generate_series(1, ${n})`;
}
const FULL = 60;

async function throttleRows(key: string): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from public.error_tunnel_throttle where key_hash = ${key}`;
  return rows[0].n as number;
}

async function allThrottleRows(): Promise<number> {
  const rows = await harnessSql()`select count(*)::int as n from public.error_tunnel_throttle`;
  return rows[0].n as number;
}

async function forwardedWith(n: string): Promise<number> {
  await Sentry.flush(2000);
  return eventsIn(readSentryStubOutbox()).filter((e) =>
    String(e.exception?.values?.[0]?.value ?? '').includes(n),
  ).length;
}

// Section 3 / D10 body and header; D14: no forwarded event and no error_alert row holds the nonces.
async function expectRefused(response: Response, ...nonces: string[]): Promise<void> {
  expect(response.status).toBe(429);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error: { code: 'too_many_requests', message_key: 'error.too_many_requests' },
  });
  for (const n of nonces) {
    expect(await forwardedWith(n), `forwarded ${n}`).toBe(0);
    expect(await rowsFor(n), `rows ${n}`).toEqual([]);
  }
}

describe('EZD-143 tunnel limits each address', () => {
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    await harnessSql()`delete from public.error_tunnel_throttle`;
  }, 180000);

  afterEach(() => {
    vi.unstubAllEnvs();
    clearStubOutbox();
    clearSentryStubOutbox();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await harnessSql()`delete from public.error_tunnel_throttle`;
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-143 T1 done when: the last slot is taken, then events from that address past 60 get 429 and add no rows', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const key = keyOf('203.0.113.11');
    await prefill(key, 59);

    const n1 = nonce();
    const first = await tunnel(envelope({ nonce: n1 }), '203.0.113.11');
    expect(first.status).toBe(200);
    const rows = await rowsFor(n1);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('browser');
    expect(await throttleRows(key)).toBe(60);

    const outboxBefore = readStubOutbox().length;
    const n2 = nonce();
    const second = await tunnel(envelope({ nonce: n2 }), '203.0.113.11');
    await expectRefused(second, n2);
    expect(readStubOutbox()).toHaveLength(outboxBefore);
    expect(await throttleRows(key)).toBe(60);
  });

  it('EZD-143 T2 the count is per address', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    await prefill(keyOf('203.0.113.12'), FULL);
    const n3 = nonce();
    const response = await tunnel(envelope({ nonce: n3 }), '203.0.113.13');
    expect(response.status).toBe(200);
    expect(await rowsFor(n3)).toHaveLength(1);
  });

  it('EZD-143 T3 an envelope that would pass the limit is refused whole', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const key = keyOf('203.0.113.14');
    await prefill(key, 59);
    const n4 = nonce();
    const n5 = nonce();
    const response = await tunnel(envelope2(n4, n5), '203.0.113.14');
    await expectRefused(response, n4, n5);
    expect(await throttleRows(key)).toBe(59);
  });

  it('EZD-143 T4 the hour rolls: rows older than an hour no longer count and are deleted', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const key = keyOf('203.0.113.15');
    await prefill(key, FULL, 3660);
    const n6 = nonce();
    const response = await tunnel(envelope({ nonce: n6 }), '203.0.113.15');
    expect(response.status).toBe(200);
    expect(await rowsFor(n6)).toHaveLength(1);
    expect(await throttleRows(key)).toBe(1);
  });

  it('EZD-143 T5 IPv6 addresses count by their /64', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    expect(clientIp(new Headers({ 'x-forwarded-for': '2001:db8:1:2::abcd' }), {})).toBe(
      '2001:db8:1:2::/64',
    );
    await prefill(keyOf('2001:db8:1:2::abcd'), FULL);

    const n7 = nonce();
    const same = await tunnel(envelope({ nonce: n7 }), '2001:db8:1:2::abcd');
    await expectRefused(same, n7);

    const n8 = nonce();
    const other = await tunnel(envelope({ nonce: n8 }), '2001:db8:1:3::1');
    expect(other.status).toBe(200);
    expect(await rowsFor(n8)).toHaveLength(1);
  });

  it('EZD-143 T6 a request with no address is not counted', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const before = await allThrottleRows();
    const n9 = nonce();
    const response = await tunnel(envelope({ nonce: n9 }));
    expect(response.status).toBe(200);
    expect(await rowsFor(n9)).toHaveLength(1);
    expect(await allThrottleRows()).toBe(before);
  });

  it('EZD-143 T7 events tagged ezd.source=worker count toward the address limit', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    await prefill(keyOf('203.0.113.16'), FULL);
    const n10 = nonce();
    const response = await tunnel(envelope({ nonce: n10, source: 'worker' }), '203.0.113.16');
    await expectRefused(response, n10);
  });

  it('EZD-143 T8 a server error is still recorded while an address is full', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    await prefill(keyOf('203.0.113.17'), FULL);
    const nEnvelope = nonce();
    const refused = await tunnel(envelope({ nonce: nEnvelope }), '203.0.113.17');
    await expectRefused(refused, nEnvelope);

    const n11 = nonce();
    const result = await reportError(new Error('EZD-143 fn ' + n11), {
      source: 'function',
      location: '/api/x',
    });
    expect(result.alert).not.toBe('store_unavailable');
    expect(result.alert).not.toBe('capped');
    const rows = await rowsFor(n11);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('function');
  });

  it('EZD-143 T9 a failed count lets the envelope through (fail open)', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    vi.stubEnv('SUPABASE_API_GATE_SECRET', '');
    const n12 = nonce();
    const response = await tunnel(envelope({ nonce: n12 }), '203.0.113.18');
    expect(response.status).toBe(200);
    expect(await forwardedWith(n12)).toBe(1);
  });
});
