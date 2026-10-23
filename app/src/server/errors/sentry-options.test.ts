// EZD-024 T2 and T3 (vault/plans/EZD-024.md Tests; Steps 1 and 2): Sentry options from env, and the stub
// transport. No test reaches Sentry: a fetch spy must see 0 calls (CLAUDE.md rule 10).
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as Sentry from '@sentry/nextjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSentryStubOutboxDir } from '../../../test-harness/sentry-outbox';
import { getSentryOptions } from './sentry-options';
import {
  clearSentryStubOutbox,
  createSentryStubTransport,
  readSentryStubOutbox,
} from './test-harness/sentry-stub-transport';

describe('EZD-024 Sentry options and stub transport', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearSentryStubOutbox();
  });

  it('EZD-024 T2 getSentryOptions reads env per call and never enables live Sentry in tests', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const PLACEHOLDER = 'https://public@ezdraft.invalid/1';

    expect(getSentryOptions({})).toEqual({ enabled: false, code: 'sentry_off' });
    expect(getSentryOptions({ SENTRY_TRANSPORT: 'datadog' })).toEqual({
      enabled: false,
      code: 'sentry_transport_invalid',
    });
    expect(getSentryOptions({ SENTRY_TRANSPORT: 'stub', VERCEL_ENV: 'production' })).toEqual({
      enabled: false,
      code: 'sentry_stub_not_allowed',
    });

    const d = getSentryOptions({ SENTRY_TRANSPORT: 'stub' });
    expect(d).toMatchObject({
      enabled: true,
      dsn: PLACEHOLDER,
      environment: 'local',
      sendDefaultPii: false,
    });

    expect(getSentryOptions({ SENTRY_TRANSPORT: 'sentry' })).toEqual({
      enabled: false,
      code: 'sentry_dsn_not_set',
    });
    expect(getSentryOptions({ SENTRY_TRANSPORT: 'sentry', SENTRY_DSN: 'not a dsn' })).toEqual({
      enabled: false,
      code: 'sentry_dsn_not_set',
    });

    const live = { SENTRY_TRANSPORT: 'sentry', SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2' };
    // (g) VITEST removed
    vi.stubEnv('VITEST', undefined);
    expect(getSentryOptions(live)).toMatchObject({
      enabled: true,
      dsn: 'https://k@o1.ingest.sentry.io/2',
    });
    // (h) VITEST set
    vi.stubEnv('VITEST', 'true');
    expect(getSentryOptions(live)).toEqual({
      enabled: false,
      code: 'sentry_live_blocked_in_tests',
    });

    // (i)
    expect(
      getSentryOptions({
        SENTRY_TRANSPORT: 'stub',
        VERCEL_ENV: 'preview',
        VERCEL_GIT_COMMIT_SHA: 'abc123',
      }),
    ).toMatchObject({ enabled: true, environment: 'preview', release: 'abc123' });

    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('EZD-024 T3 the stub transport records every envelope in memory and in the folder', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd024-sentry-'));
    try {
      Sentry.init({
        dsn: 'https://public@ezdraft.invalid/1',
        transport: createSentryStubTransport({ dir }),
        defaultIntegrations: false,
        integrations: [],
      });
      Sentry.captureException(new Error('one'));
      Sentry.captureMessage('two');
      await Sentry.flush(2000);

      const inMemory = readSentryStubOutbox();
      expect(inMemory).toHaveLength(2);
      const onDisk = readSentryStubOutboxDir(dir);
      expect(onDisk).toEqual(JSON.parse(JSON.stringify(inMemory)));
      expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(2);
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    } finally {
      await Sentry.close(2000);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
