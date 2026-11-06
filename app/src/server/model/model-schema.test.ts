// EZD-202 A1-A7 (vault/plans/EZD-202.md section 3 route and SQL rows, section 4, Decided "Save check" and
// "M1 SQL"; AC-EZD-202-1, -2, -4, -5). The save route is called as in app/src/app/api/projects/[id]/objects/
// route.test.ts (next/headers mocked, members signed in by magic link). Expected values: section 3 (400
// `{ error: { code: 'invalid_object', message_key: 'error.invalid_input' }, invalid: [{ id, issue }] }`,
// no-store, no `model.saved`), AC-2 (`invalid_data`, `unknown_type`, `unknown_schema_version`), AC-5 and M1
// (`level_not_found` carries the id of the object naming the floor; a floor added, restored or deleted
// together with its objects in one save passes), AC-4 and P120a M6 (checkpoint copies ids and data).
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, parseModelDocument } from '@ezdraft/geometry';
import v3 from '../../../../packages/geometry/src/schema/samples/v3.json';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
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
  type Member,
} from '../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import { emit } from '../events';

vi.mock('../events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});
const emitMock = vi.mocked(emit);

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

type Json = Record<string, unknown>;
type Issue = { id: string; issue: string };

const invalidBody = (invalid: Issue[]) => ({
  error: { code: 'invalid_object', message_key: 'error.invalid_input' },
  invalid,
});

async function post(
  project: string,
  changes: unknown[],
  membershipId: string,
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('../../app/api/projects/[id]/objects/route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${project}/objects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ezdraft-membership': membershipId },
      body: JSON.stringify({ lockEpoch: 0, changes }),
    }),
    { params: Promise.resolve({ id: project }) },
  );
  return { res, json: JSON.parse(await res.text()) as unknown };
}

// Plan section 3 fixture row: every object is a copy of a Floor 1 object of samples/v3.json with a new id
// (the caller's) and `level` set to the floor the test names.
type V1Object = { id: string; type: string; data: Json };
const V1 = (v3 as unknown as { objects: V1Object[] }).objects;
const FLOOR1 = V1.find((o) => o.type === 'floor' && o.data.name === 'Floor 1') as V1Object;
const onFloor1 = (type: string) =>
  V1.find((o) => o.type === type && o.data.level === FLOOR1.id) as V1Object;
const copyOf = (type: string, level: string): Json => ({
  ...structuredClone(onFloor1(type).data),
  level,
});
const floorData = (name: string, order: number): Json => ({
  ...structuredClone(FLOOR1.data),
  name,
  order,
});
const wallData = (level: string): Json => copyOf('wall', level);
const openingData = (level: string, hostWallId: string): Json => {
  const data = copyOf('opening', level);
  (data.geometry as Json).hostWallId = hostWallId;
  return data;
};
const roomData = (level: string): Json => copyOf('room', level);

const up = (
  id: string,
  type: string,
  data: Json,
  baseSeq = 0,
  schemaVersion = CURRENT_SCHEMA_VERSION,
) => ({
  id,
  baseSeq,
  deleted: false,
  type,
  schemaVersion,
  data,
});
const del = (id: string, baseSeq: number) => ({ id, baseSeq, deleted: true });

const rows = (project: string) =>
  harnessSql()`select * from public.model_object where project_id = ${project}::uuid order by object_id`;
const floorIdOf = async (project: string): Promise<string> =>
  (
    await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object
      where project_id = ${project}::uuid and type = 'floor' and deleted = false`
  )[0].object_id;
const seqOf = async (project: string, id: string): Promise<number> =>
  (
    await harnessSql()<{ updated_seq: number }[]>`
      select updated_seq from public.model_object
      where project_id = ${project}::uuid and object_id = ${id}::uuid`
  )[0].updated_seq;
const isDeleted = async (project: string, id: string): Promise<boolean> =>
  (
    await harnessSql()<{ deleted: boolean }[]>`
      select deleted from public.model_object
      where project_id = ${project}::uuid and object_id = ${id}::uuid`
  )[0].deleted;

describe('EZD-202 model object schema on save', () => {
  let tenant = '';
  let project = '';
  let otherProject = '';
  let editor: Member;
  let editorCookies: Map<string, string>;
  let floor1 = '';
  let releaseLock: () => Promise<void>;

  const asEditor = () => {
    state.store = new Map(editorCookies);
  };
  const send = (p: string, changes: unknown[]) => {
    asEditor();
    return post(p, changes, editor.membershipId);
  };
  const expectRefused = (r: { res: Response; json: unknown }, invalid: Issue[]) => {
    expect(r.res.status).toBe(400);
    expect(r.json).toEqual(invalidBody(invalid));
    expect(r.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(emitMock).not.toHaveBeenCalled();
  };
  const newFloor2 = async (p: string) => {
    const id = randomUUID();
    const r = await send(p, [up(id, 'floor', floorData('Floor 2', 2))]);
    expect(r.res.status).toBe(200);
    return id;
  };

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    tenant = await createTenant();
    [project, otherProject] = await createProjects(tenant, 2);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    editorCookies = await cookiesFor(editor.email);
    floor1 = await floorIdOf(project);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    emitMock.mockClear();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await cleanup();
      await closeHarness();
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('A1 valid save: a new floor with a wall, opening and room on it is stored as sent at the current version', async () => {
    const p = (await createProjects(tenant, 1))[0];
    const floor = randomUUID();
    const wall = randomUUID();
    const opening = randomUUID();
    const room = randomUUID();
    const sent = {
      [floor]: floorData('Floor 2', 2),
      [wall]: wallData(floor),
      [opening]: openingData(floor, wall),
      [room]: roomData(floor),
    };
    const r = await send(p, [
      up(floor, 'floor', sent[floor]),
      up(wall, 'wall', sent[wall]),
      up(opening, 'opening', sent[opening]),
      up(room, 'room', sent[room]),
    ]);
    expect(r.res.status).toBe(200);
    expect(emitMock).toHaveBeenCalledTimes(1);
    const stored = await rows(p);
    expect(stored).toHaveLength(5);
    for (const id of [floor, wall, opening, room]) {
      const row = stored.find((x) => x.object_id === id);
      expect(row, id).toBeDefined();
      expect(row?.schema_version).toBe(CURRENT_SCHEMA_VERSION);
      expect(row?.data).toEqual(sent[id]);
    }
  }, 120000);

  it('A2 refused data: a wall without attributes.height, and a height of "96", is refused as invalid_data', async () => {
    const before = await rows(project);
    const missing = wallData(floor1);
    delete (missing.attributes as Json).height;
    const stringHeight = wallData(floor1);
    (stringHeight.attributes as Json).height = '96';
    for (const data of [missing, stringHeight]) {
      const id = randomUUID();
      expectRefused(await send(project, [up(id, 'wall', data)]), [{ id, issue: 'invalid_data' }]);
      expect(await rows(project)).toHaveLength(before.length);
    }
  }, 120000);

  it('A3 type, version: schemaVersion 4 and type beam are refused, nothing is written', async () => {
    const before = await rows(project);
    const v = randomUUID();
    expectRefused(await send(project, [up(v, 'wall', wallData(floor1), 0, 4)]), [
      { id: v, issue: 'unknown_schema_version' },
    ]);
    const t = randomUUID();
    expectRefused(await send(project, [up(t, 'beam', wallData(floor1))]), [
      { id: t, issue: 'unknown_type' },
    ]);
    expect(await rows(project)).toEqual(before);
  }, 120000);

  it("A4 floor refused: a random level, another project's floor and a deleted floor are level_not_found", async () => {
    const otherFloor = await floorIdOf(otherProject);
    const gone = await newFloor2(project);
    expect((await send(project, [del(gone, await seqOf(project, gone))])).res.status).toBe(200);
    const before = await rows(project);
    const otherBefore = await rows(otherProject);

    for (const level of [randomUUID(), otherFloor, gone]) {
      const wall = randomUUID();
      emitMock.mockClear();
      expectRefused(await send(project, [up(wall, 'wall', wallData(level))]), [
        { id: wall, issue: 'level_not_found' },
      ]);
      expect(await rows(project), level).toEqual(before);
      expect(await rows(otherProject), level).toEqual(otherBefore);
    }
  }, 120000);

  it('A5 floor delete: a floor with a live wall cannot be deleted alone, but can be deleted with its wall', async () => {
    const p = (await createProjects(tenant, 1))[0];
    const floor = randomUUID();
    const wall = randomUUID();
    expect(
      (
        await send(p, [
          up(floor, 'floor', floorData('Floor 2', 2)),
          up(wall, 'wall', wallData(floor)),
        ])
      ).res.status,
    ).toBe(200);

    emitMock.mockClear();
    expectRefused(await send(p, [del(floor, await seqOf(p, floor))]), [
      { id: wall, issue: 'level_not_found' },
    ]);
    expect(await isDeleted(p, floor)).toBe(false);

    const both = await send(p, [
      del(floor, await seqOf(p, floor)),
      del(wall, await seqOf(p, wall)),
    ]);
    expect(both.res.status).toBe(200);
    expect(await isDeleted(p, floor)).toBe(true);
    expect(await isDeleted(p, wall)).toBe(true);
  }, 120000);

  it('A6 restore: a deleted floor restored with a new wall on it, in one save, is accepted', async () => {
    const p = (await createProjects(tenant, 1))[0];
    const floor = await newFloor2(p);
    expect((await send(p, [del(floor, await seqOf(p, floor))])).res.status).toBe(200);
    expect(await isDeleted(p, floor)).toBe(true);

    const wall = randomUUID();
    const r = await send(p, [
      up(floor, 'floor', floorData('Floor 2', 2), await seqOf(p, floor)),
      up(wall, 'wall', wallData(floor)),
    ]);
    expect(r.res.status).toBe(200);
    expect(await isDeleted(p, floor)).toBe(false);
    expect(await isDeleted(p, wall)).toBe(false);
  }, 120000);

  it('A7 ids survive: saved ids reach the rows and the checkpoint document, which parses', async () => {
    const p = (await createProjects(tenant, 1))[0];
    const floor = randomUUID();
    const wall = randomUUID();
    const room = randomUUID();
    const sent = [floor, wall, room];
    const firstFloor = await floorIdOf(p);
    const r = await send(p, [
      up(floor, 'floor', floorData('Floor 2', 2)),
      up(wall, 'wall', wallData(floor)),
      up(room, 'room', roomData(floor)),
    ]);
    expect(r.res.status).toBe(200);
    const ids = (await rows(p)).map((x) => x.object_id as string);
    expect(ids.sort()).toEqual([...sent, firstFloor].sort());

    const session = await signIn(editor.email);
    const made = await session.serverDb.rpc('create_checkpoint', { p_project: p });
    expect(made.error).toBeNull();
    const [version] = await harnessSql()<{ model_json: unknown }[]>`
      select model_json from public.model_version where id = ${made.data as string}::uuid`;
    const parsed = parseModelDocument(version.model_json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document.objects.map((o) => o.id).sort()).toEqual([...sent, firstFloor].sort());
  }, 120000);
});
