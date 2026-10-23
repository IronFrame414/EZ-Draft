// EZD-036 U2 and U4 (vault/plans/EZD-036.md section 4).
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SAMPLE_KEYS = [
  'tracesSampleRate',
  'tracesSampler',
  'profilesSampleRate',
  'replaysSessionSampleRate',
  'replaysOnErrorSampleRate',
];

describe('EZD-036 lazy Sentry stub', () => {
  let loads = 0;
  beforeEach(() => {
    loads = 0;
    vi.resetModules();
    vi.doMock('./test-harness/sentry-stub-transport', async (importOriginal) => {
      loads += 1;
      return importOriginal();
    });
  });

  it('EZD-036 U2: the stub module loads on the first send of a stub transport', async () => {
    const { getSentryOptions } = await import('./sentry-options');
    const a = getSentryOptions({});
    expect(a).toEqual({ enabled: false, code: 'sentry_off' });

    const dir = mkdtempSync(path.join(tmpdir(), 'ezd036-sentry-'));
    const b = getSentryOptions({ SENTRY_TRANSPORT: 'stub', SENTRY_STUB_DIR: dir });
    expect(b.enabled).toBe(true);
    if (!b.enabled) throw new Error('unreachable');
    expect(b.dsn).toBe('https://public@ezdraft.invalid/1');
    expect(typeof b.transport).toBe('function');

    const make = b.transport as unknown as (o: unknown) => {
      send(envelope: unknown): Promise<{ statusCode: number }>;
      flush(): Promise<boolean>;
    };
    const t = make({});
    expect(await t.flush()).toBe(true);
    expect(loads).toBe(0);

    const res = await t.send([
      { event_id: 'e036' },
      [[{ type: 'event' }, { message: 'EZD-036 probe' }]],
    ]);
    expect(res).toEqual({ statusCode: 200 });
    expect(loads).toBe(1);

    const { readSentryStubOutbox } = await import('./test-harness/sentry-stub-transport');
    const mine = readSentryStubOutbox().filter(
      (e) => JSON.stringify(e.items[0]?.payload) === JSON.stringify({ message: 'EZD-036 probe' }),
    );
    expect(mine).toHaveLength(1);
    expect(mine[0].items[0].payload).toEqual({ message: 'EZD-036 probe' });
    expect(readdirSync(dir).filter((f) => /^\d{13}-\d{6}\.json$/.test(f))).toHaveLength(1);
  });

  describe('init options', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.doUnmock('@sentry/nextjs');
    });

    it('EZD-036 U4: init turns runtime channel injection off and adds no sampling', async () => {
      const init = vi.fn();
      vi.doMock('@sentry/nextjs', () => ({
        init,
        linkedErrorsIntegration: () => ({ name: 'LinkedErrors' }),
        getGlobalScope: () => ({ setTag: vi.fn() }),
      }));
      const { initErrorReporting } = await import('./sentry-options');

      expect(initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function')).toBe('ok');
      vi.stubEnv('VITEST', undefined);
      expect(
        initErrorReporting(
          { SENTRY_TRANSPORT: 'sentry', SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2' },
          'function',
        ),
      ).toBe('ok');

      expect(init).toHaveBeenCalledTimes(2);
      const [first, second] = init.mock.calls.map((c) => c[0] as Record<string, unknown>);
      for (const opts of [first, second]) {
        expect(opts.enableRuntimeChannelInjection).toBe(false);
        expect(opts.defaultIntegrations).toBe(false);
        for (const k of SAMPLE_KEYS) expect(opts).not.toHaveProperty(k);
      }
      expect(first.dsn).toBe('https://public@ezdraft.invalid/1');
      expect(second.dsn).toBe('https://k@o1.ingest.sentry.io/2');
    });
  });
});
