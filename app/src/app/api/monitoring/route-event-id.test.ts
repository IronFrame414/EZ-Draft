// EZD-183 (vault/plans/EZD-183.md Tests; Build steps row 1), local stack for T1-T3. Same tunnel() pattern as
// route-scrub.test.ts (EZD-040 R1). The envelope header's event_id is forwarded only when it is a string that
// matches EVENT_ID (EZD-142 D8); anything else is left out, and the event itself still arrives.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../../test-harness/sentry-outbox';
import { closeHarness, harnessSql } from '../../../../test-harness/rls/fixtures';
import { clearStubOutbox } from '../../../server/email/test-harness/stub-transport';
import { initErrorReporting } from '../../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../../server/errors/test-harness/sentry-stub-transport';
import { EVENT_ID } from '../../../lib/errors/scrub';
import { POST } from './route';

const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => unknown) => {
    pending.push(Promise.resolve().then(callback));
  },
}));

const PLACEHOLDER_DSN = 'https://public@ezdraft.invalid/1';
const GOOD = 'fedcba9876543210fedcba9876543210';

const nonce = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');

// The envelope header carries event_id only when `headerEventId` is not undefined; the event body always
// carries GOOD as its own event_id.
function envelope(headerEventId: unknown, n: string): string {
  const header: Record<string, unknown> = {
    dsn: PLACEHOLDER_DSN,
    sent_at: new Date().toISOString(),
  };
  if (headerEventId !== undefined) header.event_id = headerEventId;
  const event = {
    event_id: GOOD,
    exception: { values: [{ type: 'Error', value: `EZD-183 tunnel ${n}` }] },
    tags: { 'ezd.source': 'browser' },
  };
  const lines = [header, { type: 'event' }, event];
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

// Each case: the header event_id value (given the case's second nonce m) and the text that must not reach
// the Sentry stub outbox.
type BadCase = [label: string, header: (m: string) => unknown, marker: (m: string) => string];
const BAD_CASES: BadCase[] = [
  ['a: an email address around a nonce', (m) => `x${m}@b.test`, (m) => m],
  ['b: upper-case hex', () => 'FEDCBA9876543210FEDCBA9876543210', () => 'FEDCBA98'],
  ['c: 31 characters', () => '1'.repeat(31), () => '1'.repeat(31)],
  ['d: 33 characters', () => '1'.repeat(33), () => '1'.repeat(31)],
  ['e: a UUID with dashes', () => '6f1c9a2e-1111-4222-8333-444455556666', () => '6f1c9a2e'],
  ['f: a trailing newline', () => '1'.repeat(32) + '\n', () => '1'.repeat(31)],
  ['g: a leading space', () => ' ' + '1'.repeat(32), () => '1'.repeat(31)],
  ['h: a non-hex letter at the end', () => '1'.repeat(31) + 'g', () => '1'.repeat(31)],
  ['i: an object, not a string', (m) => ({ id: `y${m}@b.test` }), (m) => m],
];

describe('EZD-183 tunnel forwards only a well-formed header event_id', () => {
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

  it.each(BAD_CASES)(
    'EZD-183 a header event_id that is not 32 lower-case hex is left out (%s)',
    async (_label, header, marker) => {
      const n = nonce();
      const m = nonce();
      initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
      const response = await tunnel(envelope(header(m), n));
      expect(response.status).toBe(200);
      await Sentry.flush(2000);

      const sent = readSentryStubOutbox();
      expect(sent).toHaveLength(1);
      expect(Object.keys(sent[0].header).sort()).toEqual(['dsn', 'sent_at']);
      expect(JSON.stringify(sent)).not.toContain(marker(m));

      const events = eventsIn(sent);
      expect(events).toHaveLength(1);
      expect(events[0].exception.values[0].value).toBe(`EZD-183 tunnel ${n}`);
      expect(events[0].event_id).toBe(GOOD);
    },
  );

  it('EZD-183 done when: a header event_id of 32 lower-case hex characters is forwarded unchanged', async () => {
    const n = nonce();
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const response = await tunnel(envelope(GOOD, n));
    expect(response.status).toBe(200);
    await Sentry.flush(2000);

    const sent = readSentryStubOutbox();
    expect(sent).toHaveLength(1);
    expect(sent[0].header.event_id).toBe(GOOD);
    expect(Object.keys(sent[0].header).sort()).toEqual(['dsn', 'event_id', 'sent_at']);
    expect(eventsIn(sent)).toHaveLength(1);
  });

  it('EZD-183 a request with no header event_id is forwarded as before', async () => {
    const n = nonce();
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const response = await tunnel(envelope(undefined, n));
    expect(response.status).toBe(200);
    await Sentry.flush(2000);

    const sent = readSentryStubOutbox();
    expect(sent).toHaveLength(1);
    expect(Object.keys(sent[0].header).sort()).toEqual(['dsn', 'sent_at']);
    expect(eventsIn(sent)).toHaveLength(1);
  });
});

describe('EZD-183 one event_id pattern', () => {
  it('EZD-183 the exported pattern is the EZD-142 event_id pattern', () => {
    expect(EVENT_ID.source).toBe('^[0-9a-f]{32}$');
    expect(EVENT_ID.flags).toBe('');
    expect(EVENT_ID.test(GOOD)).toBe(true);
    expect(EVENT_ID.test(GOOD)).toBe(true);
  });

  it('EZD-183 the route uses the exported pattern, not a copy', () => {
    const text = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    expect(text).toMatch(
      /import\s*\{[^}]*\bEVENT_ID\b[^}]*\}\s*from\s*'\.\.\/\.\.\/\.\.\/lib\/errors\/scrub'/,
    );
    expect(text).toContain('EVENT_ID.test(');
    expect(text).not.toContain('{32}');
  });
});
