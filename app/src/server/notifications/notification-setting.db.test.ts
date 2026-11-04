// EZD-140 T2-T6 (vault/plans/EZD-140.md sections 1 M1-M3, D3-D6, 3 and 4; AC-EZD-140-2, -3, -4). Local stack.
// Rows are inserted with harnessSql() (the plan's "adminSql()" is that helper in app/test-harness/rls/fixtures.ts);
// a jsonb value bound through it is written ${JSON.stringify(v)}::text::jsonb (EZD-110a repair 63e888be).
// Sessions come from signIn() (.serverDb sends the gate header, .browserDb does not). The file inserts jobs, so
// it holds the shared job-queue lock, passes onlyTenantId to runJobs, and deletes its jobs before releasing it.
// Expected values: the plan's Tests table and its sources (M2 errors, D3 reads, D4, D5, EZD-110 T9 subject).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { NOTIFICATION_KINDS } from '../../lib/notifications/kinds';
import { clearStubOutbox, readStubOutbox } from '../email/test-harness/stub-transport';
import { runJobs } from '../jobs/runner';
import { listNotifications } from './notifications';

type ListDb = Parameters<typeof listNotifications>[0];

type Item = { kind: string; in_app: boolean; email: boolean };
const nine = (over: Partial<Record<string, Partial<Item>>> = {}): Item[] =>
  NOTIFICATION_KINDS.map((kind) => ({ kind, in_app: true, email: true, ...over[kind] }));

type Fresh = { tenant: string; a: Member; b: Member; aS: Session; bS: Session };

describe('EZD-140 notification settings', () => {
  let release: () => Promise<void>;
  const tenants: string[] = [];

  beforeAll(async () => {
    release = await holdJobQueueShared();
  }, 180000);

  afterAll(async () => {
    try {
      for (const t of tenants)
        await harnessSql()`delete from public.job where tenant_id = ${t}::uuid`;
      await cleanup();
      await closeHarness();
    } finally {
      await release();
    }
  }, 180000);

  const fresh = async (): Promise<Fresh> => {
    const tenant = await createTenant();
    tenants.push(tenant);
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    return { tenant, a, b, aS: await signIn(a.email), bS: await signIn(b.email) };
  };

  const setSetting = (tenant: string, user: string, kind: string, inApp: boolean, email: boolean) =>
    harnessSql()`
      insert into public.notification_setting (tenant_id, user_id, kind, in_app, email)
      values (${tenant}::uuid, ${user}::uuid, ${kind}, ${inApp}, ${email})`;

  const create = async (
    tenant: string,
    user: string,
    kind: string,
    payload: unknown = {},
  ): Promise<string> =>
    (
      await harnessSql()<{ id: string }[]>`
        select private.create_notification(${tenant}::uuid, ${user}::uuid, ${kind}, null,
          ${JSON.stringify(payload)}::text::jsonb, '/') as id`
    )[0].id;

  const jobsFor = async (id: string) =>
    harnessSql()<{ id: string; status: string; result: unknown }[]>`
      select id, status, result from public.job
      where kind = 'notification_email' and payload ->> 'notificationId' = ${id}`;

  const broadcastsFor = async (user: string, id: string) =>
    (
      await harnessSql()<{ n: number }[]>`
        select count(*)::int as n from realtime.messages
        where topic = ${'user:' + user} and event = 'notification.created'
          and payload ->> 'notificationId' = ${id}`
    )[0].n;

  describeTenantIsolation('notification_setting', {
    makeRow: (t, c) => ({
      tenant_id: t,
      user_id: c.member.appUserId,
      kind: 'render_finished',
      in_app: false,
      email: true,
    }),
  });

  it('EZD-140 T3 save_my_notification_settings: 9 rows, idempotent, own rows only, no direct insert, 22023 and the gate', async () => {
    const f = await fresh();
    const items = nine({ render_finished: { email: false } });

    const first = await f.aS.serverDb.rpc('save_my_notification_settings', { p_settings: items });
    expect(first.error).toBeNull();
    const rows = await harnessSql()<
      { kind: string; in_app: boolean; email: boolean; updated_at: Date }[]
    >`
      select kind, in_app, email, updated_at from public.notification_setting
      where tenant_id = ${f.tenant}::uuid and user_id = ${f.a.appUserId}::uuid`;
    expect(rows).toHaveLength(9);
    expect(rows.find((r) => r.kind === 'render_finished')).toMatchObject({
      in_app: true,
      email: false,
    });
    const stamp = (r: { updated_at: Date }) => r.updated_at.toISOString();
    const before = new Map(rows.map((r) => [r.kind, stamp(r)]));

    const second = await f.aS.serverDb.rpc('save_my_notification_settings', { p_settings: items });
    expect(second.error).toBeNull();
    const after = await harnessSql()<{ kind: string; updated_at: Date }[]>`
      select kind, updated_at from public.notification_setting
      where tenant_id = ${f.tenant}::uuid and user_id = ${f.a.appUserId}::uuid`;
    expect(after).toHaveLength(9);
    for (const r of after) expect(stamp(r)).toBe(before.get(r.kind));

    // B reads its own rows only: none, and A's rows are invisible.
    const bRead = await f.bS.serverDb.from('notification_setting').select('kind');
    expect(bRead.error).toBeNull();
    expect(bRead.data).toHaveLength(0);
    const aRead = await f.aS.serverDb.from('notification_setting').select('kind, in_app, email');
    expect(aRead.error).toBeNull();
    expect(aRead.data).toHaveLength(9);

    // No direct write: authenticated has select only.
    const direct = await f.aS.serverDb.from('notification_setting').insert({
      tenant_id: f.tenant,
      user_id: f.a.appUserId,
      kind: 'cleanup_due',
      in_app: false,
      email: false,
    });
    expect(direct.error?.code).toBe('42501');

    // Not nine items.
    const eight = await f.aS.serverDb.rpc('save_my_notification_settings', {
      p_settings: items.slice(0, 8),
    });
    expect(eight.error?.code).toBe('22023');

    // No gate header.
    const noGate = await f.aS.browserDb.rpc('save_my_notification_settings', { p_settings: items });
    expect(noGate.error?.code).toBe('42501');
  }, 120000);

  it('EZD-140 T4 create_notification: in_app and the email job follow the saved setting; the broadcast follows in_app', async () => {
    const f = await fresh();
    const u = f.a.appUserId;
    await setSetting(f.tenant, u, 'render_finished', true, false);
    await setSetting(f.tenant, u, 'edit_request', false, true);
    await setSetting(f.tenant, u, 'cleanup_due', false, false);

    const ids = {
      render_finished: await create(f.tenant, u, 'render_finished'),
      edit_request: await create(f.tenant, u, 'edit_request', { name: 'Mia' }),
      cleanup_due: await create(f.tenant, u, 'cleanup_due'),
      field_conflict: await create(f.tenant, u, 'field_conflict'),
    };
    const order = ['render_finished', 'edit_request', 'cleanup_due', 'field_conflict'] as const;

    const stored = await harnessSql()<{ id: string; in_app: boolean }[]>`
      select id, in_app from public.notification where user_id = ${u}::uuid`;
    expect(order.map((k) => stored.find((r) => r.id === ids[k])?.in_app)).toEqual([
      true,
      false,
      false,
      true,
    ]);

    const jobs: number[] = [];
    for (const k of order) jobs.push((await jobsFor(ids[k])).length);
    expect(jobs).toEqual([0, 1, 0, 1]);

    const casts: number[] = [];
    for (const k of order) casts.push(await broadcastsFor(u, ids[k]));
    expect(casts).toEqual([1, 0, 0, 1]);
  }, 120000);

  it('EZD-140 T5 in-app off is hidden from list, open, mark-all and a plain select', async () => {
    const f = await fresh();
    const u = f.a.appUserId;
    const sql = harnessSql();
    const [shown] = await sql<{ id: string }[]>`
      insert into public.notification (tenant_id, user_id, kind, payload, link, in_app)
      values (${f.tenant}::uuid, ${u}::uuid, 'field_conflict', '{}'::jsonb, '/', true) returning id`;
    const [hidden] = await sql<{ id: string }[]>`
      insert into public.notification (tenant_id, user_id, kind, payload, link, in_app)
      values (${f.tenant}::uuid, ${u}::uuid, 'edit_request', '{"name":"Mia"}'::jsonb, '/', false) returning id`;

    const page = await listNotifications(f.aS.serverDb as unknown as ListDb, null);
    expect(page.items.map((i) => i.id)).toEqual([shown.id]);
    expect(page.items[0].kind).toBe('field_conflict');
    expect(page.unreadCount).toBe(1);
    expect(page.hasMore).toBe(false);

    const opened = await f.aS.serverDb.rpc('open_notification', { p_id: hidden.id });
    expect(opened.error).toBeNull();
    expect(opened.data).toHaveLength(0);

    const all = await f.aS.serverDb.rpc('mark_all_notifications_read');
    expect(all.error).toBeNull();
    expect(all.data).toBe(1);

    const direct = await f.aS.serverDb.from('notification').select('id');
    expect(direct.error).toBeNull();
    expect(direct.data).toHaveLength(1);

    const [row] = await sql<{ read_at: Date | null }[]>`
      select read_at from public.notification where id = ${hidden.id}::uuid`;
    expect(row.read_at).toBeNull();
  }, 120000);

  it('EZD-140 T6 an email turned off while its job waits: the job is done with emailed false and nothing is sent; another user still gets the email', async () => {
    const f = await fresh();
    clearStubOutbox();
    const idA = await create(f.tenant, f.a.appUserId, 'render_finished');
    expect(await jobsFor(idA)).toHaveLength(1);
    const idB = await create(f.tenant, f.b.appUserId, 'render_finished');

    const saved = await f.aS.serverDb.rpc('save_my_notification_settings', {
      p_settings: nine({ render_finished: { email: false } }),
    });
    expect(saved.error).toBeNull();

    await runJobs({ onlyTenantId: f.tenant });

    const [jobA] = await jobsFor(idA);
    expect(jobA.status).toBe('done');
    expect(jobA.result).toEqual({ emailed: false });
    const [{ emailed_at: emailedA }] = await harnessSql()<{ emailed_at: Date | null }[]>`
      select emailed_at from public.notification where id = ${idA}::uuid`;
    expect(emailedA).toBeNull();
    expect(readStubOutbox().filter((m) => m.to === f.a.email)).toHaveLength(0);

    const [jobB] = await jobsFor(idB);
    expect(jobB.status).toBe('done');
    const toB = readStubOutbox().filter((m) => m.to === f.b.email);
    expect(toB).toHaveLength(1);
    expect(toB[0].subject).toBe('Photoreal render finished');
  }, 120000);
});
