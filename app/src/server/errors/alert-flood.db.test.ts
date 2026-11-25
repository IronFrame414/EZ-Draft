// EZD-1933 (audit 2026-11-23 S3; vault/plans/audit-2026-11-23.md), local stack. The two error-alert functions
// anon may run, record_error_alert and release_error_alert_email, called as anon with the API gate header 100
// times in a row with distinct fingerprints, never queue more owner alert emails than the EZD-024 limit:
// 20 alerts per rolling hour (vault/plans/EZD-024.md line 161, Q-0068 (a)), of which browser and worker
// alerts may use at most 10 (EZD-143, Q-0278 (b); supabase/migrations/20261025043420_error_alert_caps_per_source.sql).
// Holds the error-alert lock for the whole file and clears error_alert around every test (EZD-024 V7).
import { randomBytes } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { anonDb, closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { initErrorReporting } from './sentry-options';
import { recordAndAlert } from './report';
import { clearSentryStubOutbox } from './test-harness/sentry-stub-transport';

const fingerprint = () => randomBytes(32).toString('hex');
const randomUuid = () => crypto.randomUUID();
const ROUNDS = 100;
const EMAIL_CAP = 20; // EZD-024 plan line 161 (Q-0068 (a))
const BROWSER_WORKER_SHARE = 10; // EZD-143 (Q-0278 (b))

type Source = 'browser' | 'worker' | 'function';

async function clearRows() {
  await harnessSql()`delete from public.error_alert`;
}

async function emailedRows(): Promise<number> {
  const rows = await harnessSql()`
    select count(*)::int as n from public.error_alert
    where emailed_at is not null and emailed_at > now() - interval '1 hour'`;
  return rows[0].n as number;
}

function alertInput(source: Source, i: number) {
  const title = `Error: EZD-1933 flood ${source} ${i}`;
  return {
    kind: 'error' as const,
    source,
    fingerprint: fingerprint(),
    title,
    ref: null,
    tenantId: null,
    projectId: null,
    params: { kind: 'error' as const, title, source, location: '/flood', eventId: null },
  };
}

let releaseLock: () => Promise<void>;
beforeAll(async () => {
  releaseLock = await holdErrorAlertLock();
  await clearRows();
  initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
}, 180000);

afterAll(async () => {
  try {
    await clearRows();
    await Sentry.close(2000);
    await closeHarness();
  } finally {
    await releaseLock();
  }
}, 180000);

beforeEach(async () => {
  await clearRows();
  clearStubOutbox();
  clearSentryStubOutbox();
});

describe('EZD-1933 signed-out error-alert functions cannot flood the owner with email', () => {
  it('100 direct anon calls of both functions hand out at most the browser share of 10 and the cap of 20', async () => {
    const anon = anonDb({ gate: true });
    let claims = 0;
    for (const source of ['browser', 'function'] as const) {
      for (let i = 0; i < ROUNDS; i++) {
        const { data, error } = await anon.rpc('record_error_alert', {
          p_kind: 'error',
          p_source: source,
          p_fingerprint: fingerprint(),
          p_title: `Error: EZD-1933 direct ${source} ${i}`,
          p_ref: null as unknown as string,
          p_tenant_id: null as unknown as string,
          p_project_id: null as unknown as string,
        });
        expect(error).toBeNull();
        const row = data![0];
        if (row.email_claim) claims += 1;
        // A caller without the claim cannot give a slot back.
        const released = await anon.rpc('release_error_alert_email', {
          p_alert_id: (row.alert_id ?? randomUuid()) as string,
          p_claim: randomUuid(),
        });
        expect(released.error).toBeNull();
        expect(released.data).toBe(false);
      }
      expect(claims).toBe(source === 'browser' ? BROWSER_WORKER_SHARE : EMAIL_CAP);
      expect(await emailedRows()).toBe(claims);
    }
  }, 180000);

  it('100 browser alerts through the sending path queue exactly 10 owner emails', async () => {
    const anon = anonDb({ gate: true });
    for (let i = 0; i < ROUNDS; i++) {
      await recordAndAlert(anon, alertInput(i % 2 === 0 ? 'browser' : 'worker', i), process.env);
    }
    expect(readStubOutbox()).toHaveLength(BROWSER_WORKER_SHARE);
    expect(await emailedRows()).toBe(BROWSER_WORKER_SHARE);
  }, 180000);

  it('100 function alerts through the sending path queue exactly 20 owner emails', async () => {
    const anon = anonDb({ gate: true });
    const outcomes: string[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      outcomes.push((await recordAndAlert(anon, alertInput('function', i), process.env)).alert);
    }
    expect(readStubOutbox()).toHaveLength(EMAIL_CAP);
    expect(outcomes.filter((o) => o === 'emailed')).toHaveLength(EMAIL_CAP);
    expect(outcomes.filter((o) => o === 'capped')).toHaveLength(ROUNDS - EMAIL_CAP);
  }, 180000);

  it('released claims (failed sends) send nothing, and later sends still stop at the cap of 20', async () => {
    const anon = anonDb({ gate: true });
    const failing = { ...process.env, EMAIL_TRANSPORT: '' };
    // 50 + 50, so the row cap of 100 new function rows per hour is not what stops the second half.
    const half = ROUNDS / 2;
    for (let i = 0; i < half; i++) {
      const { alert } = await recordAndAlert(anon, alertInput('function', i), failing);
      expect(alert).toBe('email_failed');
    }
    expect(readStubOutbox()).toHaveLength(0);
    expect(await emailedRows()).toBe(0);

    for (let i = 0; i < half; i++) {
      await recordAndAlert(anon, alertInput('function', half + i), process.env);
    }
    expect(readStubOutbox()).toHaveLength(EMAIL_CAP);
    expect(await emailedRows()).toBe(EMAIL_CAP);
  }, 180000);
});
