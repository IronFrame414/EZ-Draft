// EZD-205b RC1 to RC4: `room.closure_overridden` on save (vault/plans/EZD-205b.md section 1 Decided "Override
// check", "saveObjects order", "Emit"; section 3 route and event rows; section 4; AC-EZD-205-4, AC-EZD-205-6).
// Expected values: S02 Events; Q-0570; P120a Decided Event; CLAUDE.md rule 18; L-061. Same sign-in and mocks as
// membership.test.ts beside it.
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
import { emit } from '../../../../../server/events';

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

type Override = { who: string; when: string; gap: { x: number; y: number } };
const ov = (
  who: string,
  when = '2026-11-06T12:00:00.000Z',
  gap: { x: number; y: number } = { x: 0, y: -0.5 },
): Override => ({ who, when, gap });

const refusedFor = (id: string) => ({
  error: { code: 'invalid_object', message_key: 'error.invalid_input' },
  invalid: [{ id, issue: 'override_other_user' }],
});

describe('EZD-205b room.closure_overridden on save', () => {
  let tenant = '';
  let project = '';
  let floorId = '';
  let editor: Member;
  let editor2: Member;
  let cookies1: Map<string, string>;
  let cookies2: Map<string, string>;
  let releaseLock: () => Promise<void>;

  const roomChange = (id: string, baseSeq: number, override: Override | null, name = 'Room 1') => ({
    id,
    baseSeq,
    deleted: false,
    type: 'room',
    schemaVersion: 3,
    data: {
      geometry: {
        boundary: [
          { x: 0, y: 0 },
          { x: 144, y: 0 },
          { x: 144, y: 120 },
          { x: 0, y: 120 },
          { x: 0, y: 0.5 },
        ],
      },
      status: 'existing',
      level: floorId,
      attributes: { name },
      closureOverride: override,
    },
  });
  const post = async (as: Member, changes: unknown[]) => {
    state.store = new Map(as.membershipId === editor.membershipId ? cookies1 : cookies2);
    emitMock.mockClear();
    const { POST } = await import('./route');
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-ezdraft-membership': as.membershipId },
        body: JSON.stringify({ lockEpoch: 0, changes }),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    return { res, json: JSON.parse(await res.text()) as unknown };
  };
  const emitNames = () => emitMock.mock.calls.map((c) => c[0]);
  const closureCalls = () => emitMock.mock.calls.filter((c) => c[0] === 'room.closure_overridden');
  const row = async (id: string) =>
    harnessSql()<{ data: { closureOverride: unknown }; updated_seq: number }[]>`
      select data, updated_seq from public.model_object
      where project_id = ${project}::uuid and object_id = ${id}::uuid`;
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    editor2 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor2.membershipId, ['view_projects', 'edit_model']);
    floorId = (
      await harnessSql()<{ object_id: string }[]>`
        select object_id from public.model_object
        where project_id = ${project}::uuid and type = 'floor'`
    )[0].object_id;
    cookies1 = await cookiesFor(editor.email);
    cookies2 = await cookiesFor(editor2.email);
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

  it('RC1 a new or changed override emits once per room after model.saved; an unchanged one does not', async () => {
    const A = randomUUID();
    const B = randomUUID();
    const me = editor.appUserId;
    const ctx = { tenantId: tenant, projectId: project, actorId: me };

    const first = await post(editor, [
      roomChange(A, 0, ov(me)),
      roomChange(B, 0, ov(me, '2026-11-06T12:00:00.000Z', { x: -0.5, y: -0.5 })),
    ]);
    expect(first.res.status).toBe(200);
    expect(first.json).toEqual({
      objects: [
        { id: A, updatedSeq: 1 },
        { id: B, updatedSeq: 1 },
      ].sort(byId),
    });
    expect(emitNames()).toEqual([
      'model.saved',
      'room.closure_overridden',
      'room.closure_overridden',
    ]);
    const calls = closureCalls();
    expect(calls[0]![1]).toEqual({ roomId: A, gapIn: 0.5, userId: me });
    const pB = calls[1]![1] as { roomId: string; gapIn: number; userId: string };
    expect(pB.roomId).toBe(B);
    expect(pB.userId).toBe(me);
    expect(pB.gapIn).toBeCloseTo(0.7071067811865476, 12);
    expect(calls[0]![2]).toEqual(ctx);
    expect(calls[1]![2]).toEqual(ctx);
    expect((await row(A))[0]!.data.closureOverride).toEqual(ov(me));

    const renamed = await post(editor, [roomChange(A, 1, ov(me), 'Kitchen')]);
    expect(renamed.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved']);

    const changed = await post(editor, [
      roomChange(A, 2, ov(me, '2026-11-06T12:05:00.000Z'), 'Kitchen'),
    ]);
    expect(changed.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved', 'room.closure_overridden']);

    const cleared = await post(editor, [roomChange(A, 3, null, 'Kitchen')]);
    expect(cleared.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved']);
  }, 120000);

  it('RC2 an override naming another user is refused unless it is unchanged', async () => {
    const C = randomUUID();
    const D = randomUUID();
    const e1 = editor.appUserId;
    const e2 = editor2.appUserId;

    const c = await post(editor, [roomChange(C, 0, ov(e2))]);
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(refusedFor(C));
    expect(await row(C)).toHaveLength(0);
    expect(emitMock).not.toHaveBeenCalled();

    const d0 = await post(editor, [roomChange(D, 0, ov(e1))]);
    expect(d0.res.status).toBe(200);

    const rename = await post(editor2, [roomChange(D, 1, ov(e1), 'Hall')]);
    expect(rename.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved']);

    const gapChange = await post(editor2, [
      roomChange(D, 2, ov(e1, '2026-11-06T12:00:00.000Z', { x: 0, y: -0.25 }), 'Hall'),
    ]);
    expect(gapChange.res.status).toBe(400);
    expect(gapChange.json).toEqual(refusedFor(D));
    expect((await row(D))[0]!.updated_seq).toBe(2);

    const own = await post(editor2, [roomChange(D, 2, ov(e2), 'Hall')]);
    expect(own.res.status).toBe(200);
    const calls = closureCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0]![1] as { userId: string }).userId).toBe(e2);
  }, 120000);

  it('RC3 a failed closure emit still answers 200', async () => {
    const E = randomUUID();
    const me = editor.appUserId;
    state.store = new Map(cookies1);
    const { POST } = await import('./route');
    emitMock.mockClear();
    emitMock
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('ezd205b-probe'));
    const res = await POST(
      new Request(`http://localhost/api/projects/${project}/objects`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-ezdraft-membership': editor.membershipId,
        },
        body: JSON.stringify({ lockEpoch: 0, changes: [roomChange(E, 0, ov(me))] }),
      }),
      { params: Promise.resolve({ id: project }) },
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(await res.text())).toEqual({ objects: [{ id: E, updatedSeq: 1 }] });
    expect(emitMock).toHaveBeenCalledTimes(2);
    expect(emitNames()).toEqual(['model.saved', 'room.closure_overridden']);
    expect(await row(E)).toHaveLength(1);
  }, 120000);

  it('RC4 101 rooms in one save: every stored override is read', async () => {
    const me = editor.appUserId;
    const ids = Array.from({ length: 101 }, () => randomUUID());

    const first = await post(
      editor,
      ids.map((id) => roomChange(id, 0, ov(me))),
    );
    expect(first.res.status).toBe(200);
    expect(closureCalls()).toHaveLength(101);

    const second = await post(
      editor,
      ids.map((id) => roomChange(id, 1, ov(me), 'Room 2')),
    );
    expect(second.res.status).toBe(200);
    expect(emitNames()).toEqual(['model.saved']);
  }, 180000);
});
