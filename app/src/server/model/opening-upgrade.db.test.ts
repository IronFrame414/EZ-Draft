// EZD-204a S1 (vault/plans/EZD-204a.md section 4; AC-EZD-204-6, -15). Local database, real sign-in (beforeAll and
// ctxOf as load-model.db.test.ts). Expected values: plan Decided "v3 → v4 step" (Q-0642 row 2; Q-0641 row 3), 03b
// rule 5, ARCH Model schema Read rule and model.ts loadModel (parses on load, never writes the row back).
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import v3 from '../../../../packages/geometry/src/schema/samples/v3.json';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
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
import { loadModel } from './model';

type Rec = Record<string, unknown>;
type SampleObject = { id: string; type: string; schema_version: number; data: Rec };
type DoorRow = { type: string; schema_version: number; data: Rec; updated_seq: number };

const SAMPLE = (v3 as unknown as { objects: SampleObject[] }).objects;
const FLOOR1 = SAMPLE.find((o) => o.type === 'floor' && o.data.name === 'Floor 1') as SampleObject;
const V3_WALL = SAMPLE.find((o) => o.type === 'wall' && o.data.level === FLOOR1.id) as SampleObject;
const V3_DOOR = SAMPLE.find(
  (o) =>
    o.type === 'opening' &&
    o.data.level === FLOOR1.id &&
    (o.data.attributes as Rec).kind === 'door',
) as SampleObject;

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

describe('EZD-204a stored v3 opening upgrade', () => {
  let tenant = '';
  let project = '';
  let floorId = '';
  let editor: Awaited<ReturnType<typeof createMember>>;
  let editorSession: Session;
  const wallId = randomUUID();
  const doorId = randomUUID();

  const readDoor = async (): Promise<DoorRow> => {
    const [row] = await harnessSql()<DoorRow[]>`
      select type, schema_version, data, updated_seq from public.model_object
      where project_id = ${project}::uuid and object_id = ${doorId}::uuid`;
    return row;
  };

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    editorSession = await signIn(editor.email);

    const sql = harnessSql();
    const [first] = await sql<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
    floorId = first.object_id;

    const wallData = { ...V3_WALL.data, level: floorId };
    const doorData = {
      ...V3_DOOR.data,
      level: floorId,
      geometry: { ...(V3_DOOR.data.geometry as Rec), hostWallId: wallId },
    };
    const add = async (id: string, type: string, data: unknown, seq: number) => {
      await sql`insert into public.model_object
        (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
        values (${project}::uuid, ${id}::uuid, ${tenant}::uuid, ${type}, ${sql.json(data as never)}, 3,
          ${seq}, false)`;
    };
    await add(wallId, 'wall', wallData, 2);
    await add(doorId, 'opening', doorData, 3);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-204a done when: a stored v3 door loads upgraded and its row is not rewritten', async () => {
    const snapshot = await readDoor();
    expect(snapshot.schema_version).toBe(3);

    const load = await loadModel(
      editorSession.serverDb as unknown as SupabaseClient<Database>,
      project,
      ctxOf(editor, true),
    );
    expect(load).not.toBeNull();
    const door = load?.objects.find((o) => o.id === doorId);
    expect(door?.schemaVersion).toBe(4);
    expect(door?.data).toEqual({
      ...snapshot.data,
      geometry: { ...(snapshot.data.geometry as Rec), axis: null },
      attributes: {
        ...(snapshot.data.attributes as Rec),
        swing: 'left',
        hand: 'left',
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'typed',
      },
    });
    expect((door?.data as { attributes: Rec }).attributes.roughOpening).toEqual({
      width: 38,
      height: 82,
    });

    const after = await readDoor();
    expect(after).toEqual(snapshot);
    expect(after.schema_version).toBe(3);
  }, 120000);
});
