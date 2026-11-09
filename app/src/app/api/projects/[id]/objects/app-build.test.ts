// EZD-299a T9 (vault/plans/EZD-299a.md section 4; Decided D-Order, D-Build, D-Resolves; AC-EZD-299-14, -11).
// next/headers is mocked and members sign in as in route.test.ts; emit is wrapped in vi.fn. Expected values:
// a save from an older build (header missing, not a number, or lower than EZD_APP_BUILD) is 409 `app_outdated`
// with the server's number in `x-ezdraft-app-build`, nothing written, no event; an equal or higher header
// passes; `resolves` outside 1..changes.length UUIDs without repeats (case-insensitive) is 400 `invalid_input`.
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
  signIn,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import { APP_BUILD_HEADER } from '../../../../../lib/app-version';
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

async function post(
  project: string,
  membershipId: string,
  body: unknown,
  build?: string,
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${project}/objects`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ezdraft-membership': membershipId,
        ...(build === undefined ? {} : { [APP_BUILD_HEADER]: build }),
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: project }) },
  );
  return { res, json: JSON.parse(await res.text()) as unknown };
}

let floorId = '';
const wall = (id: string) => ({
  id,
  baseSeq: 0,
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
const saved = async (project: string, id: string): Promise<number> =>
  (
    await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.model_object
      where project_id = ${project}::uuid and object_id = ${id}::uuid`
  )[0].n;

describe('EZD-299a objects route app build check', () => {
  let tenant = '';
  let project = '';
  let editor: Member;
  let cookies: Map<string, string>;
  let releaseLock: () => Promise<void>;

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
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

  beforeEach(() => {
    vi.stubEnv('EZD_APP_BUILD', '200');
    state.store = new Map(cookies);
  });

  afterEach(() => {
    state.store = new Map();
    vi.unstubAllEnvs();
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

  it('EZD-299a T9 refuses a save from an older build and writes nothing', async () => {
    for (const build of ['199', undefined, 'abc']) {
      state.store = new Map(cookies);
      const id = randomUUID();
      const { res, json } = await post(
        project,
        editor.membershipId,
        { lockEpoch: 0, changes: [wall(id)] },
        build,
      );
      expect(res.status, `header ${String(build)}`).toBe(409);
      expect(json).toEqual({ error: { code: 'app_outdated', message_key: 'error.app_outdated' } });
      expect(res.headers.get('x-ezdraft-app-build')).toBe('200');
      expect(res.headers.get('cache-control') ?? '').toContain('no-store');
      expect(await saved(project, id)).toBe(0);
    }
    expect(emitMock).not.toHaveBeenCalled();
  }, 120000);

  it('EZD-299a T9 accepts an equal or newer build', async () => {
    for (const build of ['200', '201']) {
      state.store = new Map(cookies);
      const id = randomUUID();
      const { res, json } = await post(
        project,
        editor.membershipId,
        { lockEpoch: 0, changes: [wall(id)] },
        build,
      );
      expect(res.status, `header ${build}`).toBe(200);
      expect(json).toEqual({ objects: [{ id, updatedSeq: 1 }] });
    }
  }, 120000);

  it('EZD-299a T9 refuses a bad resolves list, then resolves one recorded row', async () => {
    const id = randomUUID();
    const wallId = randomUUID();
    const session = await signIn(editor.email);
    const recorded = await session.serverDb.rpc('record_sync_conflicts', {
      p_project: project,
      p_changes: [
        {
          id: wallId,
          base_seq: 0,
          reason: 'conflict',
          deleted: false,
          type: 'wall',
          schema_version: 3,
          data: { attributes: { number: 4 } },
        },
      ],
      p_payload: { count: '1', names: 'Wall 4', more: '0' },
    });
    expect(recorded.error).toBeNull();
    const rowId = (recorded.data as { ids: string[] }).ids[0];

    const upper = randomUUID().toUpperCase();
    const bad: unknown[] = [
      'x',
      [],
      [null],
      ['not-a-uuid'],
      [upper, upper.toLowerCase()],
      [randomUUID(), randomUUID()],
    ];
    for (const resolves of bad) {
      state.store = new Map(cookies);
      const { res, json } = await post(
        project,
        editor.membershipId,
        { lockEpoch: 0, changes: [wall(id)], resolves },
        '200',
      );
      expect(res.status, JSON.stringify(resolves)).toBe(400);
      expect(json).toEqual({
        error: { code: 'invalid_input', message_key: 'error.invalid_input' },
      });
    }
    expect(await saved(project, id)).toBe(0);

    state.store = new Map(cookies);
    const ok = await post(
      project,
      editor.membershipId,
      { lockEpoch: 0, changes: [wall(wallId)], resolves: [rowId] },
      '200',
    );
    expect(ok.res.status).toBe(200);
    expect(ok.json).toEqual({ objects: [{ id: wallId, updatedSeq: 1 }], resolved: [rowId] });
  }, 120000);
});
