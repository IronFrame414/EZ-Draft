// EZD-120a D1-D7 (vault/plans/EZD-120a.md section 1 M1-M6, section 4; AC-EZD-120a-1 to -5, -7). Calls go
// through the gated serverDb of `signIn`, as a route does. Expected values: AC-1 to AC-5 and AC-7 as the
// plan's Tests table words them; M5 (the first failing step decides: 42501, P0002, 22023, stale, conflict,
// saved) and M6 (the checkpoint document shape and defaults) of the plan; Decided "Seq and conflicts".
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import {
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

type Change = Record<string, unknown>;
type Saved = {
  status: string;
  tenant_id?: string;
  objects?: { object_id: string; updated_seq: number }[];
  conflicts?: { object_id: string; server_seq: number }[];
};

const EDITOR = ['view_projects', 'edit_model'] as const;

// EZD-202 E1: a non-floor object must name a live floor of its project (model_object_level_check), so the
// wall's data carries the project's first floor as `level`.
const upsert = (
  w: World,
  id: string,
  baseSeq: number,
  data: Record<string, unknown> = { n: 1 },
): Change => ({
  id,
  base_seq: baseSeq,
  deleted: false,
  type: 'wall',
  schema_version: 1,
  data: { ...data, level: w.floor },
});
const remove = (id: string, baseSeq: number): Change => ({ id, base_seq: baseSeq, deleted: true });

type World = {
  tenant: string;
  project: string;
  editor: Member;
  session: Session;
  floor: string;
};

async function world(): Promise<World> {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  const editor = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, editor.membershipId, [...EDITOR]);
  const session = await signIn(editor.email);
  const [first] = await harnessSql()<{ object_id: string }[]>`
    select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
  return { tenant, project, editor, session, floor: first.object_id };
}

const save = async (w: World, epoch: number, changes: unknown) => {
  const r = await w.session.serverDb.rpc('save_objects', {
    p_project: w.project,
    p_lock_epoch: epoch,
    p_changes: changes,
  });
  return { error: r.error, data: r.data as Saved | null };
};
const checkpoint = (w: World) =>
  w.session.serverDb.rpc('create_checkpoint', { p_project: w.project });

const objectRows = (project: string) =>
  harnessSql()`select * from public.model_object where project_id = ${project}::uuid order by object_id`;
const versionRows = (project: string) =>
  harnessSql()`select * from public.model_version where project_id = ${project}::uuid order by created_at, id`;
const lockRows = (project: string) =>
  harnessSql()`select * from public.edit_lock where project_id = ${project}::uuid`;

const codeOf = async (p: PromiseLike<unknown>): Promise<string | null> => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no-code';
  }
};

describe('EZD-120a model tables, save_objects and create_checkpoint', () => {
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('D1 EZD-120a done when an editor saves 10 objects and then edits 3: only those 3 change, at seq 2', async () => {
    const w = await world();
    const ids: string[] = Array.from({ length: 10 }, () => randomUUID());
    const floorSnapshot = await objectRows(w.project);
    expect(floorSnapshot).toHaveLength(1);

    const first = await save(
      w,
      0,
      ids.map((id, i) => upsert(w, id, 0, { n: i })),
    );
    expect(first.error).toBeNull();
    expect(first.data?.status).toBe('saved');
    expect(first.data?.tenant_id).toBe(w.tenant);
    expect(first.data?.objects).toHaveLength(10);
    for (const o of first.data?.objects ?? []) expect(o.updated_seq).toBe(1);
    expect((first.data?.objects ?? []).map((o) => o.object_id).sort()).toEqual([...ids].sort());

    const afterFirst = await objectRows(w.project);
    expect(afterFirst).toHaveLength(11);
    for (const id of ids) {
      const row = afterFirst.find((r) => r.object_id === id);
      expect(row?.updated_seq).toBe(1);
      expect(row?.updated_by).toBe(w.editor.appUserId);
      expect(row?.deleted).toBe(false);
      expect(row?.type).toBe('wall');
    }

    const edited = ids.slice(0, 3);
    const second = await save(
      w,
      0,
      edited.map((id) => upsert(w, id, 1, { n: 100, edited: true })),
    );
    expect(second.error).toBeNull();
    expect(second.data?.status).toBe('saved');
    expect(second.data?.objects).toHaveLength(3);
    for (const o of second.data?.objects ?? []) expect(o.updated_seq).toBe(2);

    const afterSecond = await objectRows(w.project);
    expect(afterSecond).toHaveLength(11);
    for (const id of edited) {
      const row = afterSecond.find((r) => r.object_id === id);
      expect(row?.updated_seq).toBe(2);
      expect(row?.data).toEqual({ n: 100, edited: true, level: w.floor });
      expect(row?.updated_by).toBe(w.editor.appUserId);
    }
    for (const row of afterFirst.filter((r) => !edited.includes(r.object_id as string))) {
      expect(afterSecond.find((r) => r.object_id === row.object_id)).toEqual(row);
    }
    expect(afterSecond.find((r) => r.object_id === floorSnapshot[0].object_id)).toEqual(
      floorSnapshot[0],
    );
  }, 120000);

  it('D2 a stale lock epoch is refused and writes nothing, and makes no edit_lock row', async () => {
    const w = await world();
    const sql = harnessSql();
    await sql`insert into public.edit_lock (project_id, tenant_id, lock_epoch)
      values (${w.project}::uuid, ${w.tenant}::uuid, 1)
      on conflict (project_id) do update set lock_epoch = 1`;
    const before = await objectRows(w.project);

    const a = await save(w, 0, [upsert(w, randomUUID(), 0)]);
    expect(a.error).toBeNull();
    expect(a.data?.status).toBe('stale_lock_epoch');
    expect(await objectRows(w.project)).toEqual(before);

    const other = await world();
    const otherBefore = await objectRows(other.project);
    expect(await lockRows(other.project)).toHaveLength(0);
    const b = await save(other, 1, [upsert(other, randomUUID(), 0)]);
    expect(b.error).toBeNull();
    expect(b.data?.status).toBe('stale_lock_epoch');
    expect(await objectRows(other.project)).toEqual(otherBefore);
    expect(await lockRows(other.project)).toHaveLength(0);
  }, 120000);

  it('D3 a conflict refuses the whole save and lists every conflicting object with its server seq', async () => {
    const w = await world();
    const a = randomUUID();
    const b = randomUUID();
    expect((await save(w, 0, [upsert(w, a, 0), upsert(w, b, 0)])).data?.status).toBe('saved');
    expect((await save(w, 0, [upsert(w, a, 1, { n: 2 })])).data?.status).toBe('saved');
    const snapshot = await objectRows(w.project);

    const fresh = randomUUID();
    const unknown = randomUUID();
    const cases: [string, Change[], { object_id: string; server_seq: number }[]][] = [
      ['base 1 on a seq-2 object', [upsert(w, a, 1)], [{ object_id: a, server_seq: 2 }]],
      [
        'a conflict plus a valid new object',
        [upsert(w, a, 1), upsert(w, fresh, 0)],
        [{ object_id: a, server_seq: 2 }],
      ],
      ['base 0 on a seq-1 object', [upsert(w, b, 0)], [{ object_id: b, server_seq: 1 }]],
      ['base 1 on an unknown id', [upsert(w, unknown, 1)], [{ object_id: unknown, server_seq: 0 }]],
    ];
    for (const [name, changes, conflicts] of cases) {
      const r = await save(w, 0, changes);
      expect(r.error, name).toBeNull();
      expect(r.data?.status, name).toBe('conflict');
      expect(r.data?.conflicts, name).toEqual(conflicts);
      expect(await objectRows(w.project), name).toEqual(snapshot);
    }
  }, 120000);

  it('D4 a checkpoint copies the live objects, is never edited afterwards, and keeps only its label editable', async () => {
    const w = await world();
    const ids = Array.from({ length: 10 }, () => randomUUID());
    expect(
      (
        await save(
          w,
          0,
          ids.map((id, i) => upsert(w, id, 0, { n: i })),
        )
      ).data?.status,
    ).toBe('saved');
    expect((await save(w, 0, [remove(ids[9], 1)])).data?.status).toBe('saved');
    const live = (await objectRows(w.project)).filter((r) => !r.deleted);
    expect(live).toHaveLength(10);
    expect(await versionRows(w.project)).toHaveLength(0);

    const c1 = await checkpoint(w);
    expect(c1.error).toBeNull();
    expect(await versionRows(w.project)).toHaveLength(1);
    const c2 = await checkpoint(w);
    expect(c2.error).toBeNull();
    expect(await versionRows(w.project)).toHaveLength(2);
    const id1 = c1.data as string;
    const id2 = c2.data as string;
    expect(id1).not.toBe(id2);

    const [v1, v2] = await Promise.all(
      [id1, id2].map(
        async (id) =>
          (await harnessSql()`select * from public.model_version where id = ${id}::uuid`)[0],
      ),
    );
    const expectedObjects = live
      .map((r) => ({
        id: r.object_id as string,
        type: r.type as string,
        schema_version: r.schema_version as number,
        data: r.data as unknown,
      }))
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    expect(expectedObjects).toHaveLength(10);
    expect(v1.model_json).toEqual({ objects: expectedObjects });
    expect(v2.model_json).toEqual({ objects: expectedObjects });
    expect(v1.schema_version).toBe(1);
    expect(v1.parent_version_id).toBeNull();
    expect(v2.parent_version_id).toBe(id1);
    expect(v1.created_by).toBe(w.editor.appUserId);
    expect(v1.tenant_id).toBe(w.tenant);
    expect(v1.project_id).toBe(w.project);
    for (const v of [v1, v2]) {
      expect(v.label).toBeNull();
      expect(v.sent_to).toBeNull();
      expect(v.preview_path).toBeNull();
      expect(v.is_snapshot).toBe(false);
      expect(v.is_sent).toBe(false);
      expect(v.keep).toBe(false);
      expect(v.sent_at).toBeNull();
      expect(v.cleanup_shown_at).toBeNull();
      expect(v.version_no).toBeNull();
    }

    expect((await save(w, 0, [upsert(w, ids[0], 1, { n: 'changed' })])).data?.status).toBe('saved');
    const sql = harnessSql();
    expect(
      await codeOf(
        sql`update public.model_version set model_json = '{}'::jsonb where id = ${id1}::uuid`,
      ),
    ).toBe('55000');
    expect(
      await codeOf(
        sql`update public.model_version set parent_version_id = ${id2}::uuid where id = ${id1}::uuid`,
      ),
    ).toBe('55000');
    expect(
      await codeOf(sql`update public.model_version set label = 'x' where id = ${id1}::uuid`),
    ).toBeNull();
    const [after] = await sql`select * from public.model_version where id = ${id1}::uuid`;
    expect(after.label).toBe('x');
    expect(after.model_json).toEqual({ objects: expectedObjects });
  }, 120000);

  it('D4 a project with only its first floor checkpoints that one object', async () => {
    const w = await world();
    const floor = (await objectRows(w.project))[0];
    const c = await checkpoint(w);
    expect(c.error).toBeNull();
    const [v] =
      await harnessSql()`select * from public.model_version where id = ${c.data as string}::uuid`;
    expect(v.model_json).toEqual({
      objects: [
        {
          id: floor.object_id,
          type: 'floor',
          schema_version: 1,
          data: { name: 'Floor 1', order: 1 },
        },
      ],
    });
    expect(v.schema_version).toBe(1);
  }, 120000);

  describe('D5 access', () => {
    it('D5 refuses a member without edit_model, an unlisted project, another tenant, and the browser client', async () => {
      const w = await world();
      const viewOnly = await createMember({ tenantId: w.tenant, scope: 'all' });
      await setPermissions(w.tenant, viewOnly.membershipId, ['view_projects']);
      const viewSession = await signIn(viewOnly.email);

      const [otherProject] = await createProjects(w.tenant, 1);
      const listed = await createMember({
        tenantId: w.tenant,
        scope: 'listed',
        listed: [otherProject],
      });
      await setPermissions(w.tenant, listed.membershipId, [...EDITOR]);
      const listedSession = await signIn(listed.email);

      const tenantB = await createTenant();
      const outsider = await createMember({ tenantId: tenantB, scope: 'all' });
      await setPermissions(tenantB, outsider.membershipId, [...EDITOR]);
      const outsiderSession = await signIn(outsider.email);

      const args = {
        p_project: w.project,
        p_lock_epoch: 0,
        p_changes: [upsert(w, randomUUID(), 0)],
      };
      const objectsBefore = await objectRows(w.project);

      for (const [name, db, code] of [
        ['view-only member', viewSession.serverDb, '42501'],
        ['unlisted project', listedSession.serverDb, 'P0002'],
        ['other tenant', outsiderSession.serverDb, 'P0002'],
        ['browser client', w.session.browserDb, '42501'],
      ] as const) {
        const s = await db.rpc('save_objects', args);
        expect(s.error?.code, `save ${name}`).toBe(code);
        const c = await db.rpc('create_checkpoint', { p_project: w.project });
        expect(c.error?.code, `checkpoint ${name}`).toBe(code);
      }
      expect(await objectRows(w.project)).toEqual(objectsBefore);
      expect(await versionRows(w.project)).toHaveLength(0);
      expect(await lockRows(w.project)).toHaveLength(0);
    }, 180000);

    it('D5 an editor may not insert or update the three tables directly, and reads its own rows', async () => {
      const w = await world();
      expect((await save(w, 0, [upsert(w, randomUUID(), 0)])).data?.status).toBe('saved');
      expect((await checkpoint(w)).error).toBeNull();
      const objectsBefore = await objectRows(w.project);
      const versionsBefore = await versionRows(w.project);
      const locksBefore = await lockRows(w.project);
      const db = w.session.serverDb;
      const base = { project_id: w.project, tenant_id: w.tenant };

      const writes = [
        await db.from('edit_lock').insert({ ...base }),
        await db.from('edit_lock').update({ lock_epoch: 5 }).eq('project_id', w.project),
        await db.from('model_object').insert({
          ...base,
          object_id: randomUUID(),
          type: 'wall',
          data: {},
          schema_version: 1,
          updated_seq: 1,
        }),
        await db.from('model_object').update({ deleted: true }).eq('project_id', w.project),
        await db
          .from('model_version')
          .insert({ ...base, model_json: { objects: [] }, schema_version: 1 }),
        await db.from('model_version').update({ label: 'x' }).eq('project_id', w.project),
      ];
      for (const r of writes) expect(r.error?.code).toBe('42501');

      expect(await objectRows(w.project)).toEqual(objectsBefore);
      expect(await versionRows(w.project)).toEqual(versionsBefore);
      expect(await lockRows(w.project)).toEqual(locksBefore);

      const o = await db.from('model_object').select('object_id').eq('project_id', w.project);
      expect(o.error).toBeNull();
      expect((o.data ?? []).length).toBe(objectsBefore.length);
      const v = await db.from('model_version').select('id').eq('project_id', w.project);
      expect(v.error).toBeNull();
      expect((v.data ?? []).length).toBe(versionsBefore.length);
      const l = await db.from('edit_lock').select('project_id').eq('project_id', w.project);
      expect(l.error).toBeNull();
      expect((l.data ?? []).length).toBe(locksBefore.length);
    }, 180000);

    describeTenantIsolation('edit_lock', {
      makeRow: (t, ctx) => ({ project_id: ctx.projectIds[0], tenant_id: t }),
    });
    describeTenantIsolation('model_object', {
      makeRow: (t, ctx) => ({
        project_id: ctx.projectIds[0],
        tenant_id: t,
        object_id: randomUUID(),
        type: 'floor',
        data: { name: 'Floor 1', order: 1 },
        schema_version: 1,
        updated_seq: 1,
      }),
    });
    describeTenantIsolation('model_version', {
      makeRow: (t, ctx) => ({
        project_id: ctx.projectIds[0],
        tenant_id: t,
        model_json: { objects: [] },
        schema_version: 1,
      }),
    });
  });

  it('D6 refuses a negative lock epoch and every body the parser refuses, writing nothing', async () => {
    const w = await world();
    const id = randomUUID();
    const before = await objectRows(w.project);

    const negative = await save(w, -1, [upsert(w, id, 0)]);
    expect(negative.error?.code).toBe('22023');

    const refused: [string, unknown][] = [
      ['changes an object', {}],
      ['empty changes', []],
      ['extra change key', [{ ...upsert(w, id, 0), extra: 1 }]],
      ['base_seq 1.5', [upsert(w, id, 1.5)]],
      ['delete base_seq 0', [remove(id, 0)]],
      ['type Wall', [{ ...upsert(w, id, 0), type: 'Wall' }]],
      ['schema_version 0', [{ ...upsert(w, id, 0), schema_version: 0 }]],
      ['data an array', [{ ...upsert(w, id, 0), data: [] }]],
      ['repeated id', [upsert(w, id, 0), upsert(w, id, 0)]],
    ];
    for (const [name, changes] of refused) {
      const r = await save(w, 0, changes);
      expect(r.error?.code, name).toBe('22023');
    }
    expect(await objectRows(w.project)).toEqual(before);
    expect(await lockRows(w.project)).toHaveLength(0);
  }, 120000);

  it('D7 every new project has exactly one first floor, however it is made', async () => {
    const tenant = await createTenant();
    const [direct] = await createProjects(tenant, 1);
    const maker = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, maker.membershipId, ['view_projects', 'create_projects']);
    const s = await signIn(maker.email);
    const made = await s.serverDb.rpc('create_project', {
      p_name: 'D7 project',
      p_address: '7 Floor St',
      p_type: 'kitchen',
      p_customer_id: null,
      p_scope_of_work: null,
    });
    expect(made.error).toBeNull();
    const viaRpc = (made.data as { project_id: string }[])[0].project_id;

    for (const project of [direct, viaRpc]) {
      const rows = await objectRows(project);
      expect(rows).toHaveLength(1);
      expect(rows[0].tenant_id).toBe(tenant);
      expect(rows[0].type).toBe('floor');
      expect(rows[0].data).toEqual({ name: 'Floor 1', order: 1 });
      expect(rows[0].schema_version).toBe(1);
      expect(rows[0].updated_seq).toBe(1);
      expect(rows[0].updated_by).toBeNull();
      expect(rows[0].deleted).toBe(false);
    }
  }, 120000);
});
