// EZD-123 R1 (AC-EZD-123-2, -5, -6; S20 Permissions "keep/delete in cleanup: Edit model, plus edit lock"; Q-0700 05
// "Users without Edit model never see the sheet"; Q-0700 10 "Edit model and the lock: ... cleanup Save choices").
// Sign-in and mocks as ../route.test.ts. Expected values: 401; 403 `error.not_authorized` without Edit model; 404
// `project_not_found` for a malformed id or another company's project; 400 `invalid_input`; GET 200 `{ rows,
// graceDays, ageDays }`; POST 200 `{ kept, deleted }` for the lock holder, 409 `stale_lock_epoch` for anyone else; an
// event_log row version.snapshot_named for each kept row.
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

async function list(id: string): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/versions/cleanup`), {
    params: Promise.resolve({ id }),
  });
  return { res, json: await res.json() };
}

async function save(id: string, body: unknown): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/versions/cleanup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: await res.json() };
}

async function seed(tenant: string, project: string, createdAt: string): Promise<string> {
  const [r] = await harnessSql()<{ id: string }[]>`
    insert into public.model_version
      (project_id, tenant_id, model_json, schema_version, created_at, cause, cleanup_shown_at)
    values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, ${createdAt}::timestamptz,
      'stop_editing', '2026-11-01T08:00:00Z')
    returning id`;
  return r.id;
}

describe('EZD-123 cleanup sheet route', () => {
  let tenant = '';
  let project = '';
  let holderCookies: Map<string, string>;
  let otherEditorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;
  let foreignCookies: Map<string, string>;
  let epoch = 0;
  let a = '';
  let b = '';

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    const holder = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, holder.membershipId, ['view_projects', 'edit_model']);
    const e2 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, e2.membershipId, ['view_projects', 'edit_model']);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    const other = await createTenant();
    const o = await createMember({ tenantId: other, scope: 'all' });
    await setPermissions(other, o.membershipId, ['view_projects', 'edit_model']);
    holderCookies = await cookiesFor(holder.email);
    otherEditorCookies = await cookiesFor(e2.email);
    viewerCookies = await cookiesFor(viewer.email);
    foreignCookies = await cookiesFor(o.email);
    a = await seed(tenant, project, '2026-09-01T10:00:00Z');
    b = await seed(tenant, project, '2026-09-02T10:00:00Z');
    const [l] = await harnessSql()<{ lock_epoch: string }[]>`
      insert into public.edit_lock (project_id, tenant_id, holder_app_user_id, lock_epoch, since)
      values (${project}::uuid, ${tenant}::uuid, ${holder.appUserId}::uuid, 3, now())
      on conflict (project_id) do update set holder_app_user_id = excluded.holder_app_user_id,
        lock_epoch = excluded.lock_epoch, since = excluded.since
      returning lock_epoch`;
    epoch = Number(l.lock_epoch);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 signed out: 401 for both methods', async () => {
    expect((await list(project)).res.status).toBe(401);
    expect((await save(project, { lockEpoch: 0, keep: [], remove: [] })).res.status).toBe(401);
  });

  it('R2 without Edit model: 403 not_authorized; the sheet is never read (AC-EZD-123-5, -6)', async () => {
    state.store = new Map(viewerCookies);
    const r = await list(project);
    expect(r.res.status).toBe(403);
    expect(r.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
    const s = await save(project, { lockEpoch: epoch, keep: [], remove: [a] });
    expect(s.res.status).toBe(403);
  });

  it('R3 another company: 404 project_not_found; a malformed id: 404 (rule 4)', async () => {
    state.store = new Map(foreignCookies);
    expect((await list(project)).res.status).toBe(404);
    expect((await save(project, { lockEpoch: 0, keep: [], remove: [a] })).res.status).toBe(404);
    expect((await list('not-a-uuid')).res.status).toBe(404);
  });

  it('R4 @smoke GET lists the due rows newest first with the grace days (AC-EZD-123-5)', async () => {
    state.store = new Map(holderCookies);
    const r = await list(project);
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get('cache-control')).toBe('no-store');
    const body = r.json as {
      rows: { id: string; cause: string; summary: unknown }[];
      graceDays: number;
    };
    expect(body.graceDays).toBe(7);
    expect(body.rows.map((x) => x.id)).toEqual([b, a]);
    expect(body.rows[0]).toMatchObject({ cause: 'stop_editing', summary: null });
  });

  it('R5 a bad body: 400 invalid_input', async () => {
    state.store = new Map(holderCookies);
    expect((await save(project, '{')).res.status).toBe(400);
    expect(
      (await save(project, { lockEpoch: epoch, keep: [{ id: a, name: '  ' }], remove: [] })).res
        .status,
    ).toBe(400);
    expect((await save(project, { lockEpoch: epoch, keep: [], remove: ['x'] })).res.status).toBe(
      400,
    );
  });

  it('R6 an Edit model member without the lock: 409 stale_lock_epoch, nothing changes (AC-EZD-123-6)', async () => {
    state.store = new Map(otherEditorCookies);
    const r = await save(project, { lockEpoch: epoch, keep: [], remove: [a] });
    expect(r.res.status).toBe(409);
    expect(r.json).toEqual({
      error: { code: 'stale_lock_epoch', message_key: 'error.stale_lock_epoch' },
    });
  });

  it('R7 the holder saves: kept row named, unticked row deleted, snapshot_named logged (AC-EZD-123-2, -6)', async () => {
    state.store = new Map(holderCookies);
    const r = await save(project, {
      lockEpoch: epoch,
      keep: [{ id: b, name: ' Island ' }],
      remove: [a],
    });
    expect(r.res.status).toBe(200);
    expect(r.json).toEqual({ kept: [b], deleted: [a] });
    const rows = await harnessSql()<{ id: string; is_snapshot: boolean; label: string | null }[]>`
      select id, is_snapshot, label from public.model_version where project_id = ${project}::uuid`;
    expect(rows).toEqual([{ id: b, is_snapshot: true, label: 'Island' }]);
    const ev = await harnessSql()<{ action: string }[]>`
      select action from public.event_log where tenant_id = ${tenant}::uuid
        and action in ('version.snapshot_named', 'cleanup.deleted') order by action`;
    expect(ev.map((e) => e.action)).toEqual(['cleanup.deleted', 'version.snapshot_named']);
  });
});
