// EZD-122 R4 (AC-EZD-122-1, -5, -6; S20 "Revert: Edit lock. Sent versions stay unchanged"; Q-0700 03 "Revert", 10
// "Edit model and the lock: Revert"; 03b rule 5; S20 Events emitted). Sign-in and mocks as
// app/src/app/api/projects/[id]/checkpoints/route.test.ts. Expected values: 401; 403 without Edit model; 400 for a
// bad body and `invalid_object` for a version whose objects fail to parse; 409 `stale_lock_epoch` for a wrong
// generation; 200 `{ version: { id } }`, a new working version labelled "Revert from <label>"; an event_log row
// version.reverted.
import { randomUUID } from 'node:crypto';
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
  signIn,
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

async function revert(
  id: string,
  versionId: string,
  body: unknown,
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/versions/${versionId}/revert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id, versionId }) },
  );
  return { res, json: await res.json() };
}

describe('EZD-122 Revert route', () => {
  let tenant = '';
  let project = '';
  let good = '';
  let bad = '';
  let epoch = 0;
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
    const s = await signIn(editor.email);
    const acquired = await s.serverDb.rpc('acquire_edit_lock', {
      p_project: project,
      p_device_id: 'dev-a',
    });
    if (acquired.error) throw new Error(acquired.error.message);
    epoch = Number((acquired.data as { lock_epoch: number }).lock_epoch);
    const [g] = await harnessSql()<{ id: string }[]>`
      select private.make_checkpoint(${project}::uuid, null, 'stop_editing') as id`;
    good = g.id;
    // A version whose one object no longer parses (an unknown type).
    const [b] = await harnessSql()<{ id: string }[]>`
      insert into public.model_version (project_id, tenant_id, model_json, schema_version)
      values (${project}::uuid, ${tenant}::uuid,
        jsonb_build_object('objects', jsonb_build_array(jsonb_build_object(
          'id', ${randomUUID()}::text, 'type', 'no_such_type', 'schema_version', 1, 'data', '{}'::jsonb))), 1)
      returning id`;
    bad = b.id;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R4 refuses no session, a viewer, a bad body, a bad version and a stale generation; reverts for the holder', async () => {
    const count = async () =>
      (
        await harnessSql()<{ n: string }[]>`select count(*)::text as n from public.model_version
          where project_id = ${project}::uuid`
      )[0].n;
    const start = await count();

    state.store = new Map();
    expect((await revert(project, good, { lockEpoch: epoch, label: 'Oct 3' })).res.status).toBe(
      401,
    );

    state.store = new Map(viewerCookies);
    expect((await revert(project, good, { lockEpoch: epoch, label: 'Oct 3' })).res.status).toBe(
      403,
    );

    state.store = new Map(editorCookies);
    expect((await revert(project, good, { lockEpoch: -1, label: 'Oct 3' })).res.status).toBe(400);
    expect((await revert(project, good, { lockEpoch: epoch, label: ' ' })).res.status).toBe(400);
    const b = await revert(project, bad, { lockEpoch: epoch, label: 'Oct 3' });
    expect(b.res.status).toBe(400);
    expect((b.json as { error: { code: string } }).error.code).toBe('invalid_object');
    const c = await revert(project, good, { lockEpoch: epoch + 1, label: 'Oct 3' });
    expect(c.res.status).toBe(409);
    expect(c.json).toEqual({
      error: { code: 'stale_lock_epoch', message_key: 'error.stale_lock_epoch' },
    });
    expect(await count()).toBe(start);

    const d = await revert(project, good, { lockEpoch: epoch, label: 'Oct 3 · 2:40 PM' });
    expect(d.res.status).toBe(200);
    const id = (d.json as { version: { id: string } }).version.id;
    const [row] = await harnessSql()<{ cause: string; label: string }[]>`
      select cause, label from public.model_version where id = ${id}::uuid`;
    expect(row).toEqual({ cause: 'revert', label: 'Revert from Oct 3 · 2:40 PM' });
    // The checkpoint of the working copy first, then the new working version.
    expect(Number(await count())).toBe(Number(start) + 2);
    const logs = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.event_log
      where object_id = ${project}::uuid and action = 'version.reverted'`;
    expect(logs[0].n).toBe('1');
  }, 120000);
});
