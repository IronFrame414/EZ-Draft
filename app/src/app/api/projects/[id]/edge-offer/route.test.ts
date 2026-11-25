// EZD-417 (S04b Controls "Offered profile rows | ... price per lf × exposed edge length | Price hidden without See
// sell prices", "Edit offered edges | ... enter the price difference per lf ... | Requires Send to client"; 13b R2;
// AC-EZD-417-1). Same sign-in and mocks as app/src/app/api/projects/[id]/plan-scale/route.test.ts. Expected values:
// 401 not_signed_in; 403 error.not_authorized without the switch; malformed id or another company's project 404;
// bad JSON or a body not `{ pieceId, choices: [{ profileId, ratePerLf? }] }` 400 invalid_input; rates in cents only;
// ratePerLf only with See sell prices; no-store on every answer.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

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

async function call(
  method: 'GET' | 'PUT',
  id: string,
  body?: string,
): Promise<{ res: Response; json: unknown }> {
  const route = await import('./route');
  const res = await route[method](
    new Request(`http://localhost/api/projects/${id}/edge-offer`, {
      method,
      ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body }),
    }),
    { params: Promise.resolve({ id }) },
  );
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  return { res, json };
}

const codeOf = (json: unknown) => (json as { error?: { code?: string } }).error?.code;
const noStore = (res: Response) => expect(res.headers.get('cache-control')).toBe('no-store');

describe('EZD-417 edge offer route', () => {
  let project = '';
  let otherProject = '';
  let ids: Record<string, string> = {};
  let sender: Map<string, string>;
  let noSell: Map<string, string>;
  let viewer: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    [otherProject] = await createProjects(otherTenant, 1);
    await harnessSql()`select private.seed_edge_profiles(${tenant}::uuid)`;
    const rows = await harnessSql()<{ key: string; id: string }[]>`
      select key, id::text from public.edge_profile where tenant_id = ${tenant}::uuid`;
    ids = Object.fromEntries(rows.map((r) => [r.key, r.id]));
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, ['view_projects', 'send_to_client', 'see_sell_prices']);
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, ['view_projects', 'send_to_client']);
    const c = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, c.membershipId, ['view_projects', 'edit_model', 'see_sell_prices']);
    sender = await cookiesFor(a.email);
    noSell = await cookiesFor(b.email);
    viewer = await cookiesFor(c.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('refuses no session, no Send to client, bad ids and bad bodies', async () => {
    const valid = JSON.stringify({ pieceId: randomUUID(), choices: [{ profileId: ids.eased, ratePerLf: 0 }] });

    state.store = new Map();
    const a = await call('PUT', project, valid);
    expect(a.res.status).toBe(401);
    expect(codeOf(a.json)).toBe('not_signed_in');
    noStore(a.res);

    state.store = new Map(viewer);
    const b = await call('PUT', project, valid);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual({ error: { code: 'permission_denied', message_key: 'error.not_authorized' } });
    noStore(b.res);

    state.store = new Map(sender);
    const c = await call('PUT', 'not-a-uuid', valid);
    expect(c.res.status).toBe(404);
    expect(codeOf(c.json)).toBe('project_not_found');

    state.store = new Map(sender);
    const d = await call('PUT', otherProject, valid);
    expect(d.res.status).toBe(404);
    expect(codeOf(d.json)).toBe('project_not_found');

    const piece = randomUUID();
    const bad = [
      '{',
      '{}',
      JSON.stringify({ pieceId: 'x', choices: [] }),
      JSON.stringify({ pieceId: piece, choices: [{ profileId: ids.eased, ratePerLf: -1 }] }),
      JSON.stringify({ pieceId: piece, choices: [{ profileId: ids.eased, ratePerLf: 1.005 }] }),
      JSON.stringify({ pieceId: piece, choices: [{ profileId: ids.eased, ratePerLf: '12' }] }),
      JSON.stringify({ pieceId: piece, choices: [{ profileId: randomUUID(), ratePerLf: 1 }] }),
      JSON.stringify({ pieceId: piece, choices: [], extra: 1 }),
    ];
    for (const body of bad) {
      state.store = new Map(sender);
      const r = await call('PUT', project, body);
      expect(r.res.status, body).toBe(400);
      expect(codeOf(r.json), body).toBe('invalid_input');
      noStore(r.res);
    }
  }, 120000);

  it('AC-EZD-417-1 saves the rates per LF and reads them back only with See sell prices', async () => {
    const piece = randomUUID();
    state.store = new Map(sender);
    const put = await call(
      'PUT',
      project,
      JSON.stringify({
        pieceId: piece,
        choices: [
          { profileId: ids.eased, ratePerLf: 0 },
          { profileId: ids.half_bullnose, ratePerLf: 12 },
        ],
      }),
    );
    expect(put.res.status).toBe(200);
    noStore(put.res);
    const offer = (put.json as { offer: { id: string; pieceId: string; status: string; choices: unknown } }).offer;
    expect(offer.pieceId).toBe(piece);
    expect(offer.status).toBe('open');
    expect(offer.choices).toEqual([
      { profileId: ids.eased, ratePerLf: 0 },
      { profileId: ids.half_bullnose, ratePerLf: 12 },
    ]);

    state.store = new Map(viewer);
    const seen = await call('GET', project);
    expect(seen.res.status).toBe(200);
    noStore(seen.res);
    const mine = (seen.json as { offers: Array<{ pieceId: string; choices: unknown }> }).offers.find(
      (o) => o.pieceId === piece,
    );
    expect(mine?.choices).toEqual([
      { profileId: ids.eased, ratePerLf: 0 },
      { profileId: ids.half_bullnose, ratePerLf: 12 },
    ]);

    state.store = new Map(noSell);
    const hidden = await call('GET', project);
    expect(hidden.res.status).toBe(200);
    expect(JSON.stringify(hidden.json)).not.toMatch(/ratePerLf|price/i);
    const theirs = (hidden.json as { offers: Array<{ pieceId: string; choices: unknown }> }).offers.find(
      (o) => o.pieceId === piece,
    );
    expect(theirs?.choices).toEqual([{ profileId: ids.eased }, { profileId: ids.half_bullnose }]);

    // A member without See sell prices may re-tick: the rate they send is ignored and the saved one kept.
    state.store = new Map(noSell);
    const again = await call(
      'PUT',
      project,
      JSON.stringify({ pieceId: piece, choices: [{ profileId: ids.half_bullnose, ratePerLf: 1 }] }),
    );
    expect(again.res.status).toBe(200);
    expect(JSON.stringify(again.json)).not.toMatch(/ratePerLf/);
    const [row] = await harnessSql()<{ price_deltas: string[] }[]>`
      select price_deltas::text[] from public.selection_offer where subject_id = ${piece}::uuid`;
    expect(row!.price_deltas).toEqual(['12.00']);

    // Withdraw.
    state.store = new Map(sender);
    const off = await call('PUT', project, JSON.stringify({ pieceId: piece, choices: [] }));
    expect(off.res.status).toBe(200);
    expect(off.json).toEqual({ offer: null });
  }, 120000);

  it("GET refuses no session and another company's project", async () => {
    state.store = new Map();
    const a = await call('GET', project);
    expect(a.res.status).toBe(401);
    state.store = new Map(sender);
    const b = await call('GET', 'nope');
    expect(b.res.status).toBe(404);
    state.store = new Map(sender);
    const c = await call('GET', otherProject);
    expect(c.res.status).toBe(404);
    expect(codeOf(c.json)).toBe('project_not_found');
  }, 60000);
});
