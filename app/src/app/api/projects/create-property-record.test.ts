// EZD-711 (S01 Step 1 "Property appraiser link"; S13 Decision 9; AC-EZD-711-1): POST /api/projects with the fields
// confirmed in the New project wizard. Same sign-in and mocks as create.test.ts; emit is wrapped in vi.fn. Expected
// values: the route header (a `propertyRecord` needs Edit model too, 403 without it and no project made; 400 for a
// bad record; 201 `{ project, propertyRecordSaved: true }` and the title block's owner and PCN filled; the events
// project.created then property_record.imported) and the recorded page fields (fixtures/pbc-page.ts).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
} from '../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../server/auth/supabase-server';
import type { Database } from '../../../server/db/database.types';
import { emit } from '../../../server/events';
import { loadProjectTitleBlock } from '../../../server/title-block/sheet-title-block';

vi.mock('../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/events')>();
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

async function post(raw: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  return { res, json: await jsonOf(res) };
}

const RECORD = {
  fields: {
    parcelNo: '00-43-44-21-01-000-0010',
    owner: 'HENDRICKS FAMILY TRUST',
    legalDescription: null,
    yearBuilt: 1975,
    livingArea: null,
  },
  sourceUrl: 'https://pbcpao.gov/Property/Details?parcelId=00434421010000010',
};

describe('EZD-711 POST /api/projects with a property record', () => {
  let tenant = '';
  let editor: Member;
  let editorCookies: Map<string, string>;
  let creatorCookies: Map<string, string>;

  const count = async () =>
    Number(
      (await harnessSql()`select count(*) as n from public.project where tenant_id = ${tenant}::uuid`)[0].n,
    );
  const body = (extra: Record<string, unknown>) =>
    JSON.stringify({
      name: 'Kitchen remodel',
      address: '336 Golfview Rd',
      type: 'kitchen',
      customerId: null,
      scopeOfWork: '',
      ...extra,
    });

  beforeAll(async () => {
    tenant = await createTenant();
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    const creator = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, creator.membershipId, ['view_projects', 'create_projects']);
    editorCookies = await cookiesFor(editor.email);
    creatorCookies = await cookiesFor(creator.email);
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

  it('needs Edit model for a record and refuses a bad one, making no project', async () => {
    state.store = new Map(creatorCookies);
    const a = await post(body({ propertyRecord: RECORD }));
    expect(a.res.status).toBe(403);
    expect(a.json).toEqual({ error: { code: 'permission_denied', message_key: 'error.not_authorized' } });
    for (const bad of [{ fields: RECORD.fields }, { ...RECORD, x: 1 }, 'record']) {
      state.store = new Map(editorCookies);
      const r = await post(body({ propertyRecord: bad }));
      expect(r.res.status).toBe(400);
      expect(codeOf(r.json)).toBe('invalid_input');
    }
    expect(await count()).toBe(0);
  }, 120000);

  it('AC-EZD-711-1 the confirmed fields fill the new project title block', async () => {
    state.store = new Map(editorCookies);
    const r = await post(body({ propertyRecord: RECORD }));
    expect(r.res.status).toBe(201);
    const { project, propertyRecordSaved } = r.json as { project: { id: string }; propertyRecordSaved: boolean };
    expect(propertyRecordSaved).toBe(true);
    expect(emitMock.mock.calls.map((c) => c[0])).toEqual(['project.created', 'property_record.imported']);
    expect(emitMock.mock.calls[1]?.[1]).toMatchObject({
      projectId: project.id,
      fields: ['parcelNo', 'owner', 'yearBuilt'],
      leadFlag: true,
    });
    const session = await signIn(editor.email);
    const tb = await loadProjectTitleBlock(
      session.serverDb as unknown as SupabaseClient<Database>,
      project.id,
      editor,
    );
    expect(tb?.owner).toBe('HENDRICKS FAMILY TRUST');
    expect(tb?.parcel).toBe('00-43-44-21-01-000-0010');
  }, 120000);

  it('a null record and a create without one are the plain create', async () => {
    state.store = new Map(creatorCookies);
    const r = await post(body({ propertyRecord: null }));
    expect(r.res.status).toBe(201);
    expect(Object.keys(r.json as object)).toEqual(['project']);
    const row = await adminDb()
      .from('project')
      .select('property_record_id')
      .eq('id', (r.json as { project: { id: string } }).project.id)
      .single();
    expect(row.data?.property_record_id).toBeNull();
  }, 120000);
});
