// EZD-111 A1-A4 (vault/plans/EZD-111.md section 4; P111 RT1, RT2; AC-EZD-111-2 to -5). Same sign-in and mocks as
// app/src/app/api/projects/[id]/checkpoints/route.test.ts. Expected values: D-Route order (401, 403
// `error.not_authorized`, 404 `project_not_found`), D-No client (400 `no_client` / `error.send_no_client`, nothing
// written), D-Recipient (a recipient in the body is ignored; Q-0700), D-Note (at most 1,000 characters, trimmed,
// empty stored as null).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { clearStubOutbox, readStubOutbox } from '../../../../../server/email/test-harness/stub-transport';

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

const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const NOT_FOUND = { error: { code: 'project_not_found', message_key: 'error.project_not_found' } };
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };
const ZED = { name: 'Zed Co', email: 'zedco@example.test' };

async function read(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function post(id: string, body: string | null): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/sends`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === null ? {} : { body }),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: await read(res) };
}

async function getRecipient(id: string): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('../send-recipient/route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/send-recipient`), {
    params: Promise.resolve({ id }),
  });
  return { res, json: await read(res) };
}

describe('EZD-111 send routes', () => {
  let tenant = '';
  let pClient = '';
  let pNone = '';
  let pUnlisted = '';
  let senderCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  let listedCookies: Map<string, string>;

  const notes = async (projectId: string) =>
    (
      await harnessSql()<{ note: string | null }[]>`
        select note from public.sent_package where project_id = ${projectId}::uuid order by created_at`
    ).map((r) => r.note);
  const count = async (table: 'sent_package' | 'model_version', projectId: string) =>
    Number(
      (
        await harnessSql().unsafe<{ n: string }[]>(
          `select count(*)::text as n from public.${table} where project_id = $1::uuid`,
          [projectId],
        )
      )[0].n,
    );

  beforeAll(async () => {
    tenant = await createTenant();
    [pClient, pNone, pUnlisted] = await createProjects(tenant, 3);
    const sql = harnessSql();
    const [c] = await sql<{ id: string }[]>`
      insert into public.customer (tenant_id, name, email)
      values (${tenant}::uuid, 'Zed Co', 'zedco@example.test') returning id`;
    await sql`update public.project set customer_id = ${c.id}::uuid where id in (${pClient}::uuid, ${pUnlisted}::uuid)`;
    const sender = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, sender.membershipId, ['view_projects', 'edit_model', 'send_to_client']);
    const plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, ['view_projects', 'edit_model']);
    const listed = await createMember({ tenantId: tenant, scope: 'listed', listed: [pClient] });
    await setPermissions(tenant, listed.membershipId, ['view_projects', 'send_to_client']);
    senderCookies = await cookiesFor(sender.email);
    plainCookies = await cookiesFor(plain.email);
    listedCookies = await cookiesFor(listed.email);
  }, 180000);

  beforeEach(() => clearStubOutbox());

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('A1 refuses no session, no Send to client, a malformed id and a project out of scope', async () => {
    state.store = new Map();
    expect((await post(pClient, '{}')).res.status).toBe(401);

    state.store = new Map(plainCookies);
    const b = await post(pClient, '{}');
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    state.store = new Map(senderCookies);
    const c = await post('x', '{}');
    expect(c.res.status).toBe(404);
    expect(c.json).toEqual(NOT_FOUND);

    state.store = new Map(listedCookies);
    const d = await post(pUnlisted, '{}');
    expect(d.res.status).toBe(404);
    expect(d.json).toEqual(NOT_FOUND);
    expect(await count('sent_package', pUnlisted)).toBe(0);
    expect(await count('model_version', pUnlisted)).toBe(0);
  }, 60000);

  it('A2 a recipient in the body is ignored: the email goes to the project client', async () => {
    state.store = new Map(senderCookies);
    const r = await post(
      pClient,
      JSON.stringify({
        note: null,
        recipients: [{ email: 'other@example.test' }],
        to: 'other@example.test',
        email: 'other@example.test',
      }),
    );
    expect(r.res.status).toBe(201);
    const send = (r.json as { send: { recipient: unknown; link: string } }).send;
    expect(send.recipient).toEqual(ZED);
    const out = readStubOutbox();
    expect(out.filter((m) => m.to === 'other@example.test')).toHaveLength(0);
    const toClient = out.filter((m) => m.to === 'zedco@example.test');
    expect(toClient).toHaveLength(1);
    expect(toClient[0].text).toContain(send.link);
  }, 60000);

  it('A3 no client is 400 no_client with nothing written; the recipient route answers the client, null, or 403', async () => {
    state.store = new Map(senderCookies);
    const a = await post(pNone, '{}');
    expect(a.res.status).toBe(400);
    expect(a.json).toEqual({ error: { code: 'no_client', message_key: 'error.send_no_client' } });
    expect(await count('sent_package', pNone)).toBe(0);
    expect(await count('model_version', pNone)).toBe(0);

    state.store = new Map(senderCookies);
    const b = await getRecipient(pClient);
    expect(b.res.status).toBe(200);
    expect(b.json).toEqual({ recipient: ZED });

    state.store = new Map(senderCookies);
    const c = await getRecipient(pNone);
    expect(c.res.status).toBe(200);
    expect(c.json).toEqual({ recipient: null });

    state.store = new Map(plainCookies);
    const d = await getRecipient(pClient);
    expect(d.res.status).toBe(403);
    expect(d.json).toEqual(FORBIDDEN);
  }, 60000);

  it('A4 the note: not JSON, an array, a number and 1,001 characters are refused; 1,000 kept whole; blank stored null', async () => {
    const before = (await notes(pClient)).length;
    for (const body of ['not json', '[]', JSON.stringify({ note: 5 }), JSON.stringify({ note: 'x'.repeat(1001) })]) {
      state.store = new Map(senderCookies);
      const r = await post(pClient, body);
      expect(r.res.status, body.slice(0, 20)).toBe(400);
      expect(r.json).toEqual(INVALID);
      vi.resetModules();
    }
    expect(await notes(pClient)).toHaveLength(before);

    state.store = new Map(senderCookies);
    expect((await post(pClient, JSON.stringify({ note: 'x'.repeat(1000) }))).res.status).toBe(201);
    vi.resetModules();
    state.store = new Map(senderCookies);
    expect((await post(pClient, JSON.stringify({ note: '   ' }))).res.status).toBe(201);
    const after = await notes(pClient);
    expect(after.slice(before)).toEqual(['x'.repeat(1000), null]);
  }, 60000);
});
