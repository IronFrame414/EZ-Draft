// EZD-105 invite routes (AC-EZD-105-1, -2, -3, -4, -5, -8, -9). next/headers is mocked and members sign in as in
// app/src/app/api/settings/users/[id]/route.test.ts; emit is a spy; email goes through the stub transport
// (vitest.config.mts EMAIL_TRANSPORT stub). Expected values: S15 Invite user ("Send emails a magic-link invite;
// dialog then shows the invite link with Copy link"); R24 #15 and architecture "Email (EZD-008)" (the link is
// returned whether the send succeeded or failed; the company is the sender, "<Company> via EZ Draft");
// Q-0029 (English default); Q-0695 decisions 10 rows 59 (403 without settings_users), 61 (lookup by the token's
// sha-256; 6-digit code), 62, 63 (refusal codes); Q-0216/Q-0706 (the link only to the last sender and Owners);
// architecture "Errors and logging" (401 not_signed_in, 403 permission_denied / error.not_authorized, 400, 404,
// 409; Cache-Control no-store).
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import { addUser, hex8, PRESET_KEYS, roleId } from '../../../../../../test-harness/users/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import {
  clearStubOutbox,
  readStubOutbox,
} from '../../../../../server/email/test-harness/stub-transport';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  emitted: [] as { name: string; payload: unknown; ctx: unknown }[],
}));

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

vi.mock('../../../../../server/events', () => ({
  emit: vi.fn(async (name: string, payload: unknown, ctx: unknown) => {
    state.emitted.push({ name, payload, ctx });
  }),
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

const BASE = 'http://localhost/api/settings/users/invites';
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = async (res: Response) => JSON.parse(await res.text()) as Record<string, unknown>;
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });
const noStore = (res: Response) =>
  expect(res.headers.get('cache-control') ?? '').toContain('no-store');
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const newEmail = () => `ezd105-route-${hex8()}-${hex8()}@example.com`;
const LINK = /^http:\/\/localhost:3000\/invite\/([A-Za-z0-9_-]{43})$/;

async function invite(payload: unknown): Promise<Response> {
  const { POST } = await import('./route');
  return POST(
    new Request(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    }),
  );
}
async function resend(id: string): Promise<Response> {
  const { POST } = await import('./[id]/resend/route');
  return POST(new Request(`${BASE}/${id}/resend`, { method: 'POST' }), params(id));
}
async function cancel(id: string): Promise<Response> {
  const { DELETE } = await import('./[id]/route');
  return DELETE(new Request(`${BASE}/${id}`, { method: 'DELETE' }), params(id));
}
async function linkOf(id: string): Promise<Response> {
  const { GET } = await import('./[id]/route');
  return GET(new Request(`${BASE}/${id}`), params(id));
}

// Rows of this file's companies only (other test files write in parallel).
const mine: string[] = [];
async function tenant(): Promise<string> {
  const t = await createTenant();
  mine.push(t);
  return t;
}

async function counts() {
  const [r] = await harnessSql()<{ m: number; i: number; e: number }[]>`
    select (select count(*)::int from public.membership where tenant_id = any(${mine}::uuid[])) as m,
      (select count(*)::int from public.invite where tenant_id = any(${mine}::uuid[])) as i,
      (select count(*)::int from public.event_log where tenant_id = any(${mine}::uuid[])) as e`;
  return r;
}

async function hashOf(membershipId: string): Promise<string | null> {
  const rows = await harnessSql()<{ h: string }[]>`
    select token_sha256 as h from public.invite where membership_id = ${membershipId}::uuid`;
  return rows[0]?.h ?? null;
}

describe('EZD-105 invite routes', () => {
  let t: string;
  let companyName: string;
  let owner: Member;
  let designer: Member;
  let holder: Member;
  let crewRole: string;
  let ownerCookies: Map<string, string>;
  let designerCookies: Map<string, string>;
  let holderCookies: Map<string, string>;

  beforeAll(async () => {
    t = await tenant();
    companyName = `Worth Test ${hex8()}`;
    await harnessSql()`update public.tenant set name = ${companyName},
      contact = ${harnessSql().json({ email: 'office@worth.example.com' })} where id = ${t}::uuid`;
    owner = await addUser(t, { preset: 'owner', name: 'Route Owner' });
    designer = await addUser(t, { preset: 'designer', name: 'No Users Switch' });
    holder = await addUser(t, {
      preset: 'designer',
      name: 'Other Holder',
      granted: [...PRESET_KEYS.designer, 'settings_users'],
    });
    crewRole = await roleId(t, 'crew');
    ownerCookies = await cookiesFor(owner.email);
    designerCookies = await cookiesFor(designer.email);
    holderCookies = await cookiesFor(holder.email);
  }, 120000);

  beforeEach(() => {
    clearStubOutbox();
    state.emitted = [];
  });

  afterEach(() => {
    state.store = new Map();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-9: not signed in is 401 and without settings_users is 403 on every invite route, nothing written', async () => {
    const id = crypto.randomUUID();
    for (const call of [
      () => invite({ email: newEmail(), roleId: crewRole }),
      () => resend(id),
      () => cancel(id),
      () => linkOf(id),
    ]) {
      state.store = new Map();
      const r401 = await call();
      expect(r401.status).toBe(401);
      expect(await json(r401)).toEqual(err('not_signed_in'));
      state.store = new Map(designerCookies);
      const before = await counts();
      const r403 = await call();
      expect(r403.status).toBe(403);
      expect(await json(r403)).toEqual(err('permission_denied', 'error.not_authorized'));
      expect(await counts()).toEqual(before);
    }
    expect(readStubOutbox()).toEqual([]);
    expect(state.emitted).toEqual([]);
  }, 60000);

  it('AC-1, AC-2: Send answers 201 with the membership, the link and the code; one email goes out from the company; English by default', async () => {
    state.store = new Map(ownerCookies);
    const email = newEmail();
    const res = await invite({ email, name: 'Luis Ortega', roleId: crewRole });
    expect(res.status).toBe(201);
    noStore(res);
    const b = await json(res);
    expect(Object.keys(b).sort()).toEqual(['code', 'emailSent', 'expiresAt', 'link', 'membershipId']);
    expect(b.emailSent).toBe(true);
    expect(b.code).toMatch(/^[0-9]{6}$/);
    const token = LINK.exec(b.link as string)?.[1];
    expect(token).toBeDefined();
    // The invite is found by the link token's sha-256 (Q-0695 row 61).
    expect(await hashOf(b.membershipId as string)).toBe(sha(token!));
    const [row] = await harnessSql()<{ status: string; language: string; scope: string }[]>`
      select m.status, u.language, m.scope from public.membership m join public.app_user u on u.id = m.user_id
      where m.id = ${b.membershipId as string}::uuid`;
    expect(row).toEqual({ status: 'invited', language: 'en', scope: 'listed' });

    // One invite email to the invitee; a sender copy (Q-0701) may go to the owner.
    const mail = readStubOutbox().filter((m) => m.to === email);
    expect(mail).toHaveLength(1);
    expect(readStubOutbox().every((m) => m.to === email || m.to === owner.email)).toBe(true);
    expect(mail[0].to).toBe(email);
    expect(mail[0].from).toContain(`${companyName} via EZ Draft`);
    expect(mail[0].replyTo).toBe('office@worth.example.com');
    expect(mail[0].text).toContain(b.link as string);
    expect(mail[0].text).toContain(b.code as string);
    expect(mail[0].subject).toBe(`You're invited to join ${companyName} on EZ Draft`);

    expect(state.emitted).toEqual([
      {
        name: 'user.invited',
        payload: { membershipId: b.membershipId, appUserId: expect.any(String), roleId: crewRole, scope: 'listed' },
        ctx: { tenantId: t, actorId: owner.appUserId },
      },
    ]);
    // The sender may read the link again (Copy link); another holder may not.
    const again = await linkOf(b.membershipId as string);
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ link: b.link, code: b.code });
    state.store = new Map(holderCookies);
    const other = await linkOf(b.membershipId as string);
    expect(other.status).toBe(404);
    expect(await json(other)).toEqual(err('member_not_found'));
  }, 60000);

  it('R24 #15: the link is returned when the email could not be sent', async () => {
    state.store = new Map(ownerCookies);
    vi.stubEnv('EMAIL_TRANSPORT', '');
    const res = await invite({ email: newEmail(), roleId: crewRole, language: 'es' });
    expect(res.status).toBe(201);
    const b = await json(res);
    expect(b.emailSent).toBe(false);
    expect(b.link).toMatch(LINK);
    expect(readStubOutbox()).toEqual([]);
  }, 60000);

  it('AC-3: bad input is 400 and each refusal is 409 with its own code, nothing written and no email', async () => {
    const otherCo = await tenant();
    const elsewhere = await addUser(otherCo, { preset: 'crew', name: 'Elsewhere' });
    const pending = await addUser(t, { preset: 'crew', status: 'invited', invitedAgo: '1 hour' });
    const off = await addUser(t, { preset: 'crew', status: 'deactivated' });
    state.store = new Map(ownerCookies);
    const cases: [unknown, number, string][] = [
      ['{not json', 400, 'invalid_input'],
      [{ email: newEmail() }, 400, 'invalid_input'],
      [{ email: newEmail(), roleId: crewRole, extra: 1 }, 400, 'invalid_input'],
      [{ email: newEmail(), roleId: crewRole, language: 'fr' }, 400, 'invalid_input'],
      [{ email: newEmail(), roleId: crewRole, name: 'x'.repeat(101) }, 400, 'invalid_input'],
      [{ email: 'luis.ortega@example', roleId: crewRole }, 400, 'invalid_email'],
      [{ email: owner.email, roleId: crewRole }, 409, 'already_member'],
      [{ email: pending.email, roleId: crewRole }, 409, 'already_invited'],
      [{ email: off.email, roleId: crewRole }, 409, 'deactivated_member'],
      [{ email: elsewhere.email, roleId: crewRole }, 409, 'email_in_use'],
    ];
    for (const [payload, status, code] of cases) {
      const before = await counts();
      const res = await invite(payload);
      expect(res.status, code).toBe(status);
      expect(await json(res), code).toEqual(err(code));
      expect(await counts(), code).toEqual(before);
    }
    expect(readStubOutbox()).toEqual([]);
    expect(state.emitted).toEqual([]);
  }, 60000);

  it('AC-4, AC-8: Resend answers a new link and code, sends one more email and makes the caller the sender', async () => {
    state.store = new Map(ownerCookies);
    const email = newEmail();
    const made = await json(await invite({ email, roleId: crewRole }));
    const id = made.membershipId as string;
    clearStubOutbox();
    state.emitted = [];
    state.store = new Map(holderCookies);
    const res = await resend(id);
    expect(res.status).toBe(200);
    noStore(res);
    const b = await json(res);
    expect(b.membershipId).toBe(id);
    expect(b.link).toMatch(LINK);
    expect(b.link).not.toBe(made.link);
    expect(await hashOf(id)).toBe(sha(LINK.exec(b.link as string)![1]));
    expect(readStubOutbox().filter((m) => m.to === email)).toHaveLength(1);
    expect(readStubOutbox().every((m) => m.to === email || m.to === holder.email)).toBe(true);
    expect(state.emitted.map((e) => e.name)).toEqual(['user.invite_resent']);
    // The holder now sees the link; the first sender, an Owner, still does too.
    expect((await linkOf(id)).status).toBe(200);
    state.store = new Map(ownerCookies);
    expect((await linkOf(id)).status).toBe(200);
    expect((await resend(crypto.randomUUID())).status).toBe(404);
    expect(await json(await resend('not-a-uuid'))).toEqual(err('member_not_found'));
  }, 60000);

  it('AC-5, AC-8: Cancel invite deletes the pending row and its invite; a member is not cancelled', async () => {
    state.store = new Map(ownerCookies);
    const made = await json(await invite({ email: newEmail(), roleId: crewRole }));
    const id = made.membershipId as string;
    state.emitted = [];
    const res = await cancel(id);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ membershipId: id });
    expect(await hashOf(id)).toBeNull();
    const rows = await harnessSql()`select 1 from public.membership where id = ${id}::uuid`;
    expect(rows).toHaveLength(0);
    expect(state.emitted.map((e) => e.name)).toEqual(['user.invite_cancelled']);
    expect((await cancel(id)).status).toBe(404);
    const active = await cancel(designer.membershipId);
    expect(active.status).toBe(409);
    expect(await json(active)).toEqual(err('member_state'));
  }, 60000);
});
