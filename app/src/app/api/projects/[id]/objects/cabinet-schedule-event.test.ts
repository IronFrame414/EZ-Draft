// EZD-409 (S04 Events emitted "cabinet_schedule.updated (new)"; vault/build/assumptions.md EZD-409): a save that
// writes cabinet objects emits one `cabinet_schedule.updated` last, with the cabinet ids it wrote (removes carry no
// type, so only the run's new row lists stand for them); a save of walls only does not; a failed emit is reported and
// the save still answers 200. Same sign-in and mocks as ai-event.test.ts beside it.
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
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

const runChange = (id: string, floorId: string, base: string[]) => ({
  id,
  baseSeq: 0,
  deleted: false,
  type: 'cabinet_run',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: {
    geometry: { hostWallId: null, start: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
    level: floorId,
    attributes: { name: 'Back wall run', base, upper: [] },
  },
});
const boxChange = (id: string, floorId: string, code: string, width: number) => ({
  id,
  baseSeq: 0,
  deleted: false,
  type: 'cabinet_box',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: {
    status: 'new',
    level: floorId,
    attributes: {
      code,
      boxType: 'base',
      width,
      depth: 24,
      height: 34.5,
      faceLayout: 'drawer_door_1',
      hingeSide: 'left',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    },
  },
});

describe('EZD-409 cabinet_schedule.updated on save', () => {
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
  const names = () => emitMock.mock.calls.map((c) => c[0]);
  const cabinetCalls = () =>
    emitMock.mock.calls.filter((c) => c[0] === 'cabinet_schedule.updated');

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

  it('a save with cabinets emits once, last, with their ids; removes are stood for by the run; walls alone do not', async () => {
    const W = randomUUID();
    const RUN = randomUUID();
    const B15 = randomUUID();
    const B18 = randomUUID();
    const first = await post({
      lockEpoch: 0,
      changes: [
        wallChange(W, 0, floorId, 117.5),
        boxChange(B15, floorId, 'B15', 15),
        boxChange(B18, floorId, 'B18', 18),
        runChange(RUN, floorId, [B15, B18]),
      ],
    });
    expect(first.res.status).toBe(200);
    expect(names()).toEqual(['model.saved', 'cabinet_schedule.updated']);
    const [, payload, ctx] = cabinetCalls()[0]!;
    expect(payload).toEqual({ objectIds: [B15, B18, RUN] });
    expect(ctx).toEqual({ tenantId: tenant, projectId: project, actorId: editor.appUserId });

    // Delete B18: the run's new rows and the remove, as cabinetDeleteChanges sends them.
    const removed = await post({
      lockEpoch: 0,
      changes: [{ id: B18, baseSeq: 1, deleted: true }, { ...runChange(RUN, floorId, [B15]), baseSeq: 1 }],
    });
    expect(removed.res.status).toBe(200);
    expect(cabinetCalls()).toHaveLength(1);
    expect(cabinetCalls()[0]![1]).toEqual({ objectIds: [RUN] });

    const walls = await post({ lockEpoch: 0, changes: [wallChange(randomUUID(), 0, floorId)] });
    expect(walls.res.status).toBe(200);
    expect(names()).toEqual(['model.saved']);
  }, 120000);

  it('no event on a refused save; a failed emit is reported and the save still answers 200', async () => {
    const B21 = randomUUID();
    const seed = await post({ lockEpoch: 0, changes: [boxChange(B21, floorId, 'B21', 21)] });
    expect(seed.res.status).toBe(200);
    const conflict = await post({ lockEpoch: 0, changes: [boxChange(B21, floorId, 'B21', 21)] });
    expect(conflict.res.status).toBe(409);
    expect(cabinetCalls()).toHaveLength(0);

    const B24 = randomUUID();
    state.store = new Map(cookies);
    const { POST } = await import('./route');
    emitMock.mockClear();
    reportMock.mockClear();
    emitMock
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('ezd409-probe'));
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [APP_BUILD_HEADER]: String(appBuild()),
          'x-ezdraft-membership': editor.membershipId,
        },
        body: JSON.stringify({ lockEpoch: 0, changes: [boxChange(B24, floorId, 'B24', 24)] }),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    expect(res.status).toBe(200);
    expect(names()).toEqual(['model.saved', 'cabinet_schedule.updated']);
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect((reportMock.mock.calls[0]![0] as Error).message).toBe(
      'cabinet_schedule_updated_event_failed',
    );
  }, 120000);
});
