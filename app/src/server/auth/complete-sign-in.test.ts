// EZD-288 T3 (vault/plans/EZD-288.md sections 3-4; AC-EZD-288-1): completeSignIn with an accepted invite whose
// user.joined emit fails still signs in and reports the failure once through reportError. The stub client and
// the vi.mock of ../events copy app/src/server/auth/sign-in.test.ts (EZD-007d T36) lines 93-99 and 211-232;
// the report check is expectReportedOnce (app/test-harness/errors/expect-reported.ts). Local database and the
// stub Sentry transport only (CLAUDE.md rule 6).
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { expectReportedOnce } from '../../../test-harness/errors/expect-reported';
import { closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';
import { initErrorReporting } from '../errors/sentry-options';
import { clearSentryStubOutbox } from '../errors/test-harness/sentry-stub-transport';
import type { Database } from '../db/database.types';
import { emit } from '../events';
import { completeSignIn } from './complete-sign-in';

vi.mock('../events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});

const emitMock = vi.mocked(emit);

type StubResult = { data: unknown; error: unknown };

function stubClient(opts: { rpc: StubResult; refresh?: { error: unknown } }) {
  const calls = { rpc: [] as unknown[][], signOut: [] as unknown[][], refresh: 0 };
  const client = {
    rpc: (...args: unknown[]) => {
      calls.rpc.push(args);
      return Promise.resolve(opts.rpc);
    },
    auth: {
      signOut: async (...args: unknown[]) => {
        calls.signOut.push(args);
        return { error: null };
      },
      refreshSession: async () => {
        calls.refresh += 1;
        return opts.refresh
          ? { data: { session: null, user: null }, error: opts.refresh.error }
          : { data: { session: {}, user: {} }, error: null };
      },
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, calls };
}

describe('EZD-288 sign-in reports a failed user.joined event', () => {
  let releaseLock: () => Promise<void> = async () => {};

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
  }, 180000);

  beforeEach(async () => {
    clearSentryStubOutbox();
    await harnessSql()`delete from public.error_alert`;
    emitMock.mockClear();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('EZD-288 T3 a failed user.joined emit still signs in and is reported once', async () => {
    emitMock.mockRejectedValueOnce(
      Object.assign(new Error('ezd288-probe-detail'), { name: 'ProbeEmitError' }),
    );
    const s = stubClient({
      rpc: {
        data: [
          {
            app_user_id: 'u',
            has_access: true,
            accepted_membership_id: 'm',
            accepted_tenant_id: 't',
          },
        ],
        error: null,
      },
    });
    await expect(completeSignIn(s.client)).resolves.toBe('ok');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'user.joined',
      { membershipId: 'm', appUserId: 'u', via: 'sign_in' },
      { tenantId: 't', actorId: 'u' },
    );
    expect(s.calls.refresh).toBe(1);
    expect(s.calls.signOut).toEqual([]);
    await expectReportedOnce({
      message: 'user_joined_event_failed',
      location: 'auth.sign_in',
      cause: 'ProbeEmitError',
      hidden: 'ezd288-probe-detail',
    });
  });
});
