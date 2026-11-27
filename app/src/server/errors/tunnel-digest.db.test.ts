// EZD-2020 (AC-EZD-2020-1, AC-EZD-2020-2; audit 2026-11-27 X3), local stack. Reports through the public error
// tunnel (source browser or worker) never get their own owner email: record_error_alert hands them no claim,
// and claim_tunnel_alert_digest (service_role only) gives every waiting tunnel row one claim at most once per
// rolling hour. Stamped digest rows do not use up the cap of 20 emails per hour, so made-up reports cannot
// crowd out a real function error. Holds the error-alert lock for the whole file and clears error_alert
// around every test (EZD-024 V7).
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
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { initErrorReporting } from './sentry-options';
import { recordAndAlert } from './report';
import { clearSentryStubOutbox } from './test-harness/sentry-stub-transport';
import { sendTunnelAlertDigest } from './tunnel-digest';

const fingerprint = () => randomBytes(32).toString('hex');
const EMAIL_CAP = 20; // EZD-024 plan line 161 (Q-0068 (a))

type Source = 'browser' | 'worker' | 'function';

function alertInput(source: Source, i: number) {
  const title = `Error: EZD-2020 ${source} ${i}`;
  return {
    kind: 'error' as const,
    source,
    fingerprint: fingerprint(),
    title,
    ref: null,
    tenantId: null,
    projectId: null,
    params: { kind: 'error' as const, title, source, location: '/x', eventId: null },
  };
}

async function record(source: Source, f: string, title = 'Error: EZD-2020 direct') {
  const { data, error } = await anonDb({ gate: true }).rpc('record_error_alert', {
    p_kind: 'error',
    p_source: source,
    p_fingerprint: f,
    p_title: title,
    p_ref: null as unknown as string,
    p_tenant_id: null as unknown as string,
    p_project_id: null as unknown as string,
  });
  expect(error).toBeNull();
  return data![0] as { alert_id: string; email_claim: string | null; capped: boolean };
}

async function claimDigest() {
  const { data, error } = await adminDb().rpc('claim_tunnel_alert_digest');
  expect(error).toBeNull();
  return data as Array<{ claim: string; alert_id: string; title: string; occurrences: number }>;
}

async function clearRows() {
  await harnessSql()`delete from public.error_alert`;
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
    await cleanup();
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

describe('EZD-2020 tunnel alerts go out as one digest per hour', () => {
  it('AC-EZD-2020-1 a browser or worker report is recorded and counted but never gets its own email claim', async () => {
    for (const source of ['browser', 'worker'] as const) {
      const f = fingerprint();
      const first = await record(source, f);
      expect(first.alert_id).toBeTruthy();
      expect(first.email_claim).toBeNull();
      expect(first.capped).toBe(false);
      const again = await record(source, f);
      expect(again.alert_id).toBe(first.alert_id);
      expect(again.email_claim).toBeNull();
    }
    const rows = await harnessSql()`
      select occurrences, emailed_at, email_claim from public.error_alert order by source`;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.occurrences).toBe(2);
      expect(r.emailed_at).toBeNull();
      expect(r.email_claim).toBeNull();
    }
  }, 60000);

  it('AC-EZD-2020-1 100 browser and worker reports through the sending path send no per-report email', async () => {
    const anon = anonDb({ gate: true });
    for (let i = 0; i < 100; i++) {
      await recordAndAlert(anon, alertInput(i % 2 === 0 ? 'browser' : 'worker', i), process.env);
    }
    expect(readStubOutbox()).toHaveLength(0);
  }, 180000);

  it('AC-EZD-2020-1 one digest claims every waiting tunnel row; a second within the hour claims nothing', async () => {
    for (let i = 0; i < 5; i++) await record(i % 2 ? 'worker' : 'browser', fingerprint(), `Error: d ${i}`);
    await record('function', fingerprint(), 'Error: function row');
    const first = await claimDigest();
    expect(first).toHaveLength(5);
    expect(new Set(first.map((r) => r.claim)).size).toBe(1);
    expect(first.map((r) => r.title).sort()).toEqual([0, 1, 2, 3, 4].map((i) => `Error: d ${i}`));

    // A report that arrives after the digest waits for the next hour.
    await record('browser', fingerprint(), 'Error: late');
    expect(await claimDigest()).toEqual([]);

    // An hour later the waiting row is sent, and only that one.
    await harnessSql()`
      update public.error_alert set emailed_at = now() - interval '61 minutes' where emailed_at is not null`;
    const next = await claimDigest();
    expect(next.map((r) => r.title)).toEqual(['Error: late']);
  }, 60000);

  it('AC-EZD-2020-1 made-up reports cannot crowd out a real error: after a digest of 100 rows a function error still emails', async () => {
    const anon = anonDb({ gate: true });
    for (let i = 0; i < 100; i++) await recordAndAlert(anon, alertInput('browser', i), process.env);
    const digest = await sendTunnelAlertDigest({ db: adminDb() as never, env: process.env });
    expect(digest).toEqual({ status: 'emailed', count: 100 });
    const box = readStubOutbox();
    expect(box).toHaveLength(1);
    expect(box[0].subject).toBe('EZ Draft errors reported by a browser (unverified): 100 new');

    const outcomes: string[] = [];
    for (let i = 0; i < EMAIL_CAP + 1; i++) {
      outcomes.push((await recordAndAlert(anon, alertInput('function', i), process.env)).alert);
    }
    expect(outcomes.filter((o) => o === 'emailed')).toHaveLength(EMAIL_CAP);
    expect(outcomes[EMAIL_CAP]).toBe('capped');
    expect(readStubOutbox()).toHaveLength(1 + EMAIL_CAP);
  }, 180000);

  it('AC-EZD-2020-1 a digest that could not be sent gives its rows back for the next sweep', async () => {
    for (let i = 0; i < 3; i++) await record('browser', fingerprint(), `Error: r ${i}`);
    const failed = await sendTunnelAlertDigest({
      db: adminDb() as never,
      env: { ...process.env, ALERT_EMAIL_TO: undefined },
    });
    expect(failed).toEqual({ status: 'email_failed', count: 3 });
    const stamped = await harnessSql()`
      select count(*)::int as n from public.error_alert where emailed_at is not null or email_claim is not null`;
    expect(stamped[0].n).toBe(0);
    const sent = await sendTunnelAlertDigest({ db: adminDb() as never, env: process.env });
    expect(sent).toEqual({ status: 'emailed', count: 3 });
  }, 60000);

  it('AC-EZD-2020-2 only the job runner may claim or release a digest: anon and a signed-in member are refused', async () => {
    await record('browser', fingerprint());
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    const session = await signIn(member.email);
    for (const db of [anonDb({ gate: true }), session.serverDb]) {
      const claim = await db.rpc('claim_tunnel_alert_digest');
      expect(claim.error?.code).toBe('42501');
      const release = await db.rpc('release_tunnel_alert_digest', {
        p_claim: crypto.randomUUID(),
      });
      expect(release.error?.code).toBe('42501');
    }
    const untouched = await harnessSql()`
      select count(*)::int as n from public.error_alert where emailed_at is null and email_claim is null`;
    expect(untouched[0].n).toBe(1);
  }, 60000);
});
