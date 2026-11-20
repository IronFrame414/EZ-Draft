// EZD-122 R3 (AC-EZD-122-4, -6; S20 "Name snapshot: Edit model"; Q-0700 10 "Edit model: Name snapshot (no lock)";
// Q-0700 05 "trimmed and non-empty"; S20 Events emitted). Sign-in and mocks as
// app/src/app/api/projects/[id]/checkpoints/route.test.ts. Expected values: 401; 403 without Edit model; 400 for an
// empty name; 409 `version_not_working` for a sent row; 200 `{ version: { id, label } }` with the trimmed name; an
// event_log row version.snapshot_named.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cookiesFor } from '../../../../../../../../test-harness/lock/route-session';
import { setPermissions } from '../../../../../../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../../../test-harness/rls/fixtures';

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

async function name(
  id: string,
  versionId: string,
  body: unknown,
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/versions/${versionId}/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id, versionId }) },
  );
  return { res, json: await res.json() };
}

describe('EZD-122 Name snapshot route', () => {
  let tenant = '';
  let project = '';
  let working = '';
  let sent = '';
  let editorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    editorCookies = await cookiesFor(editor.email);
    viewerCookies = await cookiesFor(viewer.email);
    const [w] = await harnessSql()<{ id: string }[]>`
      select private.make_checkpoint(${project}::uuid, null, 'stop_editing') as id`;
    working = w.id;
    const [s] = await harnessSql()<{ id: string }[]>`
      insert into public.model_version
        (project_id, tenant_id, model_json, schema_version, is_sent, version_no, sent_to, sent_at)
      values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, true, 1, 'Zed Co', now())
      returning id`;
    sent = s.id;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R3 refuses no session, a viewer, an empty name and a sent row; names a working row', async () => {
    state.store = new Map();
    expect((await name(project, working, { name: 'Kept' })).res.status).toBe(401);

    state.store = new Map(viewerCookies);
    const b = await name(project, working, { name: 'Kept' });
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });

    state.store = new Map(editorCookies);
    const c = await name(project, working, { name: '   ' });
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual({
      error: { code: 'invalid_input', message_key: 'error.invalid_input' },
    });

    const d = await name(project, sent, { name: 'Kept' });
    expect(d.res.status).toBe(409);
    expect(d.json).toEqual({
      error: { code: 'version_not_working', message_key: 'error.version_not_working' },
    });

    const e = await name(project, working, { name: '  Pre-permit check ' });
    expect(e.res.status).toBe(200);
    expect(e.json).toEqual({ version: { id: working, label: 'Pre-permit check' } });
    const [row] = await harnessSql()<{ is_snapshot: boolean; label: string }[]>`
      select is_snapshot, label from public.model_version where id = ${working}::uuid`;
    expect(row).toEqual({ is_snapshot: true, label: 'Pre-permit check' });
    const logs = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.event_log
      where object_id = ${project}::uuid and action = 'version.snapshot_named'`;
    expect(logs[0].n).toBe('1');
  }, 120000);
});
