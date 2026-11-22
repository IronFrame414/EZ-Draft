// EZD-711 (S13 Decision 9 "Property appraiser import needs Edit model"; AC-EZD-711-1, -2): GET and PUT
// /api/projects/[id]/property-record. Same sign-in and mocks as app/src/app/api/projects/[id]/plan-scale/route.test.ts;
// emit is wrapped in vi.fn. Expected values: the route header order (401 not_signed_in, 404 project_not_found for a
// malformed id or another company's project, 403 error.not_authorized without Edit model, 400 invalid_input, 200
// `{ record }` with the lead flag; no-store), the recorded page fields (fixtures/pbc-page.ts), S01 "Year built before
// 1978 sets the lead flag".
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
} from '../../../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../../../server/auth/supabase-server';
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

async function jsonOf(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const codeOf = (json: unknown) => (json as { error?: { code?: string } }).error?.code;

async function call(method: 'GET' | 'PUT', id: string, body?: string): Promise<{ res: Response; json: unknown }> {
  const mod = await import('./route');
  const req = new Request(`http://localhost/api/projects/${id}/property-record`, {
    method,
    ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body } : {}),
  });
  const res = await (method === 'GET' ? mod.GET : mod.PUT)(req, { params: Promise.resolve({ id }) });
  return { res, json: await jsonOf(res) };
}

const FIELDS = {
  parcelNo: '00-43-44-21-01-000-0010',
  owner: 'HENDRICKS FAMILY TRUST',
  legalDescription: null,
  yearBuilt: 1975,
  livingArea: null,
};

describe('EZD-711 project property record route', () => {
  let tenant = '';
  let project = '';
  let otherProject = '';
  let editorId = '';
  let editorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    const otherTenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    [otherProject] = await createProjects(otherTenant, 1);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    editorId = editor.appUserId;
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'edit_model']);
    const viewer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    editorCookies = await cookiesFor(editor.email);
    viewerCookies = await cookiesFor(viewer.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    emitMock.mockClear();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('refuses no session, view-only, bad ids, other companies and bad bodies', async () => {
    const valid = JSON.stringify({ fields: FIELDS, sourceUrl: null });
    const noStore = (res: Response) => expect(res.headers.get('cache-control')).toBe('no-store');

    const a = await call('PUT', project, valid);
    expect(a.res.status).toBe(401);
    expect(codeOf(a.json)).toBe('not_signed_in');
    noStore(a.res);

    state.store = new Map(viewerCookies);
    const b = await call('PUT', project, valid);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual({ error: { code: 'permission_denied', message_key: 'error.not_authorized' } });

    state.store = new Map(editorCookies);
    expect((await call('PUT', 'not-a-uuid', valid)).res.status).toBe(404);
    state.store = new Map(editorCookies);
    const d = await call('PUT', otherProject, valid);
    expect(d.res.status).toBe(404);
    expect(codeOf(d.json)).toBe('project_not_found');
    state.store = new Map(editorCookies);
    expect((await call('GET', otherProject)).res.status).toBe(404);

    for (const body of [
      '{',
      '{}',
      JSON.stringify({ fields: FIELDS }),
      JSON.stringify({ fields: FIELDS, sourceUrl: null, x: 1 }),
      JSON.stringify({ fields: { ...FIELDS, yearBuilt: '1975' }, sourceUrl: null }),
      JSON.stringify({ fields: { ...FIELDS, livingArea: -1 }, sourceUrl: null }),
    ]) {
      state.store = new Map(editorCookies);
      const r = await call('PUT', project, body);
      expect(r.res.status, body).toBe(400);
      expect(codeOf(r.json), body).toBe('invalid_input');
    }
    const row = await adminDb().from('project').select('property_record_id').eq('id', project).single();
    expect(row.data?.property_record_id).toBeNull();
    expect(emitMock).not.toHaveBeenCalled();
  }, 120000);

  it('AC-EZD-711-1, -2 saves the confirmed fields, emits property_record.imported and reads the lead flag', async () => {
    state.store = new Map(viewerCookies);
    const empty = await call('GET', project);
    expect(empty.res.status).toBe(200);
    expect(empty.json).toEqual({
      record: {
        fields: { parcelNo: null, owner: null, legalDescription: null, yearBuilt: null, livingArea: null },
        sourceUrl: null,
        leadFlag: false,
      },
    });

    state.store = new Map(editorCookies);
    const url = 'https://pbcpao.gov/Property/Details?parcelId=00434421010000010';
    const saved = await call('PUT', project, JSON.stringify({ fields: FIELDS, sourceUrl: url }));
    expect(saved.res.status).toBe(200);
    expect(saved.json).toEqual({ record: { fields: FIELDS, sourceUrl: url, leadFlag: true } });

    const row = await adminDb().from('project').select('property_record_id').eq('id', project).single();
    const recordId = row.data?.property_record_id;
    expect(recordId).toBeTruthy();
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'property_record.imported',
      { projectId: project, recordId, fields: ['parcelNo', 'owner', 'yearBuilt'], leadFlag: true },
      { tenantId: tenant, projectId: project, actorId: editorId },
    );

    state.store = new Map(viewerCookies);
    const read = await call('GET', project);
    expect(read.json).toEqual({ record: { fields: FIELDS, sourceUrl: url, leadFlag: true } });
  }, 120000);
});
