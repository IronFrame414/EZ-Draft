// EZD-120b R1 (vault/plans/EZD-120b.md section 4; AC-EZD-120b-5). Local database, real sign-in (as
// app/src/server/model/model.db.test.ts). Expected values: Decided "loadModel" (project name and client,
// edit_lock epoch or 0, live objects by object_id, pages past the 1,000-row cap, archived not filtered),
// "Object read" (an object that fails to parse is listed in `invalid`, not in `objects`) and "canEdit".
// The first floor is the one made by the project's insert trigger; admin rows set updated_seq >= 1 and a
// live non-floor `data.level` = that floor's object_id.
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import type { PermissionContext } from '../permissions/context';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadModel } from './model';

const wallData = (level: string) => ({
  geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
  status: 'new',
  level,
  attributes: {
    thickness: 4.5,
    thicknessSide: 'right',
    height: 96,
    topCutToCeiling: false,
    bearing: false,
  },
});

const ctxOf = (
  m: { appUserId: string; membershipId: string },
  canEdit: boolean,
): PermissionContext => ({
  appUserId: m.appUserId,
  membershipId: m.membershipId,
  scope: 'all',
  permissions: new Set(canEdit ? ['view_projects', 'edit_model'] : ['view_projects']),
  listedProjectIds: new Set<string>(),
});

describe('EZD-120b loadModel', () => {
  let tenant = '';
  let small = '';
  let big = '';
  let floorId = '';
  let editor: Awaited<ReturnType<typeof createMember>>;
  let viewer: Awaited<ReturnType<typeof createMember>>;
  let editorSession: Session;
  let viewerSession: Session;
  const walls = [randomUUID(), randomUUID()];
  const deletedWall = randomUUID();
  const badFloor = randomUUID();

  beforeAll(async () => {
    tenant = await createTenant();
    [small, big] = await createProjects(tenant, 2);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    editorSession = await signIn(editor.email);
    viewerSession = await signIn(viewer.email);

    const sql = harnessSql();
    const customer = await adminDb()
      .from('customer')
      .insert({ tenant_id: tenant, name: 'Ann Lee', email: 'ann@example.test' })
      .select('id')
      .single();
    if (customer.error || !customer.data)
      throw new Error(`customer insert failed: ${customer.error?.message}`);
    const linked = await adminDb()
      .from('project')
      .update({ customer_id: customer.data.id })
      .eq('id', small);
    if (linked.error) throw new Error(`project update failed: ${linked.error.message}`);

    const [first] = await sql<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${small}::uuid and type = 'floor'`;
    floorId = first.object_id;
    const add = async (id: string, type: string, data: unknown, seq: number, deleted: boolean) => {
      await sql`insert into public.model_object
        (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
        values (${small}::uuid, ${id}::uuid, ${tenant}::uuid, ${type}, ${sql.json(data as never)}, 1,
          ${seq}, ${deleted})`;
    };
    await add(walls[0], 'wall', wallData(floorId), 2, false);
    await add(walls[1], 'wall', wallData(floorId), 3, false);
    await add(deletedWall, 'wall', wallData(floorId), 4, true);
    await add(badFloor, 'floor', { name: '' }, 5, false);

    await sql`insert into public.model_object
      (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
      select ${big}::uuid, gen_random_uuid(), ${tenant}::uuid, 'floor',
        jsonb_build_object('name', 'F' || g, 'order', g + 1), 1, 1, false
      from generate_series(1, 1000) g`;
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 loads the project, its live valid objects and the viewer, and lists a bad object as invalid', async () => {
    const sql = harnessSql();
    const [project] = await sql<
      { name: string }[]
    >`select name from public.project where id = ${small}::uuid`;
    const rows = await sql<
      { object_id: string; type: string; data: unknown; updated_seq: number }[]
    >`
      select object_id, type, data, updated_seq from public.model_object
      where project_id = ${small}::uuid and deleted = false and object_id <> ${badFloor}::uuid
      order by object_id`;

    const load = await loadModel(
      editorSession.serverDb as unknown as SupabaseClient<Database>,
      small,
      ctxOf(editor, true),
    );
    expect(load).not.toBeNull();
    expect(load?.project).toEqual({
      id: small,
      name: project.name,
      clientName: 'Ann Lee',
      planScale: 0.5,
    });
    expect(load?.viewer).toEqual({
      appUserId: editor.appUserId,
      tenantId: tenant,
      membershipId: editor.membershipId,
      canEdit: true,
    });
    expect(load?.lockEpoch).toBe(0);
    expect(load?.objects).toHaveLength(3);
    expect(load?.objects.map((o) => o.id)).toEqual(rows.map((r) => r.object_id));
    expect(load?.objects.find((o) => o.id === floorId)?.type).toBe('floor');
    for (const r of rows) {
      const got = load?.objects.find((o) => o.id === r.object_id);
      const data =
        r.type === 'wall'
          ? {
              ...(r.data as Record<string, unknown>),
              attributes: {
                ...((r.data as Record<string, unknown>).attributes as Record<string, unknown>),
                layers: [
                  { material: 'drywall', thickness: 0.5 },
                  { material: 'stud', thickness: 3.5 },
                  { material: 'drywall', thickness: 0.5 },
                ],
              },
            }
          : r.data;
      expect(got).toEqual({
        id: r.object_id,
        type: r.type,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data,
        updatedSeq: r.updated_seq,
      });
    }
    expect(load?.invalid).toEqual([{ id: badFloor, issue: 'invalid_data' }]);
  }, 120000);

  it('R1 pages past 1,000 rows and reports canEdit false without edit_model', async () => {
    const load = await loadModel(
      viewerSession.serverDb as unknown as SupabaseClient<Database>,
      big,
      ctxOf(viewer, false),
    );
    expect(load?.objects).toHaveLength(1001);
    expect(new Set(load?.objects.map((o) => o.id)).size).toBe(1001);
    expect(load?.viewer.canEdit).toBe(false);
  }, 120000);
});
