// EZD-110a T1-T8 (vault/plans/EZD-110a.md sections 1 M2/M3, 3, 4; AC-EZD-110-5, -6, -8). Local stack. Rows are
// inserted with harnessSql(); sessions come from signIn().serverDb (gate header sent) and .browserDb (no
// header). The file inserts jobs (create_notification queues one), so it holds the shared job-queue lock
// and deletes its jobs before releasing it. Expected values: the plan's Tests table and its sources
// (M2 constraints, M3 functions, Decided D1, D2, D4, D13, Q-0425 page size 20).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { GATED_RPC_CALLS } from '../../../test-harness/rls/gate';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  closeAllRealtime,
  connectRealtime,
  eventsNamed,
  sleep,
} from '../../../test-harness/realtime/node-client';
import { ensureStream, fencedStep } from '../../../test-harness/realtime/stream';
import {
  adminDb,
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
import { DEV_SAMPLE_PARAMS } from '../../app/dev/notifications/NotificationsProbe';
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_PAGE_SIZE,
  type NotificationKind,
  type NotificationParams,
} from '../../lib/notifications/kinds';
import {
  listNotifications,
  markAllNotificationsRead,
  openNotification,
  sendTestNotification,
} from './notifications';

type Db = Parameters<typeof listNotifications>[0];
const dbOf = (s: Session) => s.serverDb as unknown as Db;

async function codeOf(work: PromiseLike<unknown>): Promise<string | null> {
  try {
    await work;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no_code';
  }
}

const VALID_PARAMS: Record<NotificationKind, NotificationParams> = {
  client_response: { action: 'approved', version: 'V2' },
  field_conflict: {},
  field_measurements_received: {},
  render_finished: {},
  edit_request: { name: 'Pat' },
  sync_conflict: {},
  cleanup_due: {},
  render_allowance_refilled: {},
  field_pack_issued: {},
};

const insertRow = (
  tenant: string,
  user: string,
  kind: string,
  payload: unknown,
  link: string,
  opts: { projectId?: string | null; createdAt?: Date; readAt?: Date | null } = {},
) =>
  harnessSql()<{ id: string }[]>`
    insert into public.notification (tenant_id, user_id, kind, payload, link, project_id, created_at, read_at)
    values (${tenant}::uuid, ${user}::uuid, ${kind}, ${JSON.stringify(payload)}::text::jsonb, ${link},
      ${opts.projectId ?? null}, ${(opts.createdAt ?? new Date()).toISOString()}::timestamptz,
      ${opts.readAt ? opts.readAt.toISOString() : null})
    returning id`;

const create = (
  tenant: string,
  user: string,
  kind: string,
  project: string | null,
  payload: unknown = {},
  link = '/',
) =>
  harnessSql()<{ id: string | null }[]>`
    select private.create_notification(${tenant}::uuid, ${user}::uuid, ${kind}, ${project}::uuid,
      ${JSON.stringify(payload)}::text::jsonb, ${link}) as id`;

type Fresh = { tenant: string; m: Member; k: Member; mS: Session; kS: Session; project: string };
async function fresh(): Promise<Fresh> {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  const k = await createMember({ tenantId: tenant, scope: 'all' });
  return { tenant, project, m, k, mS: await signIn(m.email), kS: await signIn(k.email) };
}

describe('EZD-110a notification table and functions', () => {
  let release: () => Promise<void>;
  const tenants: string[] = [];

  beforeAll(async () => {
    release = await holdJobQueueShared();
  }, 180000);

  afterAll(async () => {
    try {
      await closeAllRealtime();
      for (const t of tenants)
        await harnessSql()`delete from public.job where tenant_id = ${t}::uuid`;
      await cleanup();
      await closeHarness();
    } finally {
      await release();
    }
  }, 180000);

  const track = async (): Promise<Fresh> => {
    const f = await fresh();
    tenants.push(f.tenant);
    return f;
  };

  describeTenantIsolation('notification', {
    makeRow: (t, ctx) => ({
      tenant_id: t,
      user_id: ctx.member.appUserId,
      kind: 'render_finished',
      link: '/',
    }),
  });

  it('EZD-110a T1 the checks accept valid rows and refuse the rest with 23514; the kind list is the contract', async () => {
    const f = await track();
    const u = f.m.appUserId;
    for (const kind of NOTIFICATION_KINDS)
      expect(await codeOf(insertRow(f.tenant, u, kind, VALID_PARAMS[kind], '/')), kind).toBeNull();
    for (const link of ['/', '/a?b=1'])
      expect(await codeOf(insertRow(f.tenant, u, 'render_finished', {}, link)), link).toBeNull();

    const refusedLinks = ['//x.com', '/\\x', 'x', '/a b', '/a\nb', '/' + 'a'.repeat(2048)];
    for (const link of refusedLinks)
      expect(
        await codeOf(insertRow(f.tenant, u, 'render_finished', {}, link)),
        JSON.stringify(link.slice(0, 12)),
      ).toBe('23514');
    expect(await codeOf(insertRow(f.tenant, u, 'edit_request', {}, '/'))).toBe('23514');
    expect(
      await codeOf(insertRow(f.tenant, u, 'client_response', { action: 'x', version: 'V' }, '/')),
    ).toBe('23514');
    expect(await codeOf(insertRow(f.tenant, u, 'test', {}, '/'))).toBe('23514');

    const defs = await harnessSql()<{ def: string }[]>`
      select pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      where c.conrelid = 'public.notification'::regclass and c.contype = 'c'`;
    const kindDef = defs.map((d) => d.def).find((d) => /kind = ANY \(ARRAY\[/.test(d));
    expect(kindDef).toBeDefined();
    const inList = /kind = ANY \(ARRAY\[([^\]]*)\]/.exec(kindDef ?? '')?.[1] ?? '';
    const values = [...inList.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(values).toEqual([...NOTIFICATION_KINDS].sort());
  }, 90000);

  it('EZD-110a T2 create_notification inserts the row and one notification_email job, or returns null', async () => {
    const f = await track();
    const sql = harnessSql();
    const listedOut = await createMember({ tenantId: f.tenant, scope: 'listed', listed: [] });
    const listedIn = await createMember({
      tenantId: f.tenant,
      scope: 'listed',
      listed: [f.project],
    });
    const gone = await createMember({ tenantId: f.tenant, scope: 'all', status: 'deactivated' });
    const otherTenant = await createTenant();
    const [otherProject] = await createProjects(otherTenant, 1);

    const [{ id }] = await create(f.tenant, f.m.appUserId, 'render_finished', null);
    expect(id).toEqual(expect.any(String));
    const rows =
      await sql`select id, user_id, kind, link from public.notification where id = ${id}::uuid`;
    expect(rows).toHaveLength(1);
    const jobs = await sql`
      select kind, status, max_attempts, project_id, payload, tenant_id
      from public.job where kind = 'notification_email' and payload ->> 'notificationId' = ${id}`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      kind: 'notification_email',
      status: 'queued',
      max_attempts: 5,
      project_id: null,
      payload: { notificationId: id },
      tenant_id: f.tenant,
    });

    const count = async () =>
      (
        await sql<{ n: number }[]>`
          select (select count(*) from public.notification where tenant_id = ${f.tenant}::uuid)::int
            + (select count(*) from public.job where tenant_id = ${f.tenant}::uuid)::int as n`
      )[0].n;
    const before = await count();
    const refusals = [
      await create(f.tenant, gone.appUserId, 'render_finished', null),
      await create(f.tenant, f.m.appUserId, 'render_finished', otherProject),
      await create(f.tenant, listedOut.appUserId, 'render_finished', f.project),
    ];
    for (const [r] of refusals) expect(r.id).toBeNull();
    expect(await count()).toBe(before);

    const [{ id: listedId }] = await create(
      f.tenant,
      listedIn.appUserId,
      'render_finished',
      f.project,
    );
    expect(listedId).toEqual(expect.any(String));
    expect(await sql`select id from public.notification where id = ${listedId}::uuid`).toHaveLength(
      1,
    );
  }, 120000);

  it('EZD-110a T3 the user channel gets notification.created and notification.read with ids only', async () => {
    const f = await track();
    const rt = await connectRealtime(f.mS.accessToken);
    const rtK = await connectRealtime(f.kS.accessToken);
    const own = rt.join(`user:${f.m.appUserId}`);
    const other = rtK.join(`user:${f.k.appUserId}`);
    expect(await own.joined).toBe('SUBSCRIBED');
    expect(await other.joined).toBe('SUBSCRIBED');
    const sql = harnessSql();
    const ctx = { sql, channel: own, accessToken: f.mS.accessToken };
    const notif = (w: { event: string; payload: unknown }[]) =>
      w.filter((e) => e.event.startsWith('notification.'));
    let n1 = '';
    let n2 = '';

    const s1 = await fencedStep({
      ...ctx,
      event: 'notification.created',
      run: async () => {
        n1 = (await create(f.tenant, f.m.appUserId, 'render_finished', null))[0].id as string;
      },
    });
    expect(notif(s1.window)).toEqual([
      { event: 'notification.created', payload: { notificationId: n1 } },
    ]);

    const s2 = await fencedStep({
      ...ctx,
      event: 'notification.read',
      restore: () => sql`update public.notification set read_at = null where id = ${n1}::uuid`,
      run: async () => {
        const opened = await f.mS.serverDb.rpc('open_notification', { p_id: n1 });
        expect(opened.error).toBeNull();
      },
    });
    expect(notif(s2.window)).toEqual([
      { event: 'notification.read', payload: { notificationId: n1 } },
    ]);

    const s3 = await fencedStep({
      ...ctx,
      event: 'notification.created',
      run: async () => {
        n2 = (await create(f.tenant, f.m.appUserId, 'cleanup_due', null))[0].id as string;
      },
    });
    expect(notif(s3.window)).toEqual([
      { event: 'notification.created', payload: { notificationId: n2 } },
    ]);

    const s4 = await fencedStep({
      ...ctx,
      event: 'notification.read',
      restore: () => sql`update public.notification set read_at = null where id = ${n2}::uuid`,
      run: async () => {
        const all = await f.mS.serverDb.rpc('mark_all_notifications_read');
        expect(all.error).toBeNull();
      },
    });
    expect(notif(s4.window)).toEqual([
      { event: 'notification.read', payload: { notificationId: null } },
    ]);

    await ensureStream({ sql, channel: other, accessToken: f.kS.accessToken });
    expect(eventsNamed(other, 'notification.created')).toHaveLength(0);
    expect(eventsNamed(other, 'notification.read')).toHaveLength(0);
  }, 120000);

  it('EZD-297 control: a notification that is not sent on the channel fails the N1 check', async () => {
    const f = await track();
    const rt = await connectRealtime(f.mS.accessToken);
    const own = rt.join(`user:${f.m.appUserId}`);
    expect(await own.joined).toBe('SUBSCRIBED');
    let otherId = '';
    const { window } = await fencedStep({
      sql: harnessSql(),
      channel: own,
      accessToken: f.mS.accessToken,
      event: 'notification.created',
      run: async () => {
        otherId = (await create(f.tenant, f.k.appUserId, 'render_finished', null))[0].id as string;
      },
    });
    const notif = window.filter((e) => e.event.startsWith('notification.'));
    expect(notif).toEqual([]);
    expect(() =>
      expect(notif).toEqual([
        { event: 'notification.created', payload: { notificationId: otherId } },
      ]),
    ).toThrow();
  }, 60000);

  it('EZD-110a T4 a member reads only their own rows; a listed member misses unlisted projects; no gate is refused', async () => {
    const f = await track();
    const sql = harnessSql();
    const otherTenant = await createTenant();
    const b = await createMember({ tenantId: otherTenant, scope: 'all' });
    const l = await createMember({ tenantId: f.tenant, scope: 'listed', listed: [] });
    const lS = await signIn(l.email);

    const [{ id: mRow }] = await insertRow(f.tenant, f.m.appUserId, 'render_finished', {}, '/');
    const [{ id: kRow }] = await insertRow(f.tenant, f.k.appUserId, 'render_finished', {}, '/');
    const [{ id: bRow }] = await insertRow(otherTenant, b.appUserId, 'render_finished', {}, '/');
    const [{ id: lOpen }] = await insertRow(f.tenant, l.appUserId, 'render_finished', {}, '/');
    const [{ id: lHidden }] = await insertRow(f.tenant, l.appUserId, 'render_finished', {}, '/', {
      projectId: f.project,
    });
    expect(await sql`select id from public.notification where id = ${lHidden}::uuid`).toHaveLength(
      1,
    );

    const ids = async (s: Session) => {
      const r = await s.serverDb.from('notification').select('id');
      expect(r.error).toBeNull();
      return (r.data ?? []).map((x: { id: string }) => x.id).sort();
    };
    expect(await ids(f.mS)).toEqual([mRow]);
    expect(await ids(f.kS)).toEqual([kRow]);
    expect(await ids(f.kS)).not.toContain(bRow);
    const bS = await signIn(b.email);
    const bIds = await ids(bS);
    expect(bIds).toEqual([bRow]);
    expect(bIds).not.toContain(mRow);
    expect(bIds).not.toContain(kRow);
    expect(await ids(lS)).toEqual([lOpen]);

    const noGate = await f.mS.browserDb.from('notification').select('id');
    expect(noGate.error?.code).toBe('42501');
  }, 120000);

  it('EZD-110a T5 the list pages 20, 20, 5 newest first with names, the unread count and a deleted project', async () => {
    const f = await track();
    const sql = harnessSql();
    const [kitchen, doomed] = await createProjects(f.tenant, 2);
    const [{ id: customer }] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${f.tenant}::uuid, 'Client A', ${`t5-${randomUUID()}@example.test`}) returning id`;
    await sql`update public.project set name = 'Kitchen remodel', customer_id = ${customer}::uuid where id = ${kitchen}::uuid`;

    const base = Date.now() - 120_000;
    const order: string[] = [];
    for (let i = 0; i < 45; i++) {
      const projectId = i === 3 ? kitchen : i === 4 ? doomed : null;
      const [{ id }] = await insertRow(f.tenant, f.m.appUserId, 'render_finished', {}, '/', {
        projectId,
        createdAt: new Date(base - i * 1000),
      });
      order.push(id);
    }
    await sql`delete from public.project where id = ${doomed}::uuid`;

    const p1 = await listNotifications(dbOf(f.mS), null);
    const last1 = p1.items[p1.items.length - 1];
    const p2 = await listNotifications(dbOf(f.mS), { createdAt: last1.createdAt, id: last1.id });
    const last2 = p2.items[p2.items.length - 1];
    const p3 = await listNotifications(dbOf(f.mS), { createdAt: last2.createdAt, id: last2.id });

    expect(NOTIFICATION_PAGE_SIZE).toBe(20);
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([20, 20, 5]);
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false]);
    expect([...p1.items, ...p2.items, ...p3.items].map((x) => x.id)).toEqual(order);
    expect([p1.unreadCount, p2.unreadCount, p3.unreadCount]).toEqual([45, 45, 45]);
    expect(Object.keys(p1.items[0]).sort()).toEqual([
      'clientName',
      'createdAt',
      'id',
      'kind',
      'link',
      'params',
      'projectId',
      'projectName',
      'readAt',
    ]);
    const withProject = p1.items.find((x) => x.id === order[3]);
    expect(withProject?.projectName).toBe('Kitchen remodel');
    expect(withProject?.clientName).toBe('Client A');
    expect(withProject?.projectId).toBe(kitchen);
    const withGone = p1.items.find((x) => x.id === order[4]);
    expect(withGone?.projectName).toBeNull();
    expect(withGone?.projectId).toBe(doomed);
  }, 120000);

  it('EZD-110a T6 open returns the link and project state, marks read once, and never touches another user', async () => {
    const f = await track();
    const sql = harnessSql();
    const [gonedProject] = await createProjects(f.tenant, 1);
    const [{ id: none }] = await insertRow(f.tenant, f.m.appUserId, 'render_finished', {}, '/');
    const [{ id: visible }] = await insertRow(f.tenant, f.m.appUserId, 'render_finished', {}, '/', {
      projectId: f.project,
    });
    const [{ id: gone }] = await insertRow(f.tenant, f.m.appUserId, 'render_finished', {}, '/', {
      projectId: gonedProject,
    });
    const [{ id: others }] = await insertRow(f.tenant, f.k.appUserId, 'render_finished', {}, '/');
    await sql`delete from public.project where id = ${gonedProject}::uuid`;
    const readAt = async (id: string) =>
      (
        await sql<
          { read_at: Date | null }[]
        >`select read_at from public.notification where id = ${id}::uuid`
      )[0].read_at;

    expect(await openNotification(dbOf(f.mS), none)).toEqual({
      link: '/',
      projectId: null,
      projectState: 'none',
    });
    expect(await openNotification(dbOf(f.mS), visible)).toEqual({
      link: '/',
      projectId: f.project,
      projectState: 'visible',
    });
    expect(await openNotification(dbOf(f.mS), gone)).toEqual({
      link: '/',
      projectId: gonedProject,
      projectState: 'gone',
    });
    expect(await openNotification(dbOf(f.mS), others)).toBeNull();
    expect(await readAt(others)).toBeNull();

    const first = await readAt(none);
    expect(first).not.toBeNull();
    await sleep(1100);
    await openNotification(dbOf(f.mS), none);
    expect((await readAt(none))?.getTime()).toBe(first?.getTime());
  }, 120000);

  it('EZD-110a T7 mark all read marks only the caller own unread rows and is 0 the second time', async () => {
    const f = await track();
    const sql = harnessSql();
    for (let i = 0; i < 3; i++)
      await insertRow(f.tenant, f.m.appUserId, 'render_finished', {}, '/');
    for (let i = 0; i < 2; i++)
      await insertRow(f.tenant, f.k.appUserId, 'render_finished', {}, '/');
    expect(await markAllNotificationsRead(dbOf(f.mS))).toBe(3);
    expect(await markAllNotificationsRead(dbOf(f.mS))).toBe(0);
    const unreadOf = async (u: string) =>
      (
        await sql<{ n: number }[]>`
          select count(*)::int as n from public.notification where user_id = ${u}::uuid and read_at is null`
      )[0].n;
    expect(await unreadOf(f.k.appUserId)).toBe(2);
    expect(await unreadOf(f.m.appUserId)).toBe(0);
  }, 120000);

  it('EZD-110a T8 send_test_notification sends the nine kinds to the caller and refuses an unlisted project or an unknown membership (EZD-323)', async () => {
    const f = await track();
    const sql = harnessSql();
    const admin = adminDb() as unknown as Db;
    const ids: string[] = [];
    for (const kind of NOTIFICATION_KINDS)
      ids.push(
        await sendTestNotification(admin, {
          membershipId: f.m.membershipId,
          kind,
          projectId: null,
          params: DEV_SAMPLE_PARAMS[kind],
        }),
      );
    expect(new Set(ids).size).toBe(9);
    const rows = await sql<{ user_id: string; link: string; kind: string }[]>`
      select user_id, link, kind from public.notification where id = any (${ids}::uuid[])`;
    expect(rows).toHaveLength(9);
    for (const r of rows) {
      expect(r.user_id).toBe(f.m.appUserId);
      expect(r.link).toBe('/');
    }
    expect(rows.map((r) => r.kind).sort()).toEqual([...NOTIFICATION_KINDS].sort());

    const l = await createMember({ tenantId: f.tenant, scope: 'listed', listed: [] });
    const err = await codeOf(
      sendTestNotification(admin, {
        membershipId: l.membershipId,
        kind: 'render_finished',
        projectId: f.project,
        params: {},
      }),
    );
    expect(err).toBe('42501');

    const unknown = await codeOf(
      sendTestNotification(admin, {
        membershipId: randomUUID(),
        kind: 'render_finished',
        projectId: null,
        params: {},
      }),
    );
    expect(unknown).toBe('42501');

    const listed = GATED_RPC_CALLS.map((c) => c.fn);
    for (const fn of ['list_notifications', 'open_notification', 'mark_all_notifications_read'])
      expect(listed).toContain(fn);
    expect(listed).not.toContain('send_test_notification');
  }, 120000);
});
