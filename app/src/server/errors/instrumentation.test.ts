// EZD-024 T14, T15 and T16 (vault/plans/EZD-024.md Tests; Steps 9 and 10; Re-validation V4, V7). Holds the
// error-alert lock (V7) because T14 counts error_alert rows. T15 mocks the runner and reportError; T14 and T16
// use the real ones with the Sentry stub transport.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../test-harness/sentry-outbox';
import { adminDb, closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';
import { register } from '../../instrumentation';
import { sendEmail } from '../email/send';
import { kickJobRunner } from '../jobs/kick';
import { initErrorReporting } from './sentry-options';
import { clearSentryStubOutbox, readSentryStubOutbox } from './test-harness/sentry-stub-transport';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  runJobs: vi.fn(async () => ({})),
  reportError: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('../jobs/runner', () => ({ runJobs: mocks.runJobs }));
vi.mock('./report', async (importOriginal) => {
  const original = await importOriginal<typeof import('./report')>();
  mocks.reportError.mockImplementation(original.reportError);
  return { ...original, reportError: mocks.reportError };
});

const appSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('EZD-024 email failures, kick and instrumentation', () => {
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
  }, 180000);

  beforeEach(() => {
    clearSentryStubOutbox();
    mocks.after.mockReset();
    mocks.runJobs.mockReset();
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

  it('EZD-024 T16 register() starts the function client and the hooks are wired', async () => {
    // T16 runs first in the file: no earlier test has initialised a Sentry client, so a defined client
    // after register() is register()'s doing.
    expect(Sentry.getClient()).toBeUndefined();
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    try {
      await register();
      expect(Sentry.getClient()).toBeDefined();
      Sentry.captureException(new Error('EZD-024 register probe'));
      await Sentry.flush(2000);
      const probe = eventsIn(readSentryStubOutbox()).filter(
        (e) => e.exception?.values?.[0]?.value === 'EZD-024 register probe',
      );
      expect(probe).toHaveLength(1);
      expect(probe[0].tags['ezd.source']).toBe('function');
    } finally {
      vi.unstubAllEnvs();
    }
    const instrumentation = await import('../../instrumentation');
    expect(typeof instrumentation.onRequestError).toBe('function');
    for (const file of ['server/jobs/kick.ts', 'app/api/jobs/sweep/route.ts']) {
      expect(readFileSync(path.join(appSrc, file), 'utf8'), file).toContain('defaultJobHooks');
    }
  });

  it('EZD-024 T14 a failed email send reaches Sentry without the recipient or the link', async () => {
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const recipient = 'recipient-ezd024@example.test';
    const linkUrl = 'https://example.test/secret-link-ezd024';
    const result = await sendEmail(
      {
        to: recipient,
        subject: 'EZD-024 probe',
        paragraphs: ['probe'],
        link: { url: linkUrl, label: 'Open' },
      },
      { env: { EMAIL_FROM: 'x@example.test' } },
    );
    expect(result.status).toBe('failed');
    await Sentry.flush(2000);
    const mail = eventsIn(readSentryStubOutbox()).filter(
      (e) => e.tags?.['ezd.location'] === 'email.send',
    );
    expect(mail).toHaveLength(1);
    const text = JSON.stringify(mail[0]);
    expect(text).toContain('email_transport_not_set');
    expect(text).not.toContain(recipient);
    expect(text).not.toContain(linkUrl);
    const rows = await adminDb().from('error_alert').select('id');
    expect(rows.data).toEqual([]);
  });

  it('EZD-024 T15 kickJobRunner reports a rejected run through reportError and throws nothing', async () => {
    mocks.reportError.mockClear();
    mocks.reportError.mockImplementationOnce(async () => ({
      sentryEventId: null,
      alert: 'not_alerted',
      alertId: null,
    }));
    mocks.runJobs.mockRejectedValue(new Error('kick'));
    kickJobRunner();
    expect(mocks.after).toHaveBeenCalledTimes(1);
    await expect((mocks.after.mock.calls[0][0] as () => Promise<unknown>)()).resolves.not.toThrow();
    expect(mocks.reportError).toHaveBeenCalledTimes(1);
    expect(mocks.reportError.mock.calls[0][1]).toMatchObject({
      source: 'function',
      location: 'jobs.kick',
    });
  });
});
