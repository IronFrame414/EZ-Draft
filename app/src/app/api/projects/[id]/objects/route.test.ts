// EZD-120a R1 (vault/plans/EZD-120a.md section 3 route and event rows, section 4; AC-EZD-120a-1 to -3, -5,
// -6). next/headers is mocked and members sign in as in app/src/app/api/settings/customers/route.test.ts;
// emit is wrapped in vi.fn the same way. Expected values: section 3 (200 `{ objects: [{ id, updatedSeq }] }`,
// 409 bodies, `model.saved` payload and ctx), Decided "Error mapping" (401, 403 `error.not_authorized`,
// 404 `project_not_found`, 400 `invalid_input`, `Cache-Control: no-store`).
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
// EZD-120d (Decided "Membership check"): every signed-in save sends its member's id in this header.
async function post(
  id: string,
  raw: string,
  membershipId?: string,
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/objects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [APP_BUILD_HEADER]: String(appBuild()),
        ...(membershipId === undefined ? {} : { 'x-ezdraft-membership': membershipId }),
      },
      body: raw,
    }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: await parse(res) };
}
// EZD-202 E1: the route validates each object (parseStoredObject), and a wall must name a live floor of its
// project, so the data is a full wall on `project`'s first floor.
let floorId = '';
const upsertChange = (id: string, baseSeq: number) => ({
  id,
  baseSeq,
  deleted: false,
  type: 'wall',
  schemaVersion: 1,
  data: {
    geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
    status: 'new',
    level: floorId,
    attributes: {
      thickness: 4.5,
      thicknessSide: 'right',
      height: 96,
      topCutToCeiling: false,
      bearing: false,
    },
  },
});
const body = (lockEpoch: number, changes: unknown[]) => JSON.stringify({ lockEpoch, changes });
const noStore = (r: Response) => expect(r.headers.get('cache-control') ?? '').toContain('no-store');

describe('EZD-120a save route', () => {
  let tenant = '';
  let project = '';
  let unlistedProject = '';
  let editor: Member;
  let plain: Member;
  let listed: Member;
  let editorCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  let listedCookies: Map<string, string>;
  let releaseLock: () => Promise<void>;

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    tenant = await createTenant();
    [project, unlistedProject] = await createProjects(tenant, 2);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, ['view_projects']);
    listed = await createMember({
      tenantId: tenant,
      scope: 'listed',
      listed: [project],
    });
    await setPermissions(tenant, listed.membershipId, ['view_projects', 'edit_model']);
    floorId = (
      await harnessSql()<{ object_id: string }[]>`
        select object_id from public.model_object
        where project_id = ${project}::uuid and type = 'floor'`
    )[0].object_id;
    editorCookies = await cookiesFor(editor.email);
    plainCookies = await cookiesFor(plain.email);
    listedCookies = await cookiesFor(listed.email);
  }, 180000);

  beforeEach(async () => {
    await harnessSql()`delete from public.error_alert`;
  });

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

  it('R1 refuses a missing session, a missing switch, a bad id, an unlisted project and a bad body, with no event', async () => {
    const valid = body(0, [upsertChange(randomUUID(), 0)]);
    const rowsBefore =
      await harnessSql()`select 1 from public.model_object where project_id = ${project}::uuid`;

    state.store = new Map();
    const a = await post(project, valid);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);
    noStore(a.res);

    state.store = new Map(plainCookies);
    const b = await post(project, valid, plain.membershipId);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);
    noStore(b.res);

    state.store = new Map(editorCookies);
    const c = await post('nope', valid, editor.membershipId);
    expect(c.res.status).toBe(404);
    expect(c.json).toEqual(err('project_not_found'));
    noStore(c.res);

    state.store = new Map(listedCookies);
    const d = await post(unlistedProject, valid, listed.membershipId);
    expect(d.res.status).toBe(404);
    expect(d.json).toEqual(err('project_not_found'));
    noStore(d.res);

    state.store = new Map(editorCookies);
    const e = await post(project, 'this is not json', editor.membershipId);
    expect(e.res.status).toBe(400);
    expect(e.json).toEqual(err('invalid_input'));
    noStore(e.res);

    state.store = new Map(editorCookies);
    const f = await post(project, JSON.stringify({ changes: [] }), editor.membershipId);
    expect(f.res.status).toBe(400);
    expect(f.json).toEqual(err('invalid_input'));
    noStore(f.res);

    expect(emitMock).not.toHaveBeenCalled();
    expect(
      await harnessSql()`select 1 from public.model_object where project_id = ${project}::uuid`,
    ).toHaveLength(rowsBefore.length);
  }, 120000);

  it('R1 saves with one model.saved event, answers 409 for a stale epoch and a conflict, and survives a failed emit', async () => {
    const id = randomUUID();
    state.store = new Map(editorCookies);
    const ok = await post(project, body(0, [upsertChange(id, 0)]), editor.membershipId);
    expect(ok.res.status).toBe(200);
    expect(ok.json).toEqual({ objects: [{ id, updatedSeq: 1 }] });
    noStore(ok.res);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'model.saved',
      { objectIds: [id] },
      { tenantId: tenant, projectId: project, actorId: editor.appUserId },
    );

    emitMock.mockClear();
    state.store = new Map(editorCookies);
    const stale = await post(
      project,
      body(1, [upsertChange(randomUUID(), 0)]),
      editor.membershipId,
    );
    expect(stale.res.status).toBe(409);
    expect(stale.json).toEqual({
      error: { code: 'stale_lock_epoch', message_key: 'error.stale_lock_epoch' },
    });
    noStore(stale.res);

    state.store = new Map(editorCookies);
    const conflict = await post(project, body(0, [upsertChange(id, 0)]), editor.membershipId);
    expect(conflict.res.status).toBe(409);
    expect(conflict.json).toEqual({
      error: { code: 'save_conflict', message_key: 'error.save_conflict' },
      conflicts: [{ id, serverSeq: 1 }],
    });
    noStore(conflict.res);
    expect(emitMock).not.toHaveBeenCalled();

    const id2 = randomUUID();
    emitMock.mockRejectedValueOnce(new Error('ezd120a-probe'));
    state.store = new Map(editorCookies);
    const survived = await post(project, body(0, [upsertChange(id2, 0)]), editor.membershipId);
    expect(survived.res.status).toBe(200);
    expect(survived.json).toEqual({ objects: [{ id: id2, updatedSeq: 1 }] });
    noStore(survived.res);
    expect(emitMock).toHaveBeenCalledTimes(1);
    const stored = await harnessSql()`select 1 from public.model_object
      where project_id = ${project}::uuid and object_id = ${id2}::uuid`;
    expect(stored).toHaveLength(1);
  }, 120000);
});
