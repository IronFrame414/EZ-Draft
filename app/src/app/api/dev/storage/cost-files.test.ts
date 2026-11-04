// EZD-322 R1 (vault/plans/EZD-322.md section 4). POST /api/dev/storage with the cookies of a signed-in member.
// next/headers is mocked with a cookie store read at call time (the store is swapped per member), as in
// app/src/app/api/settings/customers/route.test.ts. Expected values: D3 (403 body `permission_denied` /
// `error.not_authorized`, `Cache-Control: no-store`, not reported), route.ts 201, AC-3 (other kinds unchanged).
// Objects are removed with the secret-key client, rows with cleanup().
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { POST } from './route';

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

const PDF = 'application/pdf';
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };

describe('EZD-322 cost-record starts through POST /api/dev/storage (route, db)', () => {
  let tenant = '';
  let project = '';
  let a: Member;
  let f: Member;
  let cookiesA: Map<string, string>;
  let cookiesF: Map<string, string>;
  const objects: string[] = [];

  const post = (body: Record<string, unknown>) =>
    POST(
      new Request('http://localhost/api/dev/storage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  const body = (kind: string, extra: Record<string, unknown> = {}) => ({
    projectId: project,
    kind,
    originalName: 'quote.pdf',
    contentType: PDF,
    size: 100,
    ...extra,
  });

  // Cost rows written by one member (kind or supplier fields), as the plan's "cost rows of F" count.
  async function costRows(who: Member): Promise<number> {
    const rows = await harnessSql()`
      select count(*)::int as n from public.source_file
      where uploaded_by = ${who.appUserId}::uuid
        and (kind in ('supplier_pdf', 'order_report')
          or supplier_name is not null
          or supplier_contact_email is not null)`;
    return rows[0].n as number;
  }

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    a = await createMember({ tenantId: tenant, scope: 'all' });
    f = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, ['edit_model', 'see_company_costs']);
    await setPermissions(tenant, f.membershipId, ['edit_model']);
    cookiesA = await cookiesFor(a.email);
    cookiesF = await cookiesFor(f.email);
  });

  afterAll(async () => {
    try {
      if (objects.length) await adminDb().storage.from('sources').remove(objects);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('EZD-322 done when: the dev route answers 403 for a cost file from a member without See company costs and writes no row, a member with it gets 201, and other files are unchanged', async () => {
    state.store = cookiesF;
    for (const kind of ['supplier_pdf', 'order_report']) {
      const res = await post(body(kind));
      expect(res.status, kind).toBe(403);
      expect(await res.json(), kind).toEqual(FORBIDDEN);
    }
    expect(await costRows(f)).toBe(0);

    state.store = cookiesA;
    const withCosts = await post(body('supplier_pdf'));
    expect(withCosts.status).toBe(201);
    const withCostsJson = (await withCosts.json()) as {
      sourceFile: { kind: string; storagePath: string };
    };
    expect(withCostsJson.sourceFile.kind).toBe('supplier_pdf');
    objects.push(withCostsJson.sourceFile.storagePath);

    state.store = cookiesF;
    const other = await post(body('pdf'));
    expect(other.status).toBe(201);
    const otherJson = (await other.json()) as { sourceFile: { kind: string; storagePath: string } };
    expect(otherJson.sourceFile.kind).toBe('pdf');
    objects.push(otherJson.sourceFile.storagePath);
  });

  it('EZD-322 R1 (a) a member without See company costs gets 403 permission_denied for supplier_pdf and order_report, with no row written', async () => {
    state.store = cookiesF;
    for (const kind of ['supplier_pdf', 'order_report']) {
      const res = await post(body(kind));
      expect(res.status, kind).toBe(403);
      expect(res.headers.get('Cache-Control'), kind).toBe('no-store');
      expect(await res.json(), kind).toEqual(FORBIDDEN);
    }
    expect(await costRows(f)).toBe(0);
  });

  it('EZD-322 R1 (b) a member with See company costs gets 201 for supplier_pdf', async () => {
    state.store = cookiesA;
    const res = await post(body('supplier_pdf'));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { sourceFile: { kind: string; storagePath: string } };
    expect(json.sourceFile.kind).toBe('supplier_pdf');
    objects.push(json.sourceFile.storagePath);
  });

  it('EZD-322 R1 (c) a member without See company costs gets 201 for an ordinary pdf', async () => {
    state.store = cookiesF;
    const res = await post(body('pdf'));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { sourceFile: { kind: string; storagePath: string } };
    expect(json.sourceFile.kind).toBe('pdf');
    objects.push(json.sourceFile.storagePath);
  });
});
