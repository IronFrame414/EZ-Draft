// EZD-123 J1-J9 (AC-EZD-123-1, -3, -4, -7, -8; rule 4). Local database: the daily run (run_version_cleanup through
// the cleanup job handler) and the sweep's enqueue. Expected values: examples 09p "Cleanup clock" rows 1, 2, 4-6 (row
// 3 is replaced by Q-0708: a row is never deleted in the run that stamps it, so with grace 0 it goes at the next
// daily run); Q-0700 05 "Cleanup sheet" (cleanup_due to active members with Edit model granted whose scope includes
// the project, one per person per project per run, link "/projects/<id>"); Q-0700 03 "Daily cleanup" (dryRun lists
// and writes nothing; safe to run twice); S20 Events emitted (cleanup.due, cleanup.deleted); S15d:44 (age 30, grace
// 7 by default).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { expectSafeToRunTwice } from '../../../test-harness/jobs/run-twice';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { getHandlers } from './handlers';
import { createJobsDbClient } from './db';
import { enqueueVersionCleanupWith, runVersionCleanupWith } from '../versions/cleanup';

type Row = { id: string; cleanup_shown_at: Date | null };

async function seed(
  tenant: string,
  project: string,
  createdAt: string,
  opts: { sent?: boolean; snapshot?: boolean; shownAt?: string } = {},
): Promise<string> {
  const sent = opts.sent ?? false;
  const snapshot = opts.snapshot ?? false;
  const [r] = await harnessSql()<{ id: string }[]>`
    insert into public.model_version
      (project_id, tenant_id, model_json, schema_version, created_at, is_snapshot, label, is_sent, version_no,
       sent_at, cleanup_shown_at)
    values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, ${createdAt}::timestamptz,
      ${snapshot}, ${snapshot ? 'Kept' : null}, ${sent}, ${sent ? 1 : null},
      ${sent ? createdAt : null}::timestamptz, ${opts.shownAt ?? null}::timestamptz)
    returning id`;
  return r.id;
}

const rows = (tenant: string) =>
  harnessSql()<Row[]>`
    select id, cleanup_shown_at from public.model_version where tenant_id = ${tenant}::uuid order by created_at, id`;

const events = (tenant: string, action: string) =>
  harnessSql()<{ object_id: string; details: { versionIds: string[]; count: number } }[]>`
    select object_id, details from public.event_log
    where tenant_id = ${tenant}::uuid and action = ${action} order by at, id`;

const notes = (tenant: string) =>
  harnessSql()<
    { user_id: string; project_id: string; kind: string; link: string; payload: unknown }[]
  >`
    select user_id, project_id, kind, link, payload from public.notification
    where tenant_id = ${tenant}::uuid order by user_id, project_id`;

// A day far from every other test's run times (J10). The sweep's enqueue is for every company, so its jobs are
// deleted before the shared queue lock is released (the unscoped sweep tests hold it exclusive).
const SLOT = '2031-01-05T08:00:00Z';

const run = (tenant: string, at: string, dryRun = false) =>
  runVersionCleanupWith(createJobsDbClient(), tenant, at, dryRun);

async function tenantWith(
  defaults: Record<string, number>,
): Promise<{ t: string; p: string; q: string }> {
  const t = await createTenant();
  const [p, q] = await createProjects(t, 2);
  await harnessSql()`update public.tenant set defaults = defaults || ${harnessSql().json(defaults)} where id = ${t}::uuid`;
  return { t, p, q };
}

describe('EZD-123 daily version cleanup (database)', () => {
  let release: (() => Promise<void>) | null = null;
  const tenants: string[] = [];

  beforeAll(async () => {
    release = await holdJobQueueShared();
  }, 60000);

  afterAll(async () => {
    if (tenants.length > 0)
      await harnessSql()`delete from public.job where tenant_id = any(${tenants}::uuid[])`;
    await harnessSql()`delete from public.job where kind = 'cleanup' and payload ->> 'at' = ${SLOT}`;
    await release?.();
    await cleanup();
    await closeHarness();
  });

  it('J1 @smoke 30 / 7: made Oct 1 09:00 is not due Oct 31 03:00, due Nov 1 03:00, deleted Nov 8 03:00 if ignored (AC-EZD-123-1, -3; 09p row 1)', async () => {
    const { t, p } = await tenantWith({});
    tenants.push(t);
    const v = await seed(t, p, '2026-10-01T09:00:00Z');

    expect(await run(t, '2026-10-31T03:00:00Z')).toEqual({ deleted: [], due: [] });
    expect((await rows(t))[0].cleanup_shown_at).toBeNull();

    expect(await run(t, '2026-11-01T03:00:00Z')).toEqual({ deleted: [], due: [v] });
    expect((await rows(t))[0].cleanup_shown_at?.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(await events(t, 'cleanup.due')).toEqual([
      { object_id: p, details: { versionIds: [v], count: 1 } },
    ]);

    expect(await run(t, '2026-11-07T03:00:00Z')).toEqual({ deleted: [], due: [] });
    expect(await rows(t)).toHaveLength(1);

    expect(await run(t, '2026-11-08T03:00:00Z')).toEqual({ deleted: [v], due: [] });
    expect(await rows(t)).toEqual([]);
    expect(await events(t, 'cleanup.deleted')).toEqual([
      { object_id: p, details: { versionIds: [v], count: 1, by: 'run' } },
    ]);
  });

  it('J2 0 / 7: a version made today is due at the next run and deleted 7 days after it (AC-EZD-123-1, -4; 09p row 2)', async () => {
    const { t, p } = await tenantWith({ version_cleanup_age: 0 });
    tenants.push(t);
    const v = await seed(t, p, '2026-11-10T10:00:00Z');
    expect(await run(t, '2026-11-11T08:00:00Z')).toEqual({ deleted: [], due: [v] });
    expect(await run(t, '2026-11-17T08:00:00Z')).toEqual({ deleted: [], due: [] });
    expect(await run(t, '2026-11-18T08:00:00Z')).toEqual({ deleted: [v], due: [] });
  });

  it('J3 30 / 0: never deleted in the run that stamps it; deleted at the next daily run (AC-EZD-123-1; Q-0708)', async () => {
    const { t, p } = await tenantWith({ version_cleanup_grace: 0 });
    tenants.push(t);
    const v = await seed(t, p, '2026-10-01T00:00:00Z');
    expect(await run(t, '2026-10-31T08:00:00Z')).toEqual({ deleted: [], due: [v] });
    expect(await rows(t)).toHaveLength(1);
    // The same run again (a retry): still not deleted.
    expect(await run(t, '2026-10-31T08:00:00Z')).toEqual({ deleted: [], due: [] });
    expect(await rows(t)).toHaveLength(1);
    expect(await run(t, '2026-11-01T08:00:00Z')).toEqual({ deleted: [v], due: [] });
    expect(await rows(t)).toEqual([]);
  });

  it('J4 two batches keep their own stamps: A due Nov 1, B due Nov 3; A goes Nov 8, B Nov 10 (09p row 6)', async () => {
    const { t, p } = await tenantWith({});
    tenants.push(t);
    const a = await seed(t, p, '2026-10-01T09:00:00Z');
    const b = await seed(t, p, '2026-10-03T09:00:00Z');
    expect((await run(t, '2026-11-01T08:00:00Z')).due).toEqual([a]);
    expect((await run(t, '2026-11-03T08:00:00Z')).due).toEqual([b]);
    const shown = await rows(t);
    expect(shown.map((r) => r.cleanup_shown_at?.toISOString())).toEqual([
      '2026-11-01T08:00:00.000Z',
      '2026-11-03T08:00:00.000Z',
    ]);
    expect((await run(t, '2026-11-08T08:00:00Z')).deleted).toEqual([a]);
    expect((await run(t, '2026-11-10T08:00:00Z')).deleted).toEqual([b]);
  });

  it('J5 never lists or deletes a sent, named or young row; the trigger refuses sent and named deletes (AC-EZD-123-7; 09p row 5)', async () => {
    const { t, p } = await tenantWith({});
    tenants.push(t);
    const sent = await seed(t, p, '2026-01-01T00:00:00Z', { sent: true });
    const named = await seed(t, p, '2026-01-01T00:00:00Z', { snapshot: true });
    // Even a sent or named row that carries an old stamp stays.
    const namedShown = await seed(t, p, '2026-01-02T00:00:00Z', {
      snapshot: true,
      shownAt: '2026-02-01T00:00:00Z',
    });
    const young = await seed(t, p, '2026-11-01T00:00:00Z');
    expect(await run(t, '2026-11-20T08:00:00Z', true)).toEqual({ deleted: [], due: [] });
    expect(await run(t, '2026-11-20T08:00:00Z')).toEqual({ deleted: [], due: [] });
    expect((await rows(t)).map((r) => r.id).sort()).toEqual(
      [sent, named, namedShown, young].sort(),
    );
    for (const id of [sent, named, namedShown]) {
      await expect(
        harnessSql()`delete from public.model_version where id = ${id}::uuid`,
      ).rejects.toMatchObject({ code: '55000' });
    }
  });

  it('J5b a shown row is kept while it is younger than age, also when age was raised after it was shown (AC-EZD-123-7)', async () => {
    const { t, p } = await tenantWith({});
    tenants.push(t);
    const v = await seed(t, p, '2026-10-01T00:00:00Z');
    expect((await run(t, '2026-11-01T08:00:00Z')).due).toEqual([v]);
    await harnessSql()`update public.tenant set defaults = defaults || '{"version_cleanup_age": 60}'::jsonb where id = ${t}::uuid`;
    expect(await run(t, '2026-11-09T08:00:00Z')).toEqual({ deleted: [], due: [] });
    expect((await rows(t)).map((r) => r.id)).toEqual([v]);
    // Once it is 60 days old it goes at the next run.
    expect((await run(t, '2026-11-30T08:00:00Z')).deleted).toEqual([v]);
  });

  it('J6 dryRun lists what it would delete and stamp and writes nothing; the real run then does exactly that (AC-EZD-123-8)', async () => {
    const { t, p } = await tenantWith({});
    tenants.push(t);
    const old = await seed(t, p, '2026-09-01T00:00:00Z', { shownAt: '2026-10-01T08:00:00Z' });
    const due = await seed(t, p, '2026-10-01T00:00:00Z');
    const before = await rows(t);
    const dry = await run(t, '2026-11-02T08:00:00Z', true);
    expect(dry).toEqual({ deleted: [old], due: [due] });
    expect(await rows(t)).toEqual(before);
    expect(await events(t, 'cleanup.due')).toEqual([]);
    expect(await notes(t)).toEqual([]);
    const real = await run(t, '2026-11-02T08:00:00Z');
    expect(real).toEqual(dry);
    expect((await rows(t)).map((r) => r.id)).toEqual([due]);
  });

  it('J7 cleanup_due goes in the app and by email to each active member with Edit model whose scope includes the project, once per project per run (AC-EZD-123-3)', async () => {
    const { t, p, q } = await tenantWith({});
    tenants.push(t);
    const all: Member = await createMember({ tenantId: t, scope: 'all' });
    const listedIn = await createMember({ tenantId: t, scope: 'listed', listed: [p] });
    const listedOut = await createMember({ tenantId: t, scope: 'listed', listed: [q] });
    const viewer = await createMember({ tenantId: t, scope: 'all' });
    const gone = await createMember({ tenantId: t, scope: 'all', status: 'deactivated' });
    for (const m of [all, listedIn, listedOut, gone])
      await setPermissions(t, m.membershipId, ['view_projects', 'edit_model']);
    await setPermissions(t, viewer.membershipId, ['view_projects']);
    // Two due rows in p, none in q.
    await seed(t, p, '2026-10-01T00:00:00Z');
    await seed(t, p, '2026-10-02T00:00:00Z');
    await seed(t, q, '2026-11-15T00:00:00Z');

    await run(t, '2026-11-05T08:00:00Z');
    const got = await notes(t);
    expect(got).toEqual(
      [all.appUserId, listedIn.appUserId].sort().map((u) => ({
        user_id: u,
        project_id: p,
        kind: 'cleanup_due',
        link: `/projects/${p}`,
        payload: {},
      })),
    );
    const emails = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.job
      where tenant_id = ${t}::uuid and kind = 'notification_email'`;
    expect(emails[0].n).toBe(2);

    // The next run stamps nothing new: no second notice.
    await run(t, '2026-11-06T08:00:00Z');
    expect(await notes(t)).toHaveLength(2);
  });

  it('J8 a run for one company never stamps, deletes or notifies in another (rule 4)', async () => {
    const one = await tenantWith({});
    const two = await tenantWith({});
    tenants.push(one.t, two.t);
    await seed(one.t, one.p, '2026-10-01T00:00:00Z');
    const theirs = await seed(two.t, two.p, '2026-10-01T00:00:00Z', {
      shownAt: '2026-10-05T00:00:00Z',
    });
    const r = await run(one.t, '2026-11-20T08:00:00Z');
    expect(r.due).toHaveLength(1);
    expect(r.deleted).toEqual([]);
    expect(await rows(two.t)).toEqual([
      { id: theirs, cleanup_shown_at: new Date('2026-10-05T00:00:00Z') },
    ]);
    expect(await events(two.t, 'cleanup.due')).toEqual([]);
  });

  it('J9 the cleanup job handler is safe to run twice and checks its payload (AC-EZD-123-8)', async () => {
    const { t, p } = await tenantWith({});
    tenants.push(t);
    const old = await seed(t, p, '2026-09-01T00:00:00Z', { shownAt: '2026-10-01T08:00:00Z' });
    const due = await seed(t, p, '2026-10-01T00:00:00Z');
    const at = '2026-11-02T08:00:00Z';
    await expectSafeToRunTwice('cleanup', {
      payload: { at, dryRun: true },
      job: { tenant_id: t, project_id: null },
    });
    expect((await rows(t)).map((r) => r.id).sort()).toEqual([old, due].sort());
    await expectSafeToRunTwice('cleanup', {
      payload: { at },
      job: { tenant_id: t, project_id: null },
    });
    expect((await rows(t)).map((r) => r.id)).toEqual([due]);
    const h = getHandlers().cleanup;
    expect(h?.payload.safeParse({}).success).toBe(false);
    expect(h?.payload.safeParse({ at: 'soon' }).success).toBe(false);
    expect(h?.payload.safeParse({ at, dryRun: true }).success).toBe(true);
  });

  it('J10 the sweep queues one cleanup job per company with working rows, from 08:00 UTC, once a day (AC-EZD-123-3)', async () => {
    const t = await createTenant();
    const [p] = await createProjects(t, 1);
    await seed(t, p, '2026-10-01T00:00:00Z');
    const quiet = await createTenant();
    tenants.push(t, quiet);
    const db = createJobsDbClient();
    const jobs = () =>
      harnessSql()<{ tenant_id: string; payload: unknown; project_id: string | null }[]>`
        select tenant_id, payload, project_id from public.job
        where kind = 'cleanup' and payload ->> 'at' = ${SLOT} and tenant_id = any(${[t, quiet]}::uuid[])`;

    expect(await enqueueVersionCleanupWith(db, new Date('2031-01-05T07:59:00Z'))).toBe(0);
    expect(await jobs()).toEqual([]);
    expect(await enqueueVersionCleanupWith(db, new Date('2031-01-05T08:00:30Z'))).toBeGreaterThan(
      0,
    );
    expect(await jobs()).toEqual([{ tenant_id: t, payload: { at: SLOT }, project_id: null }]);
    expect(await enqueueVersionCleanupWith(db, new Date('2031-01-05T20:00:00Z'))).toBe(0);
    expect(await jobs()).toHaveLength(1);
    // Never callable by a signed-in member's role.
    const grants = await harnessSql()<{ a: boolean; b: boolean }[]>`
      select has_function_privilege('authenticated', 'public.enqueue_version_cleanup(timestamptz)', 'execute') as a,
        has_function_privilege('authenticated', 'public.run_version_cleanup(uuid, timestamptz, boolean)', 'execute') as b`;
    expect(grants[0]).toEqual({ a: false, b: false });
  });
});
