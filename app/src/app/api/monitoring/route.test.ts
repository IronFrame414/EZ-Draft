// EZD-024 T9 (vault/plans/EZD-024.md Tests; Step 7; Step 10 worker contract; Re-validation V7), local stack.
// tunnel() = the route's POST with next/server mocked so after() runs its callback at once and the test
// awaits it (EZD-009 T21 pattern). Holds the error-alert lock (V7). Case (e) runs first, before any Sentry
// client exists in this file, so "nothing forwarded" cannot be satisfied by a client from an earlier case.
import { randomBytes } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../../test-harness/sentry-outbox';
import { adminDb, closeHarness, harnessSql } from '../../../../test-harness/rls/fixtures';
import { clearStubOutbox, readStubOutbox } from '../../../server/email/test-harness/stub-transport';
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

async function tunnel(body: string) {
  pending.length = 0;
  const response = await POST(
    new Request('http://localhost/api/monitoring', { method: 'POST', body }),
  );
  await Promise.all(pending);
  return response;
}

async function rowsFor(n: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await adminDb().from('error_alert').select('*').ilike('title', `%${n}%`);
  expect(error).toBeNull();
  return data ?? [];
}

describe('EZD-024 tunnel route', () => {
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
  }, 180000);

  afterEach(() => {
    vi.unstubAllEnvs();
    clearStubOutbox();
    clearSentryStubOutbox();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-024 T9 (e) with Sentry off nothing is forwarded, the owner is still emailed', async () => {
    vi.stubEnv('SENTRY_TRANSPORT', '');
    const n = nonce();
    const response = await tunnel(envelope({ nonce: n }));
    expect(response.status).toBe(200);
    expect(readSentryStubOutbox()).toHaveLength(0);
    expect(readStubOutbox()).toHaveLength(1);
  });

  it('EZD-024 T9 (a)(g) a good envelope is scrubbed, forwarded and recorded once; a repeat sends no email', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const n = nonce();
    const response = await tunnel(envelope({ nonce: n }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    await Sentry.flush(2000);

    const forwarded = readSentryStubOutbox();
    expect(forwarded).toHaveLength(1);
    expect(forwarded[0].items).toHaveLength(1);
    expect(forwarded[0].items[0].header.type).toBe('event');
    expect(forwarded[0].header.dsn).toBe(PLACEHOLDER_DSN);
    const [event] = eventsIn(forwarded);
    expect(event.exception.values[0].value).toBe(`EZD-024 tunnel ${n} <email>`);
    expect(event.environment).toBe('local');
    expect('breadcrumbs' in event).toBe(false);
    expect(event.user).toEqual({ id: 'u1' });

    const sent = readStubOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('owner@example.test');
    const [row] = await rowsFor(n);
    expect(row).toMatchObject({ source: 'browser', kind: 'error', tenant_id: null });

    // (g) the same envelope again
    clearSentryStubOutbox();
    const again = await tunnel(envelope({ nonce: n }));
    expect(again.status).toBe(200);
    expect(readSentryStubOutbox()).toHaveLength(1);
    expect(readStubOutbox()).toHaveLength(1);
  });

  it('EZD-024 T9 (b)(c) a bad envelope or another project DSN is refused and nothing is recorded', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const n = nonce();
    const expectedBody = {
      error: { code: 'invalid_envelope', message_key: 'error.invalid_envelope' },
    };
    const bad = await tunnel('not an envelope');
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual(expectedBody);
    const other = await tunnel(envelope({ nonce: n, dsn: 'https://k@o1.ingest.sentry.io/2' }));
    expect(other.status).toBe(400);
    expect(await other.json()).toEqual(expectedBody);
    expect(readSentryStubOutbox()).toHaveLength(0);
    expect(readStubOutbox()).toHaveLength(0);
    expect(await rowsFor(n)).toEqual([]);
  });

  it('EZD-024 T9 (d) a body over 262,144 bytes is refused', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const response = await tunnel('a'.repeat(262145));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: { code: 'envelope_too_large', message_key: 'error.envelope_too_large' },
    });
  });

  it('EZD-024 T9 (f) an envelope tagged ezd.source=worker is recorded as a worker error', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const n = nonce();
    const response = await tunnel(envelope({ nonce: n, source: 'worker' }));
    expect(response.status).toBe(200);
    const [row] = await rowsFor(n);
    expect(row.source).toBe('worker');
    expect(readStubOutbox()).toHaveLength(1);
  });
});
