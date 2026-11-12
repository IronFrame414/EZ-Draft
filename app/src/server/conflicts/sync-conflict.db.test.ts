// EZD-299a T1-T5 and T20 (vault/plans/EZD-299a.md section 1 S1/S2 and Decided D-Table, D-Read, D-Saved by,
// D-Resolves, D-Cap; section 4; AC-EZD-299-11). Calls go through the gated serverDb of `signIn`, as a route
// does. Expected values: the plan's Tests table rows (Q-0531, Q-0540, Q-0632 (a), S2).
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createAppUser,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';

const EDITOR = ['view_projects', 'edit_model'] as const;

type Item = {
  id: string;
  project_id: string;
  object_id: string;
  reason: string;
  project_name: string | null;
  client_name: string | null;
  mine: unknown;
  saved: unknown;
  saved_by: string | null;
  saved_at: string | null;
};

const upsertChange = (id: string, baseSeq: number, name = 'Floor 2', order = 2) => ({
  id,
  base_seq: baseSeq,
  reason: 'conflict',
  deleted: false,
  type: 'floor',
  schema_version: 3,
  data: { name, order },
});
const deleteChange = (id: string, baseSeq = 1) => ({
  id,
  base_seq: baseSeq,
  reason: 'conflict',
  deleted: true,
});
const payload = (count: number, names = 'Floor 2') => ({
  count: String(count),
  names,
  more: '0',
});

const record = (s: Session, project: string, changes: unknown, p: unknown) =>
  s.serverDb.rpc('record_sync_conflicts', {
    p_project: project,
    p_changes: changes,
    p_payload: p,
  });
const list = async (s: Session): Promise<Item[]> => {
  const r = await s.serverDb.rpc('list_my_sync_conflicts');
  expect(r.error).toBeNull();
  return r.data as Item[];
};
const savedIds = (r: { data: unknown }) => (r.data as { ids: string[] }).ids;
const rowCount = async (where: { project?: string; user?: string }): Promise<number> =>
  (
    await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.sync_conflict
      where (${where.project ?? null}::uuid is null or project_id = ${where.project ?? null}::uuid)
        and (${where.user ?? null}::uuid is null or user_id = ${where.user ?? null}::uuid)`
  )[0].n;

type World = { tenant: string; project: string; m1: Member; m2: Member; s1: Session };
async function world(): Promise<World> {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  const m1 = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m1.membershipId, [...EDITOR]);
  const m2 = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m2.membershipId, [...EDITOR]);
  return { tenant, project, m1, m2, s1: await signIn(m1.email) };
}

describe('EZD-299a sync_conflict table and functions', () => {
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  }, 180000);

  describeTenantIsolation('sync_conflict', {
    makeRow: (tenantId, ctx) => ({
      tenant_id: tenantId,
      user_id: ctx.member.appUserId,
      project_id: ctx.projectIds[0],
      object_id: randomUUID(),
      reason: 'conflict',
      base_seq: 1,
      deleted: false,
      type: 'floor',
      schema_version: 3,
      data: { name: 'Floor 2', order: 2 },
    }),
  });

  it('EZD-299a T1 a second member of the same company reads none of the first member rows', async () => {
    const w = await world();
    const { error } = await adminDb()
      .from('sync_conflict')
      .insert({
        tenant_id: w.tenant,
        user_id: w.m1.appUserId,
        project_id: w.project,
        object_id: randomUUID(),
        reason: 'conflict',
        base_seq: 1,
        deleted: false,
        type: 'floor',
        schema_version: 3,
        data: { name: 'Floor 2', order: 2 },
      });
    expect(error).toBeNull();
    const s2 = await signIn(w.m2.email);
    const mine = await w.s1.serverDb.from('sync_conflict').select('id');
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(1);
    const theirs = await s2.serverDb.from('sync_conflict').select('id');
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
  }, 120000);

  it('EZD-299a T2 records two changes, lists them for the same person only, newest first', async () => {
    const w = await world();
    const a = randomUUID();
    const b = randomUUID();
    const first = await record(w.s1, w.project, [upsertChange(a, 1), deleteChange(b)], payload(2));
    expect(first.error).toBeNull();
    const ids = savedIds(first);
    expect(ids).toHaveLength(2);

    const second = await signIn(w.m1.email);
    const items = await list(second);
    expect(items.map((i) => i.id)).toEqual([...ids].sort().reverse());

    const again = await record(second, w.project, [upsertChange(a, 2)], payload(1));
    expect(again.error).toBeNull();
    expect(savedIds(again)[0]).toBe(ids[0]);
    const relisted = await list(await signIn(w.m1.email));
    expect(relisted).toHaveLength(2);
    expect(relisted[0].id).toBe(ids[0]);

    expect(await list(await signIn(w.m2.email))).toEqual([]);

    const tenantB = await createTenant();
    await harnessSql()`update public.membership set status = 'deactivated' where id = ${w.m1.membershipId}::uuid`;
    await harnessSql()`insert into public.membership (tenant_id, user_id, status, scope)
      values (${tenantB}::uuid, ${w.m1.appUserId}::uuid, 'active', 'all')`;
    expect(await list(await signIn(w.m1.email))).toEqual([]);
  }, 120000);

  it('EZD-299a T3 record_sync_conflicts refuses bad input with 22023 and an unseen project with P0002', async () => {
    const tenant = await createTenant();
    const [p1, p2] = await createProjects(tenant, 2);
    const m = await createMember({ tenantId: tenant, scope: 'listed', listed: [p1] });
    const s = await signIn(m.email);
    const id = randomUUID();
    const code = async (project: string, changes: unknown, p: unknown) =>
      (await record(s, project, changes, p)).error?.code;

    expect(await code(p1, [], payload(0))).toBe('22023');
    const many = Array.from({ length: 1001 }, () => deleteChange(randomUUID()));
    expect(await code(p1, many, payload(1001))).toBe('22023');
    expect(await code(p1, [deleteChange(id), deleteChange(id)], payload(2))).toBe('22023');
    expect(await code(p1, [{ ...deleteChange(id), reason: 'gone' }], payload(1))).toBe('22023');
    expect(await code(p1, [deleteChange(id, 0)], payload(1))).toBe('22023');
    expect(await code(p1, [deleteChange(id)], payload(2))).toBe('22023');
    expect(
      await code(
        p1,
        [{ ...upsertChange(id, 1), data: { pad: 'a'.repeat(131062) } }],
        payload(1),
      ),
    ).toBe('22023');

    expect(await code(p2, [deleteChange(id)], payload(1))).toBe('P0002');
    expect(await code(randomUUID(), [deleteChange(id)], payload(1))).toBe('P0002');
    expect(await rowCount({ user: m.appUserId })).toBe(0);
  }, 120000);

  it('EZD-299a T4 a project delete removes its rows, and only the owner can remove one', async () => {
    const w = await world();
    const [other] = await createProjects(w.tenant, 1);
    const gone = await record(w.s1, other, [deleteChange(randomUUID())], payload(1));
    expect(gone.error).toBeNull();
    await harnessSql()`delete from public.project where id = ${other}::uuid`;
    expect(await rowCount({ project: other })).toBe(0);

    const made = await record(w.s1, w.project, [deleteChange(randomUUID())], payload(1));
    const [rowId] = savedIds(made);
    const s2 = await signIn(w.m2.email);
    const notMine = await s2.serverDb.rpc('delete_my_sync_conflict', { p_id: rowId });
    expect(notMine.error).toBeNull();
    expect(notMine.data).toBe(false);
    expect(await rowCount({ project: w.project })).toBe(1);

    const mine = await w.s1.serverDb.rpc('delete_my_sync_conflict', { p_id: rowId });
    expect(mine.error).toBeNull();
    expect(mine.data).toBe(true);
    expect(await list(await signIn(w.m1.email))).toEqual([]);
  }, 120000);

  it('EZD-299a T5 save_objects_resolving removes the rows of the objects it saves, and only those', async () => {
    const w = await world();
    const W = randomUUID();
    const save = (changes: unknown, resolves: unknown) =>
      w.s1.serverDb.rpc('save_objects_resolving', {
        p_project: w.project,
        p_lock_epoch: 0,
        p_changes: changes,
        p_resolves: resolves,
      });
    const floor = (id: string, baseSeq: number, name: string, order: number) => ({
      id,
      base_seq: baseSeq,
      deleted: false,
      type: 'floor',
      schema_version: 3,
      data: { name, order },
    });
    const first = await w.s1.serverDb.rpc('save_objects', {
      p_project: w.project,
      p_lock_epoch: 0,
      p_changes: [floor(W, 0, 'Floor 2', 2)],
    });
    expect(first.error).toBeNull();
    const seq = async (id: string) =>
      (
        await harnessSql()<{ updated_seq: number }[]>`
          select updated_seq from public.model_object
          where project_id = ${w.project}::uuid and object_id = ${id}::uuid`
      )[0].updated_seq;
    expect(await seq(W)).toBe(1);

    const rec = async (baseSeq: number) =>
      savedIds(
        await record(
          w.s1,
          w.project,
          [{ ...upsertChange(W, baseSeq), reason: 'conflict' }],
          payload(1),
        ),
      )[0];
    const exists = async (id: string) =>
      (
        await harnessSql()<{ n: number }[]>`
          select count(*)::int as n from public.sync_conflict where id = ${id}::uuid`
      )[0].n;

    const r1 = await rec(1);
    const a = await save([floor(W, 1, 'Floor 2c', 2)], [r1]);
    expect(a.error).toBeNull();
    expect(a.data).toMatchObject({ status: 'saved', resolved: [r1] });
    expect(await seq(W)).toBe(2);
    expect(await exists(r1)).toBe(0);

    const r2 = await rec(2);
    expect(r2).not.toBe(r1);
    const X = randomUUID();
    const b = await save([floor(X, 0, 'Floor 3', 3)], [r2]);
    expect(b.error).toBeNull();
    expect(b.data).toMatchObject({ status: 'saved', resolved: [] });
    expect(await exists(r2)).toBe(1);

    const c = await save([floor(W, 1, 'Floor 2d', 2)], [r2]);
    expect(c.error).toBeNull();
    expect(c.data).toEqual({ status: 'conflict', conflicts: [{ object_id: W, server_seq: 2 }] });
    expect(await exists(r2)).toBe(1);

    const d = await save([floor(W, 2, 'Floor 2e', 2)], []);
    expect(d.error?.code).toBe('22023');
    expect(await seq(W)).toBe(2);
  }, 120000);

  it('EZD-299a T20 the list names who saved, when, and the client, and hides all of it for a project no longer open', async () => {
    const tenant = await createTenant();
    const [P1, P2, P3] = await createProjects(tenant, 3);
    const sql = harnessSql();
    const [{ id: customer }] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Client A', 't20-client@example.test') returning id`;
    await sql`update public.project set customer_id = ${customer}::uuid
      where id in (${P1}::uuid, ${P3}::uuid)`;

    const m2 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m2.membershipId, [...EDITOR]);
    await sql`update public.app_user set name = 'Dana Ruiz' where id = ${m2.appUserId}::uuid`;
    const s2 = await signIn(m2.email);
    const [F1, F2, F3, F4] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const saveFloors = async (project: string, ids: string[]) => {
      const r = await s2.serverDb.rpc('save_objects', {
        p_project: project,
        p_lock_epoch: 0,
        p_changes: ids.map((id, i) => ({
          id,
          base_seq: 0,
          deleted: false,
          type: 'floor',
          schema_version: 3,
          data: { name: `Floor ${i + 5}`, order: i + 5 },
        })),
      });
      expect(r.error).toBeNull();
    };
    await saveFloors(P1, [F1, F2]);
    await saveFloors(P3, [F4]);

    const lee = await createAppUser();
    await sql`update public.app_user set name = 'Lee Park' where id = ${lee.appUserId}::uuid`;
    await sql`update public.model_object set updated_by = ${lee.appUserId}::uuid
      where project_id = ${P1}::uuid and object_id = ${F2}::uuid`;

    const m1 = await createMember({
      tenantId: tenant,
      scope: 'listed',
      listed: [P1, P2, P3],
    });
    await setPermissions(tenant, m1.membershipId, [...EDITOR]);
    const s1 = await signIn(m1.email);
    expect((await record(s1, P1, [upsertChange(F1, 1), upsertChange(F2, 1)], payload(2))).error).toBeNull();
    expect((await record(s1, P2, [upsertChange(F3, 0)], payload(1))).error).toBeNull();
    expect((await record(s1, P3, [upsertChange(F4, 1)], payload(1))).error).toBeNull();

    const removed = await adminDb()
      .from('membership_project')
      .delete()
      .eq('membership_id', m1.membershipId)
      .eq('project_id', P3);
    expect(removed.error).toBeNull();

    const updatedAt = async (project: string, id: string) =>
      (
        await sql<{ updated_at: Date }[]>`
          select updated_at from public.model_object
          where project_id = ${project}::uuid and object_id = ${id}::uuid`
      )[0].updated_at.getTime();
    const items = await list(await signIn(m1.email));
    const of = (id: string) => items.find((i) => i.object_id === id) as Item;

    expect(of(F1).saved_by).toBe('Dana Ruiz');
    expect(new Date(of(F1).saved_at as string).getTime()).toBe(await updatedAt(P1, F1));
    expect(of(F1).client_name).toBe('Client A');

    expect(of(F2).saved_by).toBeNull();
    expect(new Date(of(F2).saved_at as string).getTime()).toBe(await updatedAt(P1, F2));
    expect(of(F2).client_name).toBe('Client A');

    expect(of(F3).saved).toBeNull();
    expect(of(F3).saved_by).toBeNull();
    expect(of(F3).saved_at).toBeNull();
    expect(of(F3).client_name).toBeNull();

    expect(of(F4).reason).toBe('not_open');
    expect(of(F4).project_name).toBeNull();
    expect(of(F4).client_name).toBeNull();
    expect(of(F4).mine).toBeNull();
    expect(of(F4).saved).toBeNull();
    expect(of(F4).saved_by).toBeNull();
    expect(of(F4).saved_at).toBeNull();
  }, 180000);
});
