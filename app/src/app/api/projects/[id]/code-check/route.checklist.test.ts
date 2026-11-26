// EZD-716 (AC-EZD-716-1 "An orphan 'Not on a wall' flag blocks Issue"; S13 Permissions "View: View projects"): the
// issue checklist over HTTP. next/headers is mocked and members sign in as in ../sheet-sets/route.test.ts.
// Expected values: the route header (401, 403 without View projects, 404 out of scope or a malformed id) and S13
// Validation (a red orphan flag is an Issue gate).
import { CURRENT_SCHEMA_VERSION, createOpeningData, createWallData, type WallObject } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  signIn,
  type Session,
} from '../../../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../../../server/auth/supabase-server';
import type { IssueChecklistAnswer } from './route';

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
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({ type: 'magiclink', email });
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

async function created(s: Session, name: string): Promise<string> {
  const r = await s.serverDb.rpc('create_project', {
    p_name: name,
    p_address: '1 Test St',
    p_type: 'kitchen',
    p_customer_id: null as never,
    p_scope_of_work: null as never,
  });
  if (r.error) throw new Error(`create_project failed: ${r.error.message}`);
  return (r.data as { project_id: string }[])[0].project_id;
}

// A wall on the project's floor and a door saved with no host wall (Not on a wall).
async function saveOrphanDoor(s: Session, project: string): Promise<void> {
  const floor = await s.serverDb
    .from('model_object')
    .select('object_id')
    .eq('project_id', project)
    .eq('type', 'floor')
    .limit(1)
    .single();
  if (floor.error) throw new Error(floor.error.message);
  const lock = await s.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-716r' });
  if (lock.error) throw new Error(lock.error.message);
  const w = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 144, y: 0 },
    level: (floor.data as { object_id: string }).object_id,
  });
  if (!w.ok) throw new Error(w.reason);
  const wall: WallObject = { id: randomUUID(), type: 'wall', data: w.data };
  const d = createOpeningData({ kind: 'door', host: wall, center: { x: 72, y: 0 } });
  const door = { ...d, geometry: { ...d.geometry, hostWallId: null, axis: { x: 1, y: 0 } } };
  const change = (id: string, type: string, data: unknown) => ({
    id,
    base_seq: 0,
    deleted: false,
    type,
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  });
  const r = await s.serverDb.rpc('save_objects', {
    p_project: project,
    p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
    p_changes: [change(wall.id, 'wall', wall.data), change(randomUUID(), 'opening', door)],
  });
  if (r.error) throw new Error(r.error.message);
}

async function get(id: string) {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/code-check?checklist=1`), {
    params: Promise.resolve({ id }),
  });
  const text = await res.text();
  return { res, json: JSON.parse(text) as IssueChecklistAnswer & { error?: { code: string } } };
}

describe('EZD-716 /api/projects/[id]/code-check?checklist=1', () => {
  let project = '';
  let viewerCookies: Map<string, string>;
  let noViewCookies: Map<string, string>;
  let otherCompanyCookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const tenantB = await createTenant();
    const maker = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, maker.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    const makerS = await signIn(maker.email);
    project = await created(makerS, 'Issue checklist route');
    await saveOrphanDoor(makerS, project);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    const noView = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, noView.membershipId, []);
    const ownerB = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, ownerB.membershipId, ['view_projects']);
    viewerCookies = await cookiesFor(viewer.email);
    noViewCookies = await cookiesFor(noView.email);
    otherCompanyCookies = await cookiesFor(ownerB.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-EZD-716-1: 200 with Issue blocked by the orphan flag gate', async () => {
    state.store = viewerCookies;
    const a = await get(project);
    expect(a.res.status).toBe(200);
    expect(a.res.headers.get('Cache-Control')).toBe('no-store');
    expect(a.json.checklist.blocked).toBe(true);
    expect(a.json.checklist.gates).toContain('orphan_flags');
    expect(a.json.checklist.rows.find((r) => r.id === 'orphan_flags')?.status).toBe('gate');
  });

  it('401 with no session, 403 without View projects, 404 for another company or a malformed id', async () => {
    expect((await get(project)).res.status).toBe(401);
    state.store = noViewCookies;
    expect((await get(project)).res.status).toBe(403);
    state.store = otherCompanyCookies;
    const other = await get(project);
    expect(other.res.status).toBe(404);
    expect(other.json.error?.code).toBe('project_not_found');
    state.store = viewerCookies;
    expect((await get('not-a-uuid')).res.status).toBe(404);
  });
});
