// EZD-033 T3, T7, T17, T18 (Sentry and logger part) (vault/plans/EZD-033.md Tests; Step 3): signInWithPassword
// at the action level against the local stack. next/headers is mocked as in EZD-007d's sign-in.test.ts
// (cookies() is an in-memory store per person, headers() is empty, so there is no x-forwarded-for and no IP
// count). redirect is not mocked: a success is a rejection whose digest URL part is the target. emit is
// wrapped in vi.fn over createEmitter({ sinks: [] }).emit. Passwords are set with the Auth admin API or the
// publishable key's signUp (Q-0095: no screen sets one in Phase 0). Emails are read from the local mail
// catcher (CLAUDE.md rule 6); Sentry is the stub transport. Members are fresh, in a fresh tenant.
import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestMembers,
  createPasswordMember,
  createTestMember,
  createUnconfirmedPasswordUser,
  randomPassword,
} from '../../../test-harness/auth-users';
import { countAuthEmails, waitForRawEmail } from '../../../test-harness/mail-catcher';
import {
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  sessionCount,
} from '../../../test-harness/rls/fixtures';
import { eventsIn } from '../../../test-harness/sentry-outbox';
import { emit } from '../events';
import { readStubOutbox } from '../email/test-harness/stub-transport';
import { initErrorReporting } from '../errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../errors/test-harness/sentry-stub-transport';
import { signInWithPassword } from './actions';
import { getSession, requireApiSession } from './session';

type Write = { name: string; value: string; options: Record<string, unknown>; deleted: boolean };
type Store = { map: Map<string, string>; writes: Write[] };

const state = vi.hoisted(() => ({
  store: { map: new Map<string, string>(), writes: [] as unknown[] } as {
    map: Map<string, string>;
    writes: unknown[];
  },
}));

vi.mock('next/headers', () => ({
  cookies: async () => {
    const s = state.store;
    const record = (name: string, value: string, options: Record<string, unknown>) => {
      const deleted = value === '' || options.maxAge === 0;
      s.writes.push({ name, value, options, deleted });
      if (deleted) s.map.delete(name);
      else s.map.set(name, value);
    };
    const jar = {
      get: (name: string) => (s.map.has(name) ? { name, value: s.map.get(name) } : undefined),
      getAll: () => [...s.map].map(([name, value]) => ({ name, value })),
      has: (name: string) => s.map.has(name),
      set: (...args: unknown[]) => {
        if (typeof args[0] === 'object' && args[0] !== null) {
          const { name, value, ...options } = args[0] as Record<string, unknown>;
          record(String(name), String(value ?? ''), options);
        } else {
          record(
            String(args[0]),
            String(args[1] ?? ''),
            (args[2] as Record<string, unknown> | undefined) ?? {},
          );
        }
        return jar;
      },
      delete: (arg: unknown) => {
        const name =
          typeof arg === 'object' && arg !== null
            ? String((arg as { name: unknown }).name)
            : String(arg);
        s.writes.push({ name, value: '', options: { maxAge: 0 }, deleted: true });
        s.map.delete(name);
        return jar;
      },
    };
    return jar;
  },
  headers: async () => new Headers(),
}));

vi.mock('../events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});

const emitMock = vi.mocked(emit);
const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const publishable = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
const DAY = 86_400_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const macrotask = () => sleep(0);
const newStore = (): Store => ({ map: new Map(), writes: [] });
const activate = (store: Store) => {
  state.store = store as unknown as typeof state.store;
};

function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

type Outcome = { redirect: string } | { resolved: unknown };

async function run(store: Store, action: () => Promise<unknown>): Promise<Outcome> {
  activate(store);
  try {
    const value = await action();
    await macrotask();
    return { resolved: value };
  } catch (e) {
    await macrotask();
    const digest = (e as { digest?: unknown }).digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      return { redirect: digest.split(';').slice(2, -2).join(';') };
    }
    throw e;
  }
}

const sbWrites = (store: Store) =>
  store.writes.filter((w) => w.name.startsWith('sb-') && w.value !== '');
const unknownEmail = () => `nobody-${randomUUID().slice(0, 12)}@example.test`;
const signInWith = (store: Store, email: string, password: string) =>
  run(store, () => signInWithPassword(form({ email, password })));

const publishableClient = () =>
  createClient(url(), publishable(), { auth: { persistSession: false, autoRefreshToken: false } });

async function authUserRow(email: string) {
  const rows = await harnessSql()`
    select email_confirmed_at, encrypted_password from auth.users where email = ${email}`;
  expect(rows.length).toBe(1);
  return rows[0] as { email_confirmed_at: Date | null; encrypted_password: string | null };
}

describe('EZD-033 password sign-in actions', () => {
  let tenant: string;

  beforeAll(async () => {
    tenant = await createTenant();
  });

  beforeEach(() => {
    activate(newStore());
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  it('EZD-033 T3 wrong password, unknown email and unconfirmed account give the same result', async () => {
    const wrong = { resolved: { error: 'password_wrong' } };
    const member = await createPasswordMember({ tenantId: tenant });

    // (a) wrong password
    const storeA = newStore();
    expect(await signInWith(storeA, member.email, `${member.password}x`)).toEqual(wrong);
    expect(sbWrites(storeA)).toEqual([]);

    // (b) unknown email
    const storeB = newStore();
    expect(await signInWith(storeB, unknownEmail(), 'a-wrong-password-here')).toEqual(wrong);
    expect(sbWrites(storeB)).toEqual([]);

    // (c) a password given to signUp, never confirmed
    const c = await createTestMember({ tenantId: tenant, status: 'active' });
    const pc = await randomPassword(c.email);
    const signUp = await publishableClient().auth.signUp({ email: c.email, password: pc });
    expect(signUp.error).toBeNull();
    const storeC = newStore();
    expect(await signInWith(storeC, c.email, pc)).toEqual(wrong);
    expect(sbWrites(storeC)).toEqual([]);
    const rowC = await authUserRow(c.email);
    expect(rowC.email_confirmed_at).toBeNull();
    expect(rowC.encrypted_password).toBeNull();

    // (d) an unconfirmed account made with the admin API
    const d = await createTestMember({ tenantId: tenant, status: 'active' });
    const pd = await randomPassword(d.email);
    await createUnconfirmedPasswordUser(d.email, pd);
    const storeD = newStore();
    expect(await signInWith(storeD, d.email, pd)).toEqual(wrong);
    expect(sbWrites(storeD)).toEqual([]);
    const rowD = await authUserRow(d.email);
    expect(rowD.email_confirmed_at).toBeNull();
    expect(rowD.encrypted_password).toBeNull();

    // (e) 73 bytes and (f) empty: refused without a stored password being able to match
    const storeE = newStore();
    expect(await signInWith(storeE, member.email, 'x'.repeat(73))).toEqual(wrong);
    expect(sbWrites(storeE)).toEqual([]);
    const storeF = newStore();
    expect(await signInWith(storeF, member.email, '')).toEqual(wrong);
    expect(sbWrites(storeF)).toEqual([]);
  }, 60000);

  it('EZD-033 T7 the recovery email has no link and no code, and the password is unchanged', async () => {
    const r = await createPasswordMember({ tenantId: tenant });
    const before = new Date();
    const { error } = await publishableClient().auth.resetPasswordForEmail(r.email);
    expect(error).toBeNull();
    const mail = await waitForRawEmail(r.email, { after: before });
    await sleep(3000);
    expect(await countAuthEmails(r.email)).toBe(1);

    expect(mail.text).toContain(
      "Someone asked to reset your EZ Draft password. Open EZ Draft and choose 'Email me a code' to sign in. If this wasn't you, ignore this email.",
    );
    const en = mail.html.search(/lang="en"/);
    const es = mail.html.search(/lang="es"/);
    expect(en).toBeGreaterThanOrEqual(0);
    expect(es).toBeGreaterThan(en);
    expect([...mail.html.matchAll(/lang="es"/g)]).toHaveLength(1);
    for (const body of [mail.text, mail.html]) {
      expect(body).not.toContain('http');
      expect(body).not.toContain('href');
      expect(body).not.toMatch(/\b\d{6}\b/);
    }
    expect(mail.subject).toMatch(/^EZ Draft password reset requested \/ .*\S/);

    const store = newStore();
    expect(await signInWith(store, r.email, r.password)).toEqual({ redirect: '/' });
  }, 60000);

  it('EZD-033 T17 a password session is a code session: 400-day cookies, ended on deactivation', async () => {
    const s = await createPasswordMember({ tenantId: tenant });
    const store = newStore();
    expect(await signInWith(store, s.email, s.password)).toEqual({ redirect: '/' });
    const sb = sbWrites(store);
    expect(sb.length).toBeGreaterThanOrEqual(1);
    for (const w of sb) {
      expect(w.options.httpOnly).toBe(true);
      expect(w.options.sameSite).toBe('lax');
      expect(w.options.path).toBe('/');
      expect(w.options.maxAge).toBe(34560000);
    }

    // (b) deactivation ends the password session like any other
    activate(store);
    expect((await getSession())?.appUserId).toBe(s.appUserId);
    await harnessSql()`
      update public.membership set status = 'deactivated' where id = ${s.membershipId}::uuid`;
    activate(store);
    expect(await getSession()).toBeNull();
    activate(store);
    const res = await requireApiSession();
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect(await sessionCount(s.authUserId)).toBe(0);

    // (c) a valid pending invite is accepted at password sign-in
    const invited = await createPasswordMember({
      tenantId: tenant,
      status: 'invited',
      invitedAt: new Date(Date.now() - DAY),
    });
    emitMock.mockClear();
    const storeC = newStore();
    expect(await signInWith(storeC, invited.email, invited.password)).toEqual({ redirect: '/' });
    const membership = await harnessSql()`
      select status from public.membership where id = ${invited.membershipId}::uuid`;
    expect(membership[0].status).toBe('active');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'user.joined',
      { membershipId: invited.membershipId, appUserId: invited.appUserId, via: 'sign_in' },
      { tenantId: tenant, actorId: invited.appUserId },
    );

    // (d) only a deactivated membership: no access
    const gone = await createPasswordMember({ tenantId: tenant, status: 'deactivated' });
    const storeD = newStore();
    expect(await signInWith(storeD, gone.email, gone.password)).toEqual({
      resolved: { error: 'no_access' },
    });
    // Final state: Auth writes the token before completeSignIn signs out and deletes it.
    expect([...storeD.map].filter(([n, v]) => n.startsWith('sb-') && v !== '')).toEqual([]);
  }, 60000);

  it('EZD-033 T18 an Auth outage reports a code only: the password and email never reach Sentry or the logs', async () => {
    const m = await createPasswordMember({ tenantId: tenant });
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    clearSentryStubOutbox();

    const logged: string[] = [];
    const record = (...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    };
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(record),
    );
    const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      record(String(chunk));
      return true;
    });
    const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      record(String(chunk));
      return true;
    });

    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
      if (req.url.startsWith(`${url()}/auth/v1/token`)) {
        return new Response(JSON.stringify({ msg: 'unavailable' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return realFetch(input, init);
    });

    try {
      const result = await signInWith(newStore(), m.email, m.password);
      expect(result).toEqual({ resolved: { error: 'unavailable' } });
      await Sentry.flush(2000);
    } finally {
      fetchSpy.mockRestore();
      for (const spy of [...spies, out, err]) spy.mockRestore();
    }

    const events = eventsIn(readSentryStubOutbox());
    expect(
      events.filter((e) => e.tags?.['ezd.location'] === 'auth.sign_in').length,
    ).toBeGreaterThanOrEqual(1);
    const everything = [
      JSON.stringify(readSentryStubOutbox()),
      JSON.stringify(readStubOutbox()),
      ...logged,
    ].join('\n');
    expect(everything.split(m.password).length - 1).toBe(0);
    expect(everything.split(m.email).length - 1).toBe(0);
  }, 60000);
});
