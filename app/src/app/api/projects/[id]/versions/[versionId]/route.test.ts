// EZD-122 R2 (AC-EZD-122-3, -10; S20 "Version row: opens the version read-only"; 03b rule 5). Sign-in and mocks as
// app/src/app/api/projects/[id]/checkpoints/route.test.ts. Expected values: 401, 403, 404 `project_not_found` or
// `version_not_found` (another project's version included); 200 `{ version: { id, objects }, invalid }`, the objects
// at the current schema version.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cookiesFor } from '../../../../../../../test-harness/lock/route-session';
import { setPermissions } from '../../../../../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../../test-harness/rls/fixtures';

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

async function read(id: string, versionId: string): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/versions/${versionId}`), {
    params: Promise.resolve({ id, versionId }),
  });
  return { res, json: await res.json() };
}

const VERSION_NOT_FOUND = {
  error: { code: 'version_not_found', message_key: 'error.version_not_found' },
};

describe('EZD-122 version read route', () => {
  let tenant = '';
  let project = '';
  let second = '';
  let version = '';
  let floor = '';
  let viewerCookies: Map<string, string>;
  let noneCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    [project, second] = await createProjects(tenant, 2);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    const none = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, none.membershipId, []);
    viewerCookies = await cookiesFor(viewer.email);
    noneCookies = await cookiesFor(none.email);
    // The project's own checkpoint: its floor, as make_checkpoint writes it.
    const [v] = await harnessSql()<{ id: string }[]>`
      select private.make_checkpoint(${project}::uuid, null) as id`;
    version = v.id;
    const [f] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
    floor = f.object_id;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it("R2 refuses no session, no View projects and another project's version; answers the objects", async () => {
    state.store = new Map();
    expect((await read(project, version)).res.status).toBe(401);

    state.store = new Map(noneCookies);
    expect((await read(project, version)).res.status).toBe(403);

    state.store = new Map(viewerCookies);
    expect((await read(project, 'nope')).json).toEqual(VERSION_NOT_FOUND);
    const cross = await read(second, version);
    expect(cross.res.status).toBe(404);
    expect(cross.json).toEqual(VERSION_NOT_FOUND);

    const ok = await read(project, version);
    expect(ok.res.status).toBe(200);
    const body = ok.json as {
      version: { id: string; objects: { id: string; type: string; schemaVersion: number }[] };
      invalid: unknown[];
    };
    expect(body.version.id).toBe(version);
    expect(body.version.objects.map((o) => [o.id, o.type, o.schemaVersion])).toEqual([
      [floor, 'floor', CURRENT_SCHEMA_VERSION],
    ]);
    expect(body.invalid).toEqual([]);
  }, 120000);
});
