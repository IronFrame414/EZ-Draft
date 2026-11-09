// EZD-299a T12 (vault/plans/EZD-299a.md section 3 route row and section 4; Decided D-Read, D-Reason,
// D-Saved by; Q-0540, Q-0628, Q-0632 (a); AC-EZD-299-11, -13). next/headers is mocked and members sign in as in
// objects/route.test.ts. Expected values: the plan's T12 row: the same row for its owner, reason
// `not_editable` once Edit model is gone (name and saved still shown), reason `not_open` once the project
// is no longer open (no name, client, mine, saved, saved by or saved at), nothing for another user.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
} from '../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../server/auth/supabase-server';

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

type Item = {
  id: string;
  projectId: string;
  projectName: string | null;
  objectId: string;
  reason: string;
  baseSeq: number;
  mine: unknown;
  saved: Record<string, unknown> | null;
  savedBy: string | null;
  savedAt: string | null;
  clientName: string | null;
};

async function get(email: string): Promise<{ res: Response; items: Item[] }> {
  state.store = await cookiesFor(email);
  const { GET } = await import('./route');
  const res = await GET(new Request('http://localhost/api/sync-conflicts'));
  const json = JSON.parse(await res.text()) as { items: Item[] };
  return { res, items: json.items };
}

describe('EZD-299a list route', () => {
  let tenant = '';
  let project = '';
  let floor = '';
  let member: Awaited<ReturnType<typeof createMember>>;
  let other: Awaited<ReturnType<typeof createMember>>;
  let rowId = '';

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    floor = (
      await harnessSql()<{ object_id: string }[]>`
        select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`
    )[0].object_id;
    member = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
    await setPermissions(tenant, member.membershipId, ['view_projects', 'edit_model']);
    other = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, other.membershipId, ['view_projects']);
    const recorded = await (
      await signIn(member.email)
    ).serverDb.rpc('record_sync_conflicts', {
      p_project: project,
      p_changes: [
        {
          id: floor,
          base_seq: 1,
          reason: 'conflict',
          deleted: false,
          type: 'floor',
          schema_version: 3,
          data: { name: 'Floor 1b', order: 1 },
        },
      ],
      p_payload: { count: '1', names: 'Floor 1b', more: '0' },
    });
    expect(recorded.error).toBeNull();
    rowId = (recorded.data as { ids: string[] }).ids[0];
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  }, 180000);

  it('EZD-299a T12 lists the row for its owner, then as not_editable, then as not_open, and nothing for another user', async () => {
    const first = await get(member.email);
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(first.items).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      id: rowId,
      projectId: project,
      objectId: floor,
      reason: 'conflict',
      baseSeq: 1,
      mine: { deleted: false, type: 'floor', schemaVersion: 3, data: { name: 'Floor 1b', order: 1 } },
      saved: { updatedSeq: 1, deleted: false, type: 'floor', schemaVersion: 3 },
    });

    await setPermissions(tenant, member.membershipId, ['view_projects']);
    const second = await get(member.email);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].reason).toBe('not_editable');
    expect(second.items[0].projectName).not.toBeNull();
    expect(second.items[0].saved).not.toBeNull();

    const removed = await adminDb()
      .from('membership_project')
      .delete()
      .eq('membership_id', member.membershipId)
      .eq('project_id', project);
    expect(removed.error).toBeNull();
    const third = await get(member.email);
    expect(third.items).toHaveLength(1);
    expect(third.items[0]).toMatchObject({
      id: rowId,
      reason: 'not_open',
      projectName: null,
      clientName: null,
      mine: null,
      saved: null,
      savedBy: null,
      savedAt: null,
    });

    expect((await get(other.email)).items).toEqual([]);
  }, 180000);
});
