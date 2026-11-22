// EZD-726 (AC-EZD-726-1; S13 Set selector): the set selector query over HTTP. next/headers is mocked and members
// sign in as in ../submittal-profile/route.test.ts. Expected values: 03d sheet_set (one permit set at 24x36, one
// client set, 11x17 for client copies per the S13 size toggle), S13 Decision 1 (the nine default permit sheets with
// no scope box ticked), S13 Decision 10 (client set R1.0), and the route header (View projects; 404 out of scope).
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
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import type { SheetSetsAnswer } from './route';

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

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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

async function get(id: string) {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/sheet-sets`), {
    params: Promise.resolve({ id }),
  });
  return { res, json: (await json(res)) as SheetSetsAnswer & { error?: { code: string } } };
}

describe('EZD-726 /api/projects/[id]/sheet-sets', () => {
  let project = '';
  let otherProject = '';
  let viewerCookies: Map<string, string>;
  let noViewCookies: Map<string, string>;
  let otherCompanyCookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const tenantB = await createTenant();
    const maker = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, maker.membershipId, ['view_projects', 'create_projects']);
    const makerB = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, makerB.membershipId, ['view_projects', 'create_projects']);
    project = await created(await signIn(maker.email), 'Sheet sets route');
    otherProject = await created(await signIn(makerB.email), 'Sheet sets route B');
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

  it('AC-1: 200 with the permit set and the client set, each with its sheets', async () => {
    state.store = viewerCookies;
    const a = await get(project);
    expect(a.res.status).toBe(200);
    expect(a.json.sets.map((s) => [s.kind, s.size, s.keyPlacement, s.lastIssuedVersionId])).toEqual(
      [
        ['permit', '24x36', 'every_sheet', null],
        ['client', '11x17', 'every_sheet', null],
      ],
    );
    expect(a.json.sets[0].sheets.map((s) => s.number)).toEqual([
      'A0.0',
      'A1.0',
      'A2.0',
      'A3.0',
      'A4.0',
      'A5.0',
      'E1.0',
      'E2.0',
      'R1.0',
    ]);
    expect(a.json.sets[1].sheets.map((s) => s.number)).toEqual(['R1.0']);
  });

  it('401 with no session, 403 without View projects, 404 for another company or a malformed id', async () => {
    expect((await get(project)).res.status).toBe(401);
    state.store = noViewCookies;
    expect((await get(project)).res.status).toBe(403);
    state.store = otherCompanyCookies;
    const other = await get(project);
    expect(other.res.status).toBe(404);
    expect(other.json.error?.code).toBe('project_not_found');
    expect((await get(otherProject)).res.status).toBe(200);
    state.store = viewerCookies;
    expect((await get('not-a-uuid')).res.status).toBe(404);
    expect((await get(otherProject)).res.status).toBe(404);
  });

  // EZD-710 (AC-EZD-710-1): the answer carries the project's title block. Expected: S13 Data shown; S15b Decision 2;
  // the v1 code edition label (S06 "FBC 9th ed. · NEC 2023"); create_project stores the typed address.
  it('EZD-710 the answer carries the project title block with its owner and parcel', async () => {
    const tenantRow = await adminDb().from('project').select('tenant_id').eq('id', project).single();
    const tenant = tenantRow.data!.tenant_id;
    const rec = await adminDb()
      .from('property_record')
      .insert({ tenant_id: tenant, owner: 'Hendricks', parcel_no: '00-43-44-21-01-000-0010' })
      .select('id')
      .single();
    expect(rec.error).toBeNull();
    await adminDb()
      .from('project')
      .update({ scope_of_work: 'Kitchen remodel', property_record_id: rec.data!.id })
      .eq('id', project);
    await adminDb().from('tenant').update({ license_no: 'CGC1541042' }).eq('id', tenant);
    state.store = viewerCookies;
    const a = await get(project);
    expect(a.res.status).toBe(200);
    expect(a.json.titleBlock).toMatchObject({
      licenseNo: 'CGC1541042',
      projectName: 'Sheet sets route',
      address: '1 Test St',
      codeEdition: 'FBC 9th ed. · NEC 2023',
      scopeOfWork: 'Kitchen remodel',
      owner: 'Hendricks',
      parcel: '00-43-44-21-01-000-0010',
    });
    expect(a.json.titleBlock.drawn.length).toBeGreaterThan(0);
  });
});
