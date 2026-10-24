// EZD-040 R1 (vault/plans/EZD-040.md Tests), local stack. Same tunnel() pattern as route.test.ts (EZD-024 T9).
import { randomBytes } from 'node:crypto';
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
import { POST } from './route';

const pending = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => unknown) => {
    pending.push(Promise.resolve().then(callback));
  },
}));

const UUID = '6f1c9a2e-1111-4222-8333-444455556666';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv12';
const TRACE = '0123456789abcdef0123456789abcdef';
const PLACEHOLDER_DSN = 'https://public@ezdraft.invalid/1';

const nonce = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');

function envelope(n: string): string {
  const event = {
    event_id: '0123456789abcdef0123456789abcdef',
    exception: {
      values: [
        {
          type: 'Error',
          value: `EZD-040 tunnel ${n}`,
          stacktrace: {
            frames_omitted: [1, 2],
            frames: [
              {
                filename: 'https://h.test/_next/static/chunks/a.js?dpl=dpl_x',
                abs_path: `https://h.test/p/${UUID}/x.js`,
                function: 'send a@b.test',
                module: 'm 482913',
                context_line: `token ${TOKEN}`,
                pre_context: ['a@b.test', 5],
                post_context: ['ok'],
                lineno: 1,
                colno: 2,
                in_app: true,
                vars: { password: 'p' },
                foo: 'a@b.test',
              },
              'not a frame',
            ],
          },
        },
      ],
    },
    tags: {
      'ezd.source': 'browser',
      'ezd.location': 'pwa.register',
      mail: 'a@b.test',
      project: UUID,
      share: TOKEN,
      'a@b.test': 'k',
      n: 3,
      ok: true,
      obj: { x: 1 },
      arr: ['a'],
      nul: null,
    },
    contexts: {
      page: {
        url: 'https://h.test/p/x?t=1',
        owner: 'a@b.test',
        ids: [UUID, 7, null, true],
        nested: { code: 'code 482913', deeper: { k: TOKEN } },
      },
      'a@b.test': { k: 'v' },
      trace: { trace_id: TRACE, sampled: false },
    },
  };
  const lines = [
    {
      dsn: PLACEHOLDER_DSN,
      event_id: '0123456789abcdef0123456789abcdef',
      sent_at: new Date().toISOString(),
    },
    { type: 'event' },
    event,
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

describe('EZD-040 tunnel scrubs tags and contexts', () => {
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

  it('EZD-040 done when: a browser event with an email, UUID or token in a tag or context reaches the Sentry stub scrubbed', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const response = await tunnel(envelope(nonce()));
    expect(response.status).toBe(200);
    await Sentry.flush(2000);

    const events = eventsIn(readSentryStubOutbox());
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.tags).toEqual({
      'ezd.source': 'browser',
      'ezd.location': 'pwa.register',
      mail: '<email>',
      project: '<uuid>',
      share: '<token>',
      '<email>': 'k',
      n: 3,
      ok: true,
    });
    expect(event.contexts).toEqual({
      page: {
        url: 'https://h.test/p/x',
        owner: '<email>',
        ids: ['<uuid>', 7, null, true],
        nested: { code: 'code <code>', deeper: { k: '<token>' } },
      },
      '<email>': { k: 'v' },
      trace: { trace_id: '<token>', sampled: false },
    });
    expect(event.exception.values[0].stacktrace).toEqual({
      frames: [
        {
          filename: 'https://h.test/_next/static/chunks/a.js',
          abs_path: 'https://h.test/p/<uuid>/x.js',
          function: 'send <email>',
          module: 'm <code>',
          context_line: 'token <token>',
          pre_context: ['<email>'],
          post_context: ['ok'],
          lineno: 1,
          colno: 2,
          in_app: true,
        },
      ],
    });
    expect(event.environment).toBe('local');
  });
});
