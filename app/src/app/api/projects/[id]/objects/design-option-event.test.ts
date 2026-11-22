// EZD-1009 (03c design_option; 03b rule 4; S07 Validation "Maximum three options (A/B/C)"; S07 Events emitted
// "design_option.created / design_option.updated"; vault/build/assumptions.md EZD-1009 rows): options are saved
// through the objects route as design_option model objects.
// AC-EZD-1009-1: a fourth option in a group is refused (400 invalid_input) and nothing of that save is written.
// AC-EZD-1009-2: saving option B, whose patch replaces a wall, leaves the stored wall as it was; applying B's
// patches over the loaded working copy shows the patched wall.
// AC-EZD-1009-3: a status change fires design_option.updated with the new status; a new option fires created.
// Same sign-in and mocks as cabinet-schedule-event.test.ts beside it. Expected values are the fixture's own.
import {
  CURRENT_SCHEMA_VERSION,
  applyDesignOption,
  createWallData,
  parseStoredObject,
  type ModelObject,
} from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../../../test-harness/errors/alert-lock';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { APP_BUILD_HEADER, appBuild } from '../../../../../lib/app-version';
import { emit } from '../../../../../server/events';
import { reportError } from '../../../../../server/errors/report';

vi.mock('../../../../../server/errors/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/errors/report')>();
  return { ...actual, reportError: vi.fn(async () => {}) };
});
const reportMock = vi.mocked(reportError);

vi.mock('../../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/events')>();
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

const wallChange = (id: string, baseSeq: number, floorId: string, x = 144) => ({
  id,
  baseSeq,
  deleted: false,
  type: 'wall',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: (() => {
    const made = createWallData({
      start: { x: 0, y: 0 },
      end: { x, y: 0 },
      level: floorId,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    return made.data;
  })(),
});

const optionChange = (
  id: string,
  baseSeq: number,
  groupId: string,
  label: string,
  over: Record<string, unknown> = {},
) => ({
  id,
  baseSeq,
  deleted: false,
  type: 'design_option',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: {
    groupId,
    groupName: 'Beams',
    label,
    name: `Option ${label}`,
    status: 'draft',
    modelDelta: [],
    ...over,
  },
});

describe('EZD-1009 design options through the save route', () => {
  let tenant = '';
  let project = '';
  let floorId = '';
  let editor: Member;
  let cookies: Map<string, string>;
  let releaseLock: () => Promise<void>;

  const post = async (body: Record<string, unknown>) => {
    state.store = new Map(cookies);
    emitMock.mockClear();
    reportMock.mockClear();
    const { POST } = await import('./route');
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [APP_BUILD_HEADER]: String(appBuild()),
          'x-ezdraft-membership': editor.membershipId,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    return { res, json: JSON.parse(await res.text()) as unknown };
  };
  const optionCalls = () => emitMock.mock.calls.filter((c) => c[0].startsWith('design_option.'));
  const storedOptions = async (groupId: string) =>
    harnessSql()<{ object_id: string; label: string }[]>`
      select object_id, data ->> 'label' as label from public.model_object
      where project_id = ${project}::uuid and type = 'design_option' and not deleted
        and data ->> 'groupId' = ${groupId} order by data ->> 'label'`;
  const storedRow = async (id: string) =>
    (
      await harnessSql()<
        { object_id: string; type: string; schema_version: number; data: unknown }[]
      >`
        select object_id, type, schema_version, data from public.model_object
        where project_id = ${project}::uuid and object_id = ${id}::uuid`
    )[0]!;

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    floorId = (
      await harnessSql()<{ object_id: string }[]>`
        select object_id from public.model_object
        where project_id = ${project}::uuid and type = 'floor'`
    )[0].object_id;
    cookies = await cookiesFor(editor.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    emitMock.mockClear();
  });

  afterAll(async () => {
    try {
      await cleanup();
      await closeHarness();
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('AC-1 three options A, B and C save; a fourth is refused and not written', async () => {
    const group = randomUUID();
    const [A, B, C, D] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const three = await post({
      lockEpoch: 0,
      changes: [
        optionChange(A, 0, group, 'A'),
        optionChange(B, 0, group, 'B'),
        optionChange(C, 0, group, 'C'),
      ],
    });
    expect(three.res.status).toBe(200);
    expect((await storedOptions(group)).map((r) => r.label)).toEqual(['A', 'B', 'C']);

    // A fourth in the same group, with a wall in the same save: the whole save is refused.
    const W = randomUUID();
    const fourth = await post({
      lockEpoch: 0,
      changes: [wallChange(W, 0, floorId), optionChange(D, 0, group, 'A', { name: 'Fourth' })],
    });
    expect(fourth.res.status).toBe(400);
    expect(fourth.json).toEqual({
      error: { code: 'invalid_input', message_key: 'error.invalid_input' },
    });
    expect((await storedOptions(group)).map((r) => r.object_id)).toEqual([A, B, C]);
    expect(
      await harnessSql()`select 1 from public.model_object where project_id = ${project}::uuid and object_id = ${W}::uuid`,
    ).toHaveLength(0);
    expect(optionCalls()).toHaveLength(0);

    // A label is held once per group: a second B is refused even with only two options.
    const other = randomUUID();
    const dup = await post({
      lockEpoch: 0,
      changes: [
        optionChange(randomUUID(), 0, other, 'B'),
        optionChange(randomUUID(), 0, other, 'B'),
      ],
    });
    expect(dup.res.status).toBe(400);
    expect(await storedOptions(other)).toEqual([]);

    // Another group has its own three.
    const second = await post({
      lockEpoch: 0,
      changes: [optionChange(randomUUID(), 0, other, 'A')],
    });
    expect(second.res.status).toBe(200);

    // Removing C frees its place: a new C saves.
    const removed = await post({ lockEpoch: 0, changes: [{ id: C, baseSeq: 1, deleted: true }] });
    expect(removed.res.status).toBe(200);
    const again = await post({ lockEpoch: 0, changes: [optionChange(D, 0, group, 'C')] });
    expect(again.res.status).toBe(200);
    expect((await storedOptions(group)).map((r) => r.object_id)).toEqual([A, B, D]);
  }, 120000);

  it("AC-2 option B's patches change the displayed model and leave the saved working copy unchanged", async () => {
    const W = randomUUID();
    const saved = await post({ lockEpoch: 0, changes: [wallChange(W, 0, floorId, 144)] });
    expect(saved.res.status).toBe(200);
    const before = await storedRow(W);

    const patched = wallChange(W, 0, floorId, 180).data;
    const group = randomUUID();
    const B = randomUUID();
    const res = await post({
      lockEpoch: 0,
      changes: [
        optionChange(B, 0, group, 'B', {
          modelDelta: [{ op: 'replace', object: { id: W, type: 'wall', data: patched } }],
        }),
      ],
    });
    expect(res.res.status).toBe(200);

    // The stored wall is the same row it was before the option was saved.
    const after = await storedRow(W);
    expect(after).toEqual(before);
    expect((after.data as { geometry: { end: { x: number } } }).geometry.end.x).toBe(144);

    // The displayed model: the loaded working copy with B applied.
    const rows = await harnessSql()<
      { object_id: string; type: string; schema_version: number; data: unknown }[]
    >`select object_id, type, schema_version, data from public.model_object
      where project_id = ${project}::uuid and not deleted`;
    const working = rows.map((r) => {
      const p = parseStoredObject({
        id: r.object_id,
        type: r.type,
        schema_version: r.schema_version,
        data: r.data,
      });
      if (!p.ok) throw new Error(`stored ${r.type} did not parse`);
      return p.object;
    });
    const optionB = working.find((o) => o.id === B);
    if (optionB?.type !== 'design_option') throw new Error('option B not stored');
    const shown = applyDesignOption(working, optionB.data);
    expect(shown.skipped).toEqual([]);
    const wall = (list: ModelObject[]) => list.find((o) => o.id === W);
    const shownWall = wall(shown.objects);
    expect(shownWall?.type === 'wall' && shownWall.data.geometry.end.x).toBe(180);
    const workingWall = wall(working);
    expect(workingWall?.type === 'wall' && workingWall.data.geometry.end.x).toBe(144);
  }, 120000);

  it('AC-3 a new option fires design_option.created; a status change fires design_option.updated', async () => {
    const group = randomUUID();
    const B = randomUUID();
    const made = await post({ lockEpoch: 0, changes: [optionChange(B, 0, group, 'B')] });
    expect(made.res.status).toBe(200);
    expect(emitMock.mock.calls.map((c) => c[0])).toEqual(['model.saved', 'design_option.created']);
    expect(optionCalls()[0]![1]).toEqual({
      optionId: B,
      groupId: group,
      label: 'B',
      status: 'draft',
    });
    expect(optionCalls()[0]![2]).toEqual({
      tenantId: tenant,
      projectId: project,
      actorId: editor.appUserId,
    });

    const sent = await post({
      lockEpoch: 0,
      changes: [optionChange(B, 1, group, 'B', { status: 'sent' })],
    });
    expect(sent.res.status).toBe(200);
    expect(optionCalls()).toHaveLength(1);
    expect(optionCalls()[0]![0]).toBe('design_option.updated');
    expect(optionCalls()[0]![1]).toEqual({
      optionId: B,
      groupId: group,
      label: 'B',
      status: 'sent',
    });

    // A wall-only save fires neither.
    const walls = await post({ lockEpoch: 0, changes: [wallChange(randomUUID(), 0, floorId)] });
    expect(walls.res.status).toBe(200);
    expect(optionCalls()).toHaveLength(0);
  }, 120000);

  it('a failed option emit is reported and the save still answers 200', async () => {
    const C = randomUUID();
    state.store = new Map(cookies);
    const { POST } = await import('./route');
    emitMock.mockClear();
    reportMock.mockClear();
    emitMock
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('ezd1009-probe'));
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [APP_BUILD_HEADER]: String(appBuild()),
          'x-ezdraft-membership': editor.membershipId,
        },
        body: JSON.stringify({ lockEpoch: 0, changes: [optionChange(C, 0, randomUUID(), 'C')] }),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    expect(res.status).toBe(200);
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect((reportMock.mock.calls[0]![0] as Error).message).toBe('design_option_event_failed');
  }, 120000);
});
