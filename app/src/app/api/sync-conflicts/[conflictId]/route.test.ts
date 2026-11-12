// EZD-299a T13 (vault/plans/EZD-299a.md section 3 route row and section 4; Q-0540; AC-EZD-299-11). next/headers
// is mocked and the member signs in as in objects/route.test.ts. Expected values: removing the caller's own row
// (even one whose project is no longer open) answers 200 `{ removed: true }`; a second try and a malformed id
// answer 404 `sync_conflict_not_found`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

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

const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });

describe('EZD-299a delete route', () => {
  let email = '';
  let rowId = '';

  async function remove(id: string): Promise<{ res: Response; json: unknown }> {
    const { DELETE } = await import('./route');
    const res = await DELETE(new Request(`http://localhost/api/sync-conflicts/${id}`, { method: 'DELETE' }), {
      params: Promise.resolve({ conflictId: id }),
    });
    return { res, json: JSON.parse(await res.text()) as unknown };
  }

  beforeAll(async () => {
    const tenant = await createTenant();
    const [project] = await createProjects(tenant, 1);
    const member = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    email = member.email;
    const recorded = await (
      await signIn(email)
    ).serverDb.rpc('record_sync_conflicts', {
      p_project: project,
      p_changes: [
        {
          id: crypto.randomUUID(),
          base_seq: 1,
          reason: 'conflict',
          deleted: true,
        },
      ],
      p_payload: { count: '1', names: 'Object', more: '0' },
    });
    expect(recorded.error).toBeNull();
    rowId = (recorded.data as { ids: string[] }).ids[0];
    const removed = await adminDb()
      .from('membership_project')
      .delete()
      .eq('membership_id', member.membershipId)
      .eq('project_id', project);
    expect(removed.error).toBeNull();
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  }, 180000);

  it('EZD-299a T13 removes a not-open row once, then answers 404, and 404 for a malformed id', async () => {
    state.store = await cookiesFor(email);
    const first = await remove(rowId);
    expect(first.res.status).toBe(200);
    expect(first.json).toEqual({ removed: true });
    expect(first.res.headers.get('cache-control') ?? '').toContain('no-store');

    const again = await remove(rowId);
    expect(again.res.status).toBe(404);
    expect(again.json).toEqual(err('sync_conflict_not_found'));

    const bad = await remove('x');
    expect(bad.res.status).toBe(404);
    expect(bad.json).toEqual(err('sync_conflict_not_found'));
  }, 120000);
});
