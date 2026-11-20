// EZD-122 R1 (AC-EZD-122-2, -9; S20 Permissions "View: View projects"; Q-0700 10). Sign-in and mocks as
// app/src/app/api/projects/[id]/checkpoints/route.test.ts. Expected values: 401, 403 `error.not_authorized`, 404
// `project_not_found`; 200 `{ versions }` newest first, empty for a project with no checkpoint, no document, no email.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cookiesFor } from '../../../../../../test-harness/lock/route-session';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../test-harness/rls/fixtures';

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

async function list(id: string): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/versions`), {
    params: Promise.resolve({ id }),
  });
  return { res, json: await res.json() };
}

describe('EZD-122 versions list route', () => {
  let tenant = '';
  let project = '';
  let empty = '';
  let viewerCookies: Map<string, string>;
  let noneCookies: Map<string, string>;
  let otherCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    [project, empty] = await createProjects(tenant, 2);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    const none = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, none.membershipId, []);
    const other = await createTenant();
    const o = await createMember({ tenantId: other, scope: 'all' });
    await setPermissions(other, o.membershipId, ['view_projects']);
    viewerCookies = await cookiesFor(viewer.email);
    noneCookies = await cookiesFor(none.email);
    otherCookies = await cookiesFor(o.email);
    await harnessSql()`
      insert into public.model_version (project_id, tenant_id, model_json, schema_version, cause, created_at)
      values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, 'stop_editing', now() - interval '1 day'),
             (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, 'finish_import', now())`;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 refuses no session, no View projects, a bad id and another company; lists for a viewer', async () => {
    state.store = new Map();
    expect((await list(project)).res.status).toBe(401);

    state.store = new Map(noneCookies);
    const b = await list(project);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });

    state.store = new Map(viewerCookies);
    const c = await list('nope');
    expect(c.res.status).toBe(404);
    expect(c.json).toEqual({
      error: { code: 'project_not_found', message_key: 'error.project_not_found' },
    });

    state.store = new Map(otherCookies);
    expect((await list(project)).res.status).toBe(404);

    state.store = new Map(viewerCookies);
    const d = await list(project);
    expect(d.res.status).toBe(200);
    expect(d.res.headers.get('cache-control')).toBe('no-store');
    const versions = (d.json as { versions: { cause: string }[] }).versions;
    expect(versions.map((v) => v.cause)).toEqual(['finish_import', 'stop_editing']);
    expect(JSON.stringify(d.json)).not.toContain('model_json');

    const e = await list(empty);
    expect(e.json).toEqual({ versions: [] });
  }, 120000);
});
