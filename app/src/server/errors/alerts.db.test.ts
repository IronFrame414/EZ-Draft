// EZD-024 T1, T6, T7, T8, T12 and T13 (vault/plans/EZD-024.md Tests; Steps 3-5; Re-validation V1, V2, V4, V7),
// local stack. Holds the error-alert lock (V7) for the whole file and deletes every error_alert row before
// each test, because the caps are global. The describeTenantIsolation helper is a sibling describe with its
// own rows, so the per-test delete does not touch it. Expected wording comes from the catalog (Q-0069 (a)).
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../test-harness/sentry-outbox';
import { auditRls } from '../../../test-harness/rls/audit';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { TABLE_GRANTS } from '../../../test-harness/rls/table-grants';
import { onRequestError } from '../../instrumentation';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { getT } from '../messages/get-t';
import { initErrorReporting } from './sentry-options';
import { reportError } from './report';
import { clearSentryStubOutbox, readSentryStubOutbox } from './test-harness/sentry-stub-transport';

const results = vi.hoisted(() => [] as Array<{ alert: string }>);
vi.mock('./report', async (importOriginal) => {
  const original = await importOriginal<typeof import('./report')>();
  return {
    ...original,
    reportError: vi.fn(async (...args: Parameters<typeof original.reportError>) => {
      const result = await original.reportError(...args);
      results.push(result);
      return result;
    }),
  };
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const T = getT('office', 'en');
const nonce = () => Array.from(randomBytes(12), (b) => String.fromCharCode(97 + (b % 26))).join('');
const fingerprint = () => randomBytes(32).toString('hex');
type Row = Record<string, unknown>;

// File-level hooks: the lock covers the main describe and the isolation describe (V7).
let release: () => Promise<void>;
beforeAll(async () => {
  release = await holdErrorAlertLock();
  await harnessSql()`delete from public.error_alert`;
}, 180000);
afterAll(async () => {
  try {
    await harnessSql()`delete from public.error_alert`;
    await cleanup();
    await closeHarness();
  } finally {
    await release();
  }
}, 180000);

describe('EZD-024 error alert store and reporting', () => {
  let tenantA = '';
  let p1 = '';
  let p2 = '';

  async function clearRows() {
    await harnessSql()`delete from public.error_alert`;
  }

  async function rowByFingerprint(f: string): Promise<Row | null> {
    const { data, error } = await adminDb()
      .from('error_alert')
      .select('*')
      .eq('fingerprint', f)
      .maybeSingle();
    expect(error).toBeNull();
    return (data as Row | null) ?? null;
  }

  async function rowsByTitle(text: string): Promise<Row[]> {
    const { data, error } = await adminDb()
      .from('error_alert')
      .select('*')
      .ilike('title', `%${text}%`);
    expect(error).toBeNull();
    return (data as Row[]) ?? [];
  }

  async function record(
    db: ReturnType<typeof anonDb>,
    f: string,
    over: Row = {},
  ): Promise<{ data: Row[] | null; error: { code?: string } | null }> {
    const { data, error } = await db.rpc('record_error_alert', {
      p_kind: 'error',
      p_source: 'browser',
      p_fingerprint: f,
      p_title: 'Error: x',
      p_ref: null,
      p_tenant_id: null,
      p_project_id: null,
      ...over,
    });
    return { data: data as Row[] | null, error };
  }

  async function fillErrorRows(n: number, extra: Row = {}) {
    const rows = Array.from({ length: n }, (_, i) => ({
      kind: 'error',
      source: 'browser',
      fingerprint: fingerprint(),
      title: `Error: filler ${i}`,
      ...extra,
    }));
    const { error } = await adminDb().from('error_alert').insert(rows);
    expect(error, 'admin insert into error_alert').toBeNull();
  }

  beforeAll(async () => {
    tenantA = await createTenant();
    [p1, p2] = await createProjects(tenantA, 2);
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
  }, 180000);

  beforeEach(async () => {
    await clearRows();
    clearStubOutbox();
    clearSentryStubOutbox();
    results.length = 0;
  });

  afterAll(async () => {
    await clearRows();
    await Sentry.close(2000);
  });

  it('EZD-024 done when: a thrown test error reaches the stub transport and queues one owner email; a second identical error queues none', async () => {
    const message = 'EZD-024 done when ' + nonce();
    const errorRequest = { path: '/api/ezd024-probe', method: 'GET', headers: {} };
    const errorContext: Parameters<typeof onRequestError>[2] = {
      routerKind: 'App Router',
      routePath: '/api/ezd024-probe',
      routeType: 'route',
      revalidateReason: undefined,
    };

    await onRequestError(new Error(message), errorRequest, errorContext);
    await Sentry.flush(2000);

    const events = eventsIn(readSentryStubOutbox()).filter(
      (e) => e.exception?.values?.[0]?.value === message,
    );
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].tags['ezd.source']).toBe('function');
    expect(events[0].tags['ezd.location']).toBe('/api/ezd024-probe');
    const outbox = readStubOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe('owner@example.test');
    expect(outbox[0].subject).toBe(T('office.alert.error.subject', { title: 'Error: ' + message }));

    await onRequestError(new Error(message), errorRequest, errorContext);
    expect(readStubOutbox()).toHaveLength(1);
    const rows = await rowsByTitle(message);
    expect(rows).toHaveLength(1);
    expect(rows[0].occurrences).toBe(2);
    expect(rows[0].emailed_at).not.toBeNull();
    expect(results.map((r) => r.alert)).toEqual(['emailed', 'already_emailed']);
  });

  it('EZD-024 T6 record_error_alert and release_error_alert_email', async () => {
    const anon = anonDb({ gate: true });
    const F = fingerprint();

    // (a)
    const a = await record(anon, F);
    expect(a.error).toBeNull();
    expect(a.data?.[0]).toMatchObject({ is_new: true, capped: false });
    expect(a.data?.[0].email_claim).not.toBeNull();
    let row = await rowByFingerprint(F);
    expect(row?.emailed_at).not.toBeNull();
    expect(row?.occurrences).toBe(1);

    // (b)
    const b = await record(anon, F);
    expect(b.data?.[0].is_new).toBe(false);
    expect(b.data?.[0].email_claim).toBeNull();
    row = await rowByFingerprint(F);
    expect(row?.occurrences).toBe(2);

    // (c)
    const G = fingerprint();
    const parallel = await Promise.all(Array.from({ length: 8 }, () => record(anon, G)));
    const rowsOut = parallel.map((r) => r.data?.[0] as Row);
    expect(rowsOut.filter((r) => r.is_new === true)).toHaveLength(1);
    expect(rowsOut.filter((r) => r.email_claim !== null)).toHaveLength(1);
    const gRow = await rowByFingerprint(G);
    expect(gRow?.occurrences).toBe(8);

    // (d)
    const claimRow = rowsOut.find((r) => r.email_claim !== null) as Row;
    const released = await anon.rpc('release_error_alert_email', {
      p_alert_id: gRow?.id,
      p_claim: claimRow.email_claim,
    });
    expect(released.error).toBeNull();
    expect(released.data).toBe(true);
    const again = await record(anon, G);
    expect(again.data?.[0].email_claim).not.toBeNull();

    // (e)
    const unknown = await anon.rpc('release_error_alert_email', {
      p_alert_id: crypto.randomUUID(),
      p_claim: crypto.randomUUID(),
    });
    expect(unknown.data).toBe(false);

    // (f)
    const kind = await record(anon, fingerprint(), { p_kind: 'job_failed' });
    expect(kind.error?.code).toBe('42501');
    const source = await record(anon, fingerprint(), { p_source: 'job' });
    expect(source.error?.code).toBe('42501');
    const forced = fingerprint();
    const withTenant = await record(anon, forced, { p_tenant_id: tenantA });
    expect(withTenant.error).toBeNull();
    expect((await rowByFingerprint(forced))?.tenant_id).toBeNull();

    // (g) service_role (the secret-key client)
    const H = fingerprint();
    const svc = await record(adminDb(), H, {
      p_kind: 'job_failed',
      p_source: 'job',
      p_tenant_id: tenantA,
      p_project_id: p1,
      p_title: 'test: handler_failed',
    });
    expect(svc.error).toBeNull();
    expect(svc.data?.[0].email_claim).not.toBeNull();
    const hRow = await rowByFingerprint(H);
    expect(hRow?.tenant_id).toBe(tenantA);
    expect(hRow?.project_id).toBe(p1);
  });

  it('EZD-024 T7 the row cap and the email cap', async () => {
    // (a) row cap: 100 error rows in the last hour
    await fillErrorRows(100);
    const F = fingerprint();
    const capped = await record(anonDb({ gate: true }), F);
    expect(capped.error).toBeNull();
    expect(capped.data?.[0].alert_id).toBeNull();
    expect(capped.data?.[0].capped).toBe(true);
    expect(await rowByFingerprint(F)).toBeNull();
    const svc = await record(adminDb(), F);
    expect(svc.error).toBeNull();
    expect(await rowByFingerprint(F)).not.toBeNull();

    // (b) email cap: 20 alerts emailed in the last hour
    await clearRows();
    await fillErrorRows(20, { emailed_at: new Date().toISOString() });
    const G = fingerprint();
    const first = await record(anonDb({ gate: true }), G);
    expect(first.data?.[0]).toMatchObject({ is_new: true, email_claim: null, capped: true });
    expect((await rowByFingerprint(G))?.emailed_at).toBeNull();
    await harnessSql()`update public.error_alert set emailed_at = now() - interval '61 minutes' where emailed_at is not null`;
    const second = await record(anonDb({ gate: true }), G);
    expect(second.data?.[0].email_claim).not.toBeNull();
  });

  it('EZD-024 T7 through reportError the capped alert sends nothing, the next one sends one', async () => {
    await fillErrorRows(20, { emailed_at: new Date().toISOString() });
    const message = 'EZD-024 cap ' + nonce();
    const ctx = { source: 'function' as const, location: '/api/cap' };
    const first = await reportError(new Error(message), ctx);
    expect(first.alert).toBe('capped');
    expect(readStubOutbox()).toHaveLength(0);
    await harnessSql()`update public.error_alert set emailed_at = now() - interval '61 minutes' where emailed_at is not null`;
    const second = await reportError(new Error(message), ctx);
    expect(second.alert).toBe('emailed');
    expect(readStubOutbox()).toHaveLength(1);
  });

  describe('row access and privileges', () => {
    let o: Member;
    let s: Member;
    let oSession: Session;
    let sSession: Session;

    beforeAll(async () => {
      o = await createMember({ tenantId: tenantA, scope: 'all' });
      s = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p1] });
      oSession = await signIn(o.email);
      sSession = await signIn(s.email);
    }, 60000);

    it('EZD-024 T8 members read their scope only, never write, and the audit passes', async () => {
      const failure = (project: string) => ({
        tenant_id: tenantA,
        project_id: project,
        kind: 'job_failed',
        source: 'job',
        fingerprint: fingerprint(),
        title: 'test: handler_failed',
      });
      const rows = [
        failure(p1),
        failure(p2),
        { kind: 'error', source: 'browser', fingerprint: fingerprint(), title: 'Error: x' },
      ];
      const { error: insertError } = await adminDb().from('error_alert').insert(rows);
      expect(insertError).toBeNull();

      const seen = await sSession.serverDb.from('error_alert').select('fingerprint, project_id');
      expect(seen.error).toBeNull();
      expect(seen.data).toEqual([{ fingerprint: rows[0].fingerprint, project_id: p1 }]);

      const ins = await oSession.serverDb.from('error_alert').insert(failure(p1));
      expect(ins.error?.code).toBe('42501');
      const upd = await oSession.serverDb
        .from('error_alert')
        .update({ title: 'x' })
        .eq('tenant_id', tenantA);
      expect(upd.error?.code).toBe('42501');
      const del = await oSession.serverDb.from('error_alert').delete().eq('tenant_id', tenantA);
      expect(del.error?.code).toBe('42501');

      const sql = harnessSql();
      const fnRows = await sql`
        select p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'execute') as ok
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
        where n.nspname = 'public' and p.proname in ('record_error_alert', 'release_error_alert_email')`;
      expect(fnRows).toHaveLength(6);
      for (const r of fnRows) expect(r.ok, `${r.proname} ${r.rolname}`).toBe(true);

      expect(await auditRls(sql, { repoRoot })).toEqual([]);
      expect(TABLE_GRANTS.error_alert.privileges).toEqual(['SELECT']);
      expect(TABLE_GRANTS.error_alert.reason.trim().length).toBeGreaterThan(0);
      const priv = async (role: string, p: string) =>
        (await sql`select has_table_privilege(${role}, 'public.error_alert', ${p}) as ok`)[0].ok;
      expect(await priv('authenticated', 'SELECT')).toBe(true);
      for (const p of ['INSERT', 'UPDATE', 'DELETE']) {
        expect(await priv('authenticated', p), p).toBe(false);
      }
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(await priv('service_role', p), p).toBe(true);
      }

      const dir = path.join(repoRoot, 'supabase', 'migrations');
      const norm = (f: string) =>
        readFileSync(path.join(dir, f), 'utf8').toLowerCase().replace(/\s+/g, ' ');
      const files = readdirSync(dir);
      const tableFile = files.filter((f) => f.endsWith('_create_error_alert.sql'));
      const fnFile = files.filter((f) => f.endsWith('_create_error_alert_functions.sql'));
      expect(tableFile).toHaveLength(1);
      expect(fnFile).toHaveLength(1);
      const fnText = norm(fnFile[0]);
      expect((fnText.match(/security definer/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect((fnText.match(/set search_path = ''/g) ?? []).length).toBeGreaterThanOrEqual(2);
      const tableText = norm(tableFile[0]);
      expect(tableText).toContain('grant select on public.error_alert to authenticated');
      expect(tableText).toContain(
        'grant select, insert, update, delete on public.error_alert to service_role',
      );
    });
  });

  it('EZD-024 T12 a failed owner email releases the claim so a later occurrence can send', async () => {
    const message = 'EZD-024 mail ' + nonce();
    const ctx = { source: 'function' as const, location: '/api/m' };

    const first = await reportError(new Error(message), ctx, {
      env: { ...process.env, EMAIL_TRANSPORT: '' },
    });
    expect(first.alert).toBe('email_failed');
    const row = (await rowsByTitle(message))[0];
    expect(row.emailed_at).toBeNull();
    await Sentry.flush(2000);
    const mailEvents = eventsIn(readSentryStubOutbox()).filter(
      (e) => e.tags?.['ezd.location'] === 'email.send',
    );
    expect(mailEvents.length).toBeGreaterThanOrEqual(1);
    expect(readStubOutbox()).toHaveLength(0);

    const second = await reportError(new Error(message), ctx);
    expect(second.alert).toBe('emailed');
    expect(readStubOutbox()).toHaveLength(1);

    const third = await reportError(new Error('EZD-024 mail ' + nonce()), ctx, {
      env: { ...process.env, ALERT_EMAIL_TO: undefined },
    });
    expect(third.alert).toBe('email_failed');
    expect(readStubOutbox()).toHaveLength(1);
  });

  it('EZD-024 T13 reportError never throws when the store is unreachable', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:9');
    try {
      const result = await reportError(new Error('x'), {
        source: 'function',
        location: '/api/n',
      });
      expect(result.alert).toBe('store_unavailable');
      expect(result.sentryEventId).not.toBeNull();
      expect(readStubOutbox()).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// EZD-144 (vault/plans/EZD-144.md sections 1, 3, 4; AC-EZD-144-1, AC-EZD-144-2), local stack. Runs under the
// file-level error-alert lock. A row with a project always has a company: the composite foreign key is MATCH
// SIMPLE and checks nothing when tenant_id is null, so the check error_alert_project_needs_tenant refuses it.
describe('EZD-144 error_alert refuses a project without a company', () => {
  type DbError = { code?: string; message?: string } | null;
  let tenantId = '';
  let projectId = '';

  async function rowOf(f: string): Promise<Row | null> {
    const { data, error } = await adminDb()
      .from('error_alert')
      .select('*')
      .eq('fingerprint', f)
      .maybeSingle();
    expect(error).toBeNull();
    return (data as Row | null) ?? null;
  }

  async function insertAsRunner(row: Row): Promise<DbError> {
    const { error } = await adminDb().from('error_alert').insert(row);
    return error;
  }

  async function recordAsRunner(f: string, over: Row): Promise<DbError> {
    const { error } = await adminDb().rpc('record_error_alert', {
      p_kind: 'error',
      p_source: 'function',
      p_fingerprint: f,
      p_title: 'Error: x',
      p_ref: null,
      p_tenant_id: null,
      p_project_id: null,
      ...over,
    });
    return error;
  }

  beforeAll(async () => {
    tenantId = await createTenant();
    [projectId] = await createProjects(tenantId, 1);
  }, 180000);

  beforeEach(async () => {
    await harnessSql()`delete from public.error_alert`;
  });

  afterAll(async () => {
    await harnessSql()`delete from public.error_alert`;
  });

  it('EZD-144 done when: a service_role insert with a project and no company fails with 23514', async () => {
    const f = fingerprint();
    const error = await insertAsRunner({
      kind: 'error',
      source: 'function',
      fingerprint: f,
      title: 'Error: x',
      tenant_id: null,
      project_id: projectId,
    });
    expect(error?.code).toBe('23514');
    expect(error?.message).toContain('error_alert_project_needs_tenant');
    expect(await rowOf(f)).toBeNull();
  });

  it('EZD-144 T2 record_error_alert as service_role refuses a project without a company', async () => {
    const f = fingerprint();
    const error = await recordAsRunner(f, { p_project_id: projectId });
    expect(error?.code).toBe('23514');
    expect(error?.message).toContain('error_alert_project_needs_tenant');
    expect(await rowOf(f)).toBeNull();
  });

  it('EZD-144 T3 an update that adds a project to a row without a company fails', async () => {
    const f = fingerprint();
    const inserted = await insertAsRunner({
      kind: 'error',
      source: 'function',
      fingerprint: f,
      title: 'Error: x',
    });
    expect(inserted).toBeNull();
    const { error } = await adminDb()
      .from('error_alert')
      .update({ project_id: projectId })
      .eq('fingerprint', f);
    expect(error?.code).toBe('23514');
    expect(error?.message).toContain('error_alert_project_needs_tenant');
    expect((await rowOf(f))?.project_id).toBeNull();
  });

  it('EZD-144 T4 rows the app writes still insert', async () => {
    const a = fingerprint();
    const b = fingerprint();
    const c = fingerprint();
    expect(
      await insertAsRunner({
        kind: 'error',
        source: 'function',
        fingerprint: a,
        title: 'Error: x',
        tenant_id: null,
        project_id: null,
      }),
    ).toBeNull();
    expect(
      await insertAsRunner({
        kind: 'job_failed',
        source: 'job',
        fingerprint: b,
        title: 'test: handler_failed',
        tenant_id: tenantId,
        project_id: projectId,
      }),
    ).toBeNull();
    expect(
      await insertAsRunner({
        kind: 'job_failed',
        source: 'job',
        fingerprint: c,
        title: 'test: handler_failed',
        tenant_id: tenantId,
        project_id: null,
      }),
    ).toBeNull();

    const rowA = await rowOf(a);
    expect(rowA?.tenant_id).toBeNull();
    expect(rowA?.project_id).toBeNull();
    const rowB = await rowOf(b);
    expect(rowB?.tenant_id).toBe(tenantId);
    expect(rowB?.project_id).toBe(projectId);
    const rowC = await rowOf(c);
    expect(rowC?.tenant_id).toBe(tenantId);
    expect(rowC?.project_id).toBeNull();
  });

  it('EZD-144 T5 the constraint is validated with the planned definition', async () => {
    const rows = await harnessSql()`
      select contype, convalidated, pg_get_constraintdef(oid) as def
      from pg_constraint
      where conrelid = 'public.error_alert'::regclass and conname = 'error_alert_project_needs_tenant'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].contype).toBe('c');
    expect(rows[0].convalidated).toBe(true);
    expect(rows[0].def).toBe('CHECK (((tenant_id IS NOT NULL) OR (project_id IS NULL)))');
  });
});

// Last in the file; its rows live in its own tenants and are removed by the helper's afterAll. A sibling
// describe, so the main describe's per-test delete never touches its row; the file-level lock covers it.
describe('EZD-024 error_alert tenant isolation', () => {
  describeTenantIsolation('error_alert', {
    makeRow: (t) => ({
      tenant_id: t,
      kind: 'job_failed',
      source: 'job',
      fingerprint: fingerprint(),
      title: 'test: handler_failed',
    }),
  });
});
