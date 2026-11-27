// EZD-1977 (AC-EZD-1977-1; audit 2026-11-24 F2 / U4): every sign-in way on /sign-in lands on the asked-for page
// (the next field, or the next cookie for the emailed link), and a value that is not a same-origin path lands on
// Projects ("/"). Against the local stack; next/headers is mocked as in invite-code.test.ts (cookies in a map, a
// fresh x-forwarded-for per test). redirect is not mocked: a success is a rejection whose digest names the target.
// Codes and links come from the local mail catcher (CLAUDE.md rule 5).
import { randomInt } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestMembers,
  createPasswordMember,
  createTestMember,
} from '../../../test-harness/auth-users';
import { waitForAuthEmail } from '../../../test-harness/mail-catcher';
import {
  cleanup,
  closeHarness,
  createTenant,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { addUser, hex8, roleId } from '../../../test-harness/users/fixtures';
import { inviteCode, inviteToken, inviteTokenHash, newInviteSecret } from '../users/invite-token';
import {
  acceptInviteCode,
  confirmSignInLink,
  requestSignIn,
  signInWithPassword,
  verifySignInCode,
} from './actions';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  ip: '203.0.113.1',
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.store.has(name) ? { name, value: state.store.get(name) } : undefined,
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    has: (name: string) => state.store.has(name),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
    delete: (name: string) => state.store.delete(name),
  }),
  headers: async () => new Headers({ 'x-forwarded-for': state.ip }),
}));

vi.mock('../events', () => ({ emit: vi.fn(async () => {}) }));

const NEXT_COOKIE = 'ezd_sign_in_next';
const DEEP = '/settings/users';
const OUTSIDE = [
  'https://evil.example/settings',
  '//evil.example',
  '/\\evil.example',
  '/%2F%2Fevil.example',
];

const freshIp = () => `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`;

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

async function landing(action: () => Promise<unknown>): Promise<string> {
  try {
    const value = await action();
    throw new Error(`no redirect: ${JSON.stringify(value)}`);
  } catch (e) {
    const digest = (e as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return digest.split(';').slice(2, -2).join(';');
    }
    throw e;
  }
}

describe('EZD-1977 sign-in lands on the asked-for page', () => {
  let tenant: string;
  let so: Session;
  let crew: string;

  beforeAll(async () => {
    tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Return Owner' });
    so = await signIn(owner.email);
    crew = await roleId(tenant, 'crew');
  }, 120000);

  afterEach(() => {
    state.store = new Map();
    state.ip = freshIp();
  });

  afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  }, 120000);

  it('password: a next path is the landing; none is Projects', async () => {
    state.ip = freshIp();
    const m = await createPasswordMember({ tenantId: tenant });
    const fields = { email: m.email, password: m.password };
    expect(await landing(() => signInWithPassword(form({ ...fields, next: DEEP })))).toBe(DEEP);
    state.store = new Map();
    expect(await landing(() => signInWithPassword(form(fields)))).toBe('/');
  });

  it('password: a next that is not a same-origin path lands on Projects', async () => {
    state.ip = freshIp();
    const m = await createPasswordMember({ tenantId: tenant });
    for (const next of OUTSIDE) {
      state.store = new Map();
      expect(
        await landing(() =>
          signInWithPassword(form({ email: m.email, password: m.password, next })),
        ),
      ).toBe('/');
    }
  });

  it('code: the emailed 8-digit code lands on next', async () => {
    state.ip = freshIp();
    const m = await createTestMember({ tenantId: tenant, status: 'active' });
    const after = new Date();
    expect(await requestSignIn(form({ email: m.email, next: DEEP }))).toEqual({ step: 'code' });
    const mail = await waitForAuthEmail(m.email, { after });
    expect(
      await landing(() => verifySignInCode(form({ email: m.email, code: mail.code, next: DEEP }))),
    ).toBe(DEEP);
    expect(state.store.has(NEXT_COOKIE)).toBe(false);
  });

  it('link: the emailed link lands on the next the request kept, then the cookie is gone', async () => {
    state.ip = freshIp();
    const m = await createTestMember({ tenantId: tenant, status: 'active' });
    const after = new Date();
    await requestSignIn(form({ email: m.email, next: `${DEEP}?tab=a` }));
    expect(state.store.get(NEXT_COOKIE)).toBe(`${DEEP}?tab=a`);
    const mail = await waitForAuthEmail(m.email, { after });
    const tokenHash = new URL(mail.link).searchParams.get('token_hash') ?? '';
    expect(
      await landing(() => confirmSignInLink(form({ token_hash: tokenHash, type: 'email' }))),
    ).toBe(`${DEEP}?tab=a`);
    expect(state.store.has(NEXT_COOKIE)).toBe(false);
  });

  it('link: a request with an outside next keeps no cookie and the link lands on Projects', async () => {
    state.ip = freshIp();
    const m = await createTestMember({ tenantId: tenant, status: 'active' });
    state.store.set(NEXT_COOKIE, DEEP);
    const after = new Date();
    await requestSignIn(form({ email: m.email, next: '//evil.example' }));
    expect(state.store.has(NEXT_COOKIE)).toBe(false);
    const mail = await waitForAuthEmail(m.email, { after });
    const tokenHash = new URL(mail.link).searchParams.get('token_hash') ?? '';
    expect(
      await landing(() => confirmSignInLink(form({ token_hash: tokenHash, type: 'email' }))),
    ).toBe('/');
  });

  it('link: a planted outside next cookie lands on Projects', async () => {
    state.ip = freshIp();
    const m = await createTestMember({ tenantId: tenant, status: 'active' });
    const after = new Date();
    await requestSignIn(form({ email: m.email }));
    const mail = await waitForAuthEmail(m.email, { after });
    state.store.set(NEXT_COOKIE, 'https://evil.example');
    const tokenHash = new URL(mail.link).searchParams.get('token_hash') ?? '';
    expect(
      await landing(() => confirmSignInLink(form({ token_hash: tokenHash, type: 'email' }))),
    ).toBe('/');
  });

  it('invite code: Join lands on next', async () => {
    state.ip = freshIp();
    const email = `ezd1977-code-${hex8()}@example.com`;
    const secret = newInviteSecret();
    const { error } = await so.serverDb.rpc('create_invite', {
      p_email: email,
      p_name: 'Return Person',
      p_role_id: crew,
      p_language: 'en',
      p_scope: null,
      p_secret: secret,
      p_token_sha256: inviteTokenHash(inviteToken(secret)),
    });
    if (error) throw new Error(error.message);
    expect(
      await landing(() => acceptInviteCode(form({ email, code: inviteCode(secret), next: DEEP }))),
    ).toBe(DEEP);
  });
});
