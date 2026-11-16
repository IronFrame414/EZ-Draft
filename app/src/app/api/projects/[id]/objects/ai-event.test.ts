// EZD-5605 T3, T4 (vault/plans/EZD-5605.md section 4; D-Marker; Q-0638 gap 11; AC-EZD-5605-2, -5): a save marked
// `assistant: true` emits `model.ai_change_accepted` after `model.saved`, with the request's ids (removes included)
// and count and the saving user, and no other payload; no emit without the flag or on a refusal; a failed emit is
// reported and the save still answers 200. Same sign-in and mocks as closure-event.test.ts beside it.
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

describe('EZD-5605 model.ai_change_accepted on save', () => {
  let tenant = '';
  let project = '';
  let floorId = '';
  let editor: Member;
  let cookies: Map<string, string>;
  let releaseLock: () => Promise<void>;

  const post = async (body: Record<string, unknown>, build = String(appBuild())) => {
    state.store = new Map(cookies);
    emitMock.mockClear();
    reportMock.mockClear();
    const { POST } = await import('./route');
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [APP_BUILD_HEADER]: build,
          'x-ezdraft-membership': editor.membershipId,
        },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    return { res, json: JSON.parse(await res.text()) as unknown };
  };
  const names = () => emitMock.mock.calls.map((c) => c[0]);
  const aiCalls = () => emitMock.mock.calls.filter((c) => c[0] === 'model.ai_change_accepted');

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

  it('T3 a flagged save emits after model.saved with the request ids; an unflagged one does not', async () => {
    const A = randomUUID();
    const B = randomUUID();
    const C = randomUUID();
    const seed = await post({ lockEpoch: 0, changes: [wallChange(C, 0, floorId)] });
    expect(seed.res.status).toBe(200);
    expect(names()).toEqual(['model.saved']);

    const flagged = await post({
      lockEpoch: 0,
      assistant: true,
      changes: [
        wallChange(A, 0, floorId),
        wallChange(B, 0, floorId, 96),
        { id: C, baseSeq: 1, deleted: true },
      ],
    });
    expect(flagged.res.status).toBe(200);
    expect(names()).toEqual(['model.saved', 'model.ai_change_accepted']);
    const [, payload, ctx] = aiCalls()[0]!;
    expect(payload).toEqual({ objectIds: [A, B, C], count: 3 });
    expect(ctx).toEqual({ tenantId: tenant, projectId: project, actorId: editor.appUserId });

    const D = randomUUID();
    const plain = await post({ lockEpoch: 0, changes: [wallChange(D, 0, floorId)] });
    expect(plain.res.status).toBe(200);
    expect(names()).toEqual(['model.saved']);
  }, 120000);

  it('T4 no AI event on a refusal or an outdated build; a failed AI emit still answers 200', async () => {
    const E = randomUUID();
    const first = await post({ lockEpoch: 0, changes: [wallChange(E, 0, floorId)] });
    expect(first.res.status).toBe(200);

    const conflict = await post({
      lockEpoch: 0,
      assistant: true,
      changes: [wallChange(E, 0, floorId, 100)],
    });
    expect(conflict.res.status).toBe(409);
    expect(aiCalls()).toHaveLength(0);

    // An app build header that is not a number counts as an older build (isOlderBuild).
    const outdated = await post(
      { lockEpoch: 0, assistant: true, changes: [wallChange(randomUUID(), 0, floorId)] },
      'old',
    );
    expect(outdated.res.status).toBe(409);
    expect(emitMock).not.toHaveBeenCalled();

    const bad = await post({
      lockEpoch: 0,
      assistant: 'true',
      changes: [wallChange(randomUUID(), 0, floorId)],
    });
    expect(bad.res.status).toBe(400);
    expect(emitMock).not.toHaveBeenCalled();

    const G = randomUUID();
    state.store = new Map(cookies);
    const { POST } = await import('./route');
    emitMock.mockClear();
    reportMock.mockClear();
    emitMock
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('ezd5605-probe'));
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [APP_BUILD_HEADER]: String(appBuild()),
          'x-ezdraft-membership': editor.membershipId,
        },
        body: JSON.stringify({
          lockEpoch: 0,
          assistant: true,
          changes: [wallChange(G, 0, floorId)],
        }),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text())).toEqual({
      objects: [{ id: G, updatedSeq: 1, number: expect.any(Number) }],
    });
    expect(names()).toEqual(['model.saved', 'model.ai_change_accepted']);
    expect(reportMock).toHaveBeenCalledTimes(1);
    expect((reportMock.mock.calls[0]![0] as Error).message).toBe(
      'model_ai_change_accepted_event_failed',
    );
  }, 120000);
});
