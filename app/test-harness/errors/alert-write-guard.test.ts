// EZD-252 T1-T6 (vault/plans/EZD-252.md section 4): a Vitest file that makes the app write error_alert rows
// without holdErrorAlertLock fails, and the write is refused by the local-only trigger. T1 and T2 run the probes
// in a child Vitest (pattern: test-harness/net-guard/net-guard.test.ts childEnv, runProbe). This file holds no
// file-level lock: T4 (c) takes it inside the test, so a probe never waits on its parent (section 1, Decided).
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TransactionSql } from 'postgres';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { GUARD_MARKER } from '../net-guard/net-guard.mjs';
import { adminDb, closeHarness, harnessSql } from '../rls/fixtures';
import { holdErrorAlertLock } from './alert-lock';
import {
  ALERT_WRITE_GUARD_MARKER,
  alertWriteGuardState,
  createAlertWriteGuardFetch,
  newAlertWriteGuardState,
} from './alert-write-guard';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..', '..');
const repoRoot = path.resolve(appDir, '..');

const fingerprint = () => randomBytes(32).toString('hex');
const F1 = fingerprint();
const F2 = fingerprint();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MESSAGE =
  'error_alert written without holdErrorAlertLock: POST /rest/v1/rpc/record_error_alert';

function childEnv(probeFingerprint: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, EZD252_PROBE_FINGERPRINT: probeFingerprint };
  delete env.EZD_TEST_GREP; // docs/architecture.md Test scope: a spawned runner sets its own scope
  delete env.NODE_OPTIONS;
  return env;
}

function runProbe(probe: string, probeFingerprint: string) {
  const run = spawnSync(
    'pnpm',
    [
      '--filter',
      '@ezdraft/app',
      'exec',
      'vitest',
      'run',
      '--config',
      'test-harness/errors/probe.vitest.config.mts',
      `test-harness/errors/probes/${probe}`,
    ],
    { cwd: repoRoot, encoding: 'utf8', env: childEnv(probeFingerprint), timeout: 240000 },
  );
  return { status: run.status, output: `${run.stdout}\n${run.stderr}` };
}

class Sentinel extends Error {}

const insertAlert = (tx: TransactionSql) =>
  tx`insert into public.error_alert (kind, source, fingerprint, title)
     values ('error', 'function', ${fingerprint()}, 'Error: ezd252')`;

afterAll(async () => {
  await closeHarness();
});

describe('EZD-252 error-alert write guard', () => {
  it('EZD-252 T1 a test file that makes the app write error_alert without the lock fails', () => {
    const r = runProbe('unlocked-write.probe.ts', F1);
    expect(r.status, r.output).toBe(1);
    expect(r.output).toContain(MESSAGE);
  }, 260000);

  it('EZD-252 T2 a test file that holds the lock passes', () => {
    const r = runProbe('locked-write.probe.ts', F2);
    expect(r.status, r.output).toBe(0);
  }, 260000);

  it('EZD-252 T3 the refused write left no row', async () => {
    const { data, error } = await adminDb().from('error_alert').select('id').eq('fingerprint', F1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('EZD-252 T4 the trigger refuses a tagged write unless that tag holds the lock', async () => {
    // (a) tagged with a token no lock connection carries
    const a = harnessSql().begin(async (tx) => {
      await tx`select set_config('request.headers', ${JSON.stringify({ 'x-ezd-test-file': randomUUID() })}, true)`;
      await insertAlert(tx);
    });
    await expect(a).rejects.toMatchObject({ code: 'EZ252' });

    // (b) no header: allowed; the sentinel rolls it back
    const b = harnessSql().begin(async (tx) => {
      await insertAlert(tx);
      throw new Sentinel('ezd252 sentinel b');
    });
    await expect(b).rejects.toBeInstanceOf(Sentinel);

    // (c) tagged with this file's token while holding the lock (on its own connection)
    const release = await holdErrorAlertLock();
    try {
      const c = harnessSql().begin(async (tx) => {
        await tx`select set_config('request.headers', ${JSON.stringify({ 'x-ezd-test-file': alertWriteGuardState().token })}, true)`;
        await insertAlert(tx);
        throw new Sentinel('ezd252 sentinel c');
      });
      await expect(c).rejects.toBeInstanceOf(Sentinel);
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-252 T5 the fetch wrapper tags Supabase requests and records refusals', async () => {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL as string).origin;
    const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));

    // (a) URL string with init.headers
    {
      const s = newAlertWriteGuardState();
      const next = ok();
      const wrapped = createAlertWriteGuardFetch(next as unknown as typeof fetch, origin, s);
      await wrapped(`${origin}/`, { headers: { a: '1' } });
      expect(next).toHaveBeenCalledTimes(1);
      const init = (next.mock.calls[0] as unknown[])[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(headers.get('a')).toBe('1');
      expect(headers.get('x-ezd-test-file')).toBe(s.token);
    }

    // (b) Request with its own header
    {
      const s = newAlertWriteGuardState();
      const next = ok();
      const wrapped = createAlertWriteGuardFetch(next as unknown as typeof fetch, origin, s);
      await wrapped(new Request(`${origin}/`, { headers: { b: '2' } }));
      expect(next).toHaveBeenCalledTimes(1);
      const init = (next.mock.calls[0] as unknown[])[1] as RequestInit;
      const headers = new Headers(init.headers);
      expect(headers.get('b')).toBe('2');
      expect(headers.get('x-ezd-test-file')).toBe(s.token);
    }

    // (c) another origin goes through untouched
    {
      const s = newAlertWriteGuardState();
      const next = ok();
      const wrapped = createAlertWriteGuardFetch(next as unknown as typeof fetch, origin, s);
      const init: RequestInit = { method: 'GET' };
      await wrapped('http://127.0.0.1:1/x', init);
      expect(next).toHaveBeenCalledTimes(1);
      const call = next.mock.calls[0] as unknown[];
      expect(call[0]).toBe('http://127.0.0.1:1/x');
      expect(call[1]).toBe(init);
    }

    // (d) a refused write (400 JSON code EZ252) is recorded; the caller still reads the body
    {
      const s = newAlertWriteGuardState();
      const next = vi.fn(async () => Response.json({ code: 'EZ252' }, { status: 400 }));
      const wrapped = createAlertWriteGuardFetch(next as unknown as typeof fetch, origin, s);
      const res = await wrapped(`${origin}/rest/v1/rpc/record_error_alert`, { method: 'POST' });
      expect(((await res.json()) as { code: string }).code).toBe('EZ252');
      expect(s.violations).toHaveLength(1);
      expect(s.violations[0]).toMatchObject({
        method: 'POST',
        path: '/rest/v1/rpc/record_error_alert',
      });
    }

    // (e) any other error code is not a violation
    {
      const s = newAlertWriteGuardState();
      const next = vi.fn(async () => Response.json({ code: '42501' }, { status: 400 }));
      const wrapped = createAlertWriteGuardFetch(next as unknown as typeof fetch, origin, s);
      await wrapped(`${origin}/rest/v1/rpc/record_error_alert`, { method: 'POST' });
      expect(s.violations).toEqual([]);
    }
  });

  it('EZD-252 T6 the guard runs in every app Vitest file', async () => {
    const f = globalThis.fetch as unknown as Record<symbol, unknown>;
    expect(f[ALERT_WRITE_GUARD_MARKER]).toBe(true);
    expect(f[GUARD_MARKER]).toBe(true);
    expect(alertWriteGuardState().token).toMatch(UUID);
    const rows = await harnessSql()`
      select tgenabled from pg_trigger
      where tgname = 'ezd_test_alert_write_guard' and tgrelid = 'public.error_alert'::regclass`;
    expect(rows).toHaveLength(1);
    expect(rows[0].tgenabled).toBe('O');
  });
});
