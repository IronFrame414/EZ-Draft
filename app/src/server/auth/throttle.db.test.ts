// EZD-033 T11-T16 (vault/plans/EZD-033.md Tests; Steps 3 and 5; Q-0094, Q-0101, Q-0104): the sign-in
// throttle through the actions (T11-T14), the take and settle functions on their own (T15) and the locked-down
// table and functions (T16). Local database; next/headers is mocked as in EZD-007d's sign-in.test.ts
// (cookies() is an in-memory store per person, headers() sets x-forwarded-for when a case gives one).
// redirect is not mocked: a success is a rejection whose digest URL part is the target. Throttle keys come
// from the gate secret the Vitest global setup sets. The IP tests use their own TEST-NET-3 addresses
// (RFC 5737) and clear their rows before and after, so no bucket is shared with another test.
// Sends to one address are spaced by the local [auth.email] max_frequency (supabase/config.toml) plus 100 ms.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestMembers,
  createPasswordMember,
  createTestMember,
} from '../../../test-harness/auth-users';
import { countAuthEmails, waitForAuthEmail } from '../../../test-harness/mail-catcher';
import { adminSql } from '../../../test-harness/rls/db';
import { auditRls } from '../../../test-harness/rls/audit';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { TABLE_GRANTS } from '../../../test-harness/rls/table-grants';
import { TENANTLESS_TABLES } from '../../../test-harness/rls/tenancy-exemptions';
import { freshKey, insertThrottleRows, throttleRows } from '../../../test-harness/throttle';
import { requestSignIn, signInWithPassword, verifySignInCode } from './actions';
import { throttleKey } from './throttle';

type Write = { name: string; value: string; options: Record<string, unknown>; deleted: boolean };
type Store = { map: Map<string, string>; writes: Write[] };

const state = vi.hoisted(() => ({
  store: { map: new Map<string, string>(), writes: [] as unknown[] } as {
    map: Map<string, string>;
    writes: unknown[];
  },
  xff: null as string | null,
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
  headers: async () => {
    const h = new Headers();
    if (state.xff) h.set('x-forwarded-for', state.xff);
    return h;
  },
}));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const macrotask = () => sleep(0);

const newStore = (entries: [string, string][] = []): Store => ({
  map: new Map(entries),
  writes: [],
});
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

// Session cookies only: requestSignIn writes sb-...-code-verifier cookies (EZD-007d), which are not a session.
const sbWrites = (store: Store) =>
  store.writes.filter(
    (w) => w.name.startsWith('sb-') && !w.name.endsWith('-code-verifier') && w.value !== '',
  );

const unknownEmail = () => `nobody-${randomUUID().slice(0, 12)}@example.test`;

// [auth.email] max_frequency from the local config, in milliseconds (EZD-007d D2).
function maxFrequencyMs(): number {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const toml = readFileSync(
    path.join(here, '..', '..', '..', '..', 'supabase', 'config.toml'),
    'utf8',
  );
  const start = toml.indexOf('\n[auth.email]\n');
  const rest = toml.slice(start + 1);
  const next = rest.slice(1).search(/\n\[/);
  const table = next < 0 ? rest : rest.slice(0, next + 1);
  const m = /^\s*max_frequency\s*=\s*"(\d+)(s|ms)"/m.exec(table);
  if (!m) throw new Error('max_frequency not found in config.toml [auth.email]');
  return m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
}

const lastSend = new Map<string, number>();
async function spaced(email: string, gapMs: number) {
  const last = lastSend.get(email);
  if (last !== undefined) {
    const wait = last + gapMs - Date.now();
    if (wait > 0) await sleep(wait);
  }
  lastSend.set(email, Date.now());
}

const IP_A = '203.0.113.7';
const IP_B = '203.0.113.8';

describe('EZD-033 sign-in throttle', () => {
  let tenant: string;
  const gap = () => maxFrequencyMs() + 100;

  const clearIps = async () => {
    for (const addr of [IP_A, IP_B]) {
      await harnessSql()`
        delete from public.sign_in_throttle
        where kind = 'ip' and key_hash = ${throttleKey('ip', addr)}`;
    }
  };

  beforeAll(async () => {
    tenant = await createTenant();
    await clearIps();
  });

  beforeEach(() => {
    state.xff = null;
    activate(newStore());
  });

  afterAll(async () => {
    await clearIps();
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  it('EZD-033 T11 wrong passwords are throttled per email and the emailed code stays open', async () => {
    const w = await createPasswordMember({ tenantId: tenant });
    const store = newStore();
    for (let i = 1; i <= 5; i += 1) {
      expect(
        await run(store, () =>
          signInWithPassword(form({ email: w.email, password: `wrong-password-${i}` })),
        ),
        `attempt ${i}`,
      ).toEqual({ resolved: { error: 'password_wrong' } });
    }
    expect(
      await run(store, () => signInWithPassword(form({ email: w.email, password: w.password }))),
    ).toEqual({ resolved: { error: 'password_throttled' } });
    expect(sbWrites(store)).toEqual([]);
    expect(await throttleRows('password', throttleKey('email', w.email))).toBe(5);

    // The code stays open while passwords are throttled.
    await spaced(w.email, gap());
    const before = new Date();
    expect(await run(store, () => requestSignIn(form({ email: w.email })))).toEqual({
      resolved: { step: 'code' },
    });
    const mail = await waitForAuthEmail(w.email, { after: before });
    expect(await run(store, () => verifySignInCode(form({ code: mail.code })))).toEqual({
      redirect: '/',
    });

    // An unknown email is throttled the same way (no account is revealed).
    const ghost = unknownEmail();
    const ghostStore = newStore();
    for (let i = 1; i <= 5; i += 1) {
      expect(
        await run(ghostStore, () =>
          signInWithPassword(form({ email: ghost, password: `wrong-password-${i}` })),
        ),
        `unknown attempt ${i}`,
      ).toEqual({ resolved: { error: 'password_wrong' } });
    }
    expect(
      await run(ghostStore, () =>
        signInWithPassword(form({ email: ghost, password: 'wrong-password-6' })),
      ),
    ).toEqual({ resolved: { error: 'password_throttled' } });
  }, 120000);

  it('EZD-033 T12 wrong codes are throttled per email; the password stays open', async () => {
    const k = await createPasswordMember({ tenantId: tenant });
    const store = newStore();
    await spaced(k.email, gap());
    const before = new Date();
    expect(await run(store, () => requestSignIn(form({ email: k.email })))).toEqual({
      resolved: { step: 'code' },
    });
    const { code } = await waitForAuthEmail(k.email, { after: before });
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    for (let i = 1; i <= 10; i += 1) {
      expect(
        await run(store, () => verifySignInCode(form({ code: wrong }))),
        `attempt ${i}`,
      ).toEqual({
        resolved: { error: 'code_invalid' },
      });
    }
    expect(await run(store, () => verifySignInCode(form({ code })))).toEqual({
      resolved: { error: 'code_throttled' },
    });
    expect(sbWrites(store)).toEqual([]);

    expect(
      await run(store, () => signInWithPassword(form({ email: k.email, password: k.password }))),
    ).toEqual({ redirect: '/' });
  }, 120000);

  it('EZD-033 T13 sign-in emails are throttled per email, the same for an unknown address', async () => {
    const e = await createTestMember({ tenantId: tenant, status: 'active' });
    const ghost = unknownEmail();
    for (const email of [e.email, ghost]) {
      const store = newStore();
      for (let i = 1; i <= 6; i += 1) {
        await spaced(email, gap());
        const out = await run(store, () => requestSignIn(form({ email })));
        expect(out, `${i}`).toEqual({
          resolved: i <= 5 ? { step: 'code' } : { error: 'email_throttled' },
        });
      }
    }
    await sleep(3000);
    expect(await countAuthEmails(e.email)).toBe(5);
  }, 120000);

  it('EZD-033 T14 per-IP throttle', async () => {
    const member = await createPasswordMember({ tenantId: tenant });
    state.xff = IP_A;
    for (let i = 1; i <= 30; i += 1) {
      expect(
        await run(newStore(), () => requestSignIn(form({ email: unknownEmail() }))),
        `request ${i}`,
      ).toEqual({ resolved: { step: 'code' } });
    }
    expect(await run(newStore(), () => requestSignIn(form({ email: unknownEmail() })))).toEqual({
      resolved: { error: 'ip_throttled' },
    });
    const store = newStore();
    expect(
      await run(store, () =>
        signInWithPassword(form({ email: member.email, password: member.password })),
      ),
    ).toEqual({ resolved: { error: 'ip_throttled' } });
    expect(sbWrites(store)).toEqual([]);
    expect(await throttleRows('ip', throttleKey('ip', IP_A))).toBe(30);

    state.xff = IP_B;
    expect(await run(newStore(), () => requestSignIn(form({ email: unknownEmail() })))).toEqual({
      resolved: { step: 'code' },
    });
  }, 120000);

  describe('take and settle on their own', () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    type Take = {
      allowed: boolean;
      limited_by: string | null;
      attempt_id: string | null;
      ip_attempt_id: string | null;
    };
    const take = async (kind: string, emailKey: string | null, ipKey: string | null) => {
      const rows = await harnessSql()<Take[]>`
        select * from public.sign_in_throttle_take(${kind}::text, ${emailKey}::text, ${ipKey}::text)`;
      expect(rows.length).toBe(1);
      return rows[0];
    };
    const settle = (attemptId: string | null, ipAttemptId: string | null) =>
      harnessSql()`select public.sign_in_throttle_settle(${attemptId}::uuid, ${ipAttemptId}::uuid)`;
    const rowCount = async (key: string) =>
      (
        await harnessSql()`
          select count(*)::int as n from public.sign_in_throttle where key_hash = ${key}`
      )[0].n as number;
    const failedOf = async (id: string) =>
      (
        await harnessSql()`
          select failed from public.sign_in_throttle where id = ${id}::uuid`
      )[0].failed as boolean;

    it('EZD-033 T15 (a)-(g) email windows', async () => {
      let ek = freshKey();
      await insertThrottleRows('password', ek, 5, { ageSeconds: 899 });
      expect(await take('password', ek, null)).toMatchObject({
        allowed: false,
        limited_by: 'password',
      }); // (a)

      ek = freshKey();
      await insertThrottleRows('password', ek, 5, { ageSeconds: 901 });
      expect((await take('password', ek, null)).allowed).toBe(true); // (b)

      ek = freshKey();
      await insertThrottleRows('password', ek, 5, { ageSeconds: 60, failed: false });
      expect((await take('password', ek, null)).allowed).toBe(true); // (c)

      ek = freshKey();
      await insertThrottleRows('code', ek, 10, { ageSeconds: 899 });
      expect(await take('code', ek, null)).toMatchObject({ allowed: false, limited_by: 'code' }); // (d)

      ek = freshKey();
      await insertThrottleRows('code', ek, 9, { ageSeconds: 60 });
      expect((await take('code', ek, null)).allowed).toBe(true); // (e)

      ek = freshKey();
      await insertThrottleRows('email', ek, 5, { ageSeconds: 3599 });
      expect(await take('email', ek, null)).toMatchObject({ allowed: false, limited_by: 'email' }); // (f)

      ek = freshKey();
      await insertThrottleRows('email', ek, 5, { ageSeconds: 3601 });
      expect((await take('email', ek, null)).allowed).toBe(true); // (g)
    });

    it('EZD-033 T15 (h)-(j), (n), (p) IP windows and clean-up', async () => {
      let ipk = freshKey();
      await insertThrottleRows('ip', ipk, 30, { ageSeconds: 899 });
      expect(await take('link', null, ipk)).toMatchObject({ allowed: false, limited_by: 'ip' }); // (h)

      ipk = freshKey();
      await insertThrottleRows('ip', ipk, 29);
      expect((await take('link', null, ipk)).allowed).toBe(true); // (i)

      const old = freshKey();
      await insertThrottleRows('password', old, 1, { ageSeconds: 3660 });
      await take('link', null, freshKey());
      expect(await rowCount(old)).toBe(0); // (j)

      ipk = freshKey();
      await insertThrottleRows('ip', ipk, 30, { ageSeconds: 60, failed: false });
      expect((await take('link', null, ipk)).allowed).toBe(true); // (n)

      ipk = freshKey();
      for (let i = 0; i < 30; i += 1) {
        expect((await take('email', freshKey(), ipk)).allowed, `email take ${i + 1}`).toBe(true);
      }
      expect(await take('link', null, ipk)).toMatchObject({ allowed: false, limited_by: 'ip' }); // (p)
    });

    it('EZD-033 T15 (k), (l), (o) what a take inserts and what settle changes', async () => {
      const ek = freshKey();
      const pw = await take('password', ek, null);
      expect(pw.allowed).toBe(true);
      expect(pw.attempt_id).toMatch(UUID_V4);
      expect(pw.ip_attempt_id).toBeNull();
      expect(await rowCount(ek)).toBe(1);
      expect(await throttleRows('password', ek)).toBe(1); // (k)

      const ipk = freshKey();
      const link = await take('link', null, ipk);
      expect(link.allowed).toBe(true);
      expect(link.attempt_id).toBeNull();
      expect(link.ip_attempt_id).toMatch(UUID_V4);
      expect(await rowCount(ipk)).toBe(1);
      expect(await throttleRows('ip', ipk)).toBe(1); // (k)

      await settle(pw.attempt_id, null);
      expect(await failedOf(pw.attempt_id as string)).toBe(false); // (l)

      const both = await take('password', freshKey(), freshKey());
      expect(both.attempt_id).toMatch(UUID_V4);
      expect(both.ip_attempt_id).toMatch(UUID_V4);
      await settle(both.attempt_id, both.ip_attempt_id);
      expect(await failedOf(both.attempt_id as string)).toBe(false);
      expect(await failedOf(both.ip_attempt_id as string)).toBe(false); // (o)
    });

    it('EZD-033 T15 (m) bad input raises 22023', async () => {
      const codeOf = async (p: Promise<unknown>) => {
        try {
          await p;
        } catch (e) {
          return (e as { code?: string }).code;
        }
        return undefined;
      };
      expect(await codeOf(take('reset', freshKey(), null))).toBe('22023');
      expect(await codeOf(take('password', 'XYZ', null))).toBe('22023');
    });
  });

  it('EZD-033 T16 the throttle table and functions are locked down', async () => {
    const s = harnessSql();
    const columns = await s`
      select a.attname::text as name
      from pg_attribute a
      where a.attrelid = 'public.sign_in_throttle'::regclass and a.attnum > 0 and not a.attisdropped
      order by a.attname::text`;
    expect(columns.map((c) => c.name)).toEqual(['at', 'failed', 'id', 'key_hash', 'kind']);

    const rls = await s`
      select relrowsecurity from pg_class where oid = 'public.sign_in_throttle'::regclass`;
    expect(rls[0].relrowsecurity).toBe(true);
    const policies = await s`
      select roles::text[] as roles, cmd, qual, with_check from pg_policies
      where schemaname = 'public' and tablename = 'sign_in_throttle'`;
    expect(policies.length).toBe(1);
    expect(policies[0].roles).toEqual(['authenticated']);
    expect(policies[0].cmd).toBe('ALL');
    expect(policies[0].qual).toBe('false');
    expect(policies[0].with_check).toBe('false');

    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        const r =
          await s`select has_table_privilege(${role}, 'public.sign_in_throttle', ${priv}) as ok`;
        expect(r[0].ok, `${role} ${priv}`).toBe(false);
      }
    }
    for (const priv of ['select', 'insert', 'update', 'delete']) {
      const r =
        await s`select has_table_privilege('service_role', 'public.sign_in_throttle', ${priv}) as ok`;
      expect(r[0].ok, `service_role ${priv}`).toBe(true);
    }

    expect(TABLE_GRANTS.sign_in_throttle.privileges).toEqual([]);
    expect(TABLE_GRANTS.sign_in_throttle.reason.length).toBeGreaterThan(0);
    const exempt = TENANTLESS_TABLES.find((t) => t.table === 'sign_in_throttle');
    expect(exempt?.reason.length ?? 0).toBeGreaterThan(0);

    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
    );
    const audit = adminSql();
    try {
      const problems = (await auditRls(audit, { repoRoot })).filter(
        (p) => p.table === 'sign_in_throttle',
      );
      expect(problems).toEqual([]);
    } finally {
      await audit.end({ timeout: 5 });
    }

    for (const fn of ['sign_in_throttle_take', 'sign_in_throttle_settle']) {
      const f = await s`
        select p.prosecdef, p.proconfig, p.oid,
          has_function_privilege('anon', p.oid, 'execute') as anon_ok,
          has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
          exists (
            select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'
          ) as public_ok
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = ${fn}`;
      expect(f.length, fn).toBe(1);
      expect(f[0].prosecdef, fn).toBe(true);
      expect(f[0].proconfig as string[], fn).toContain('search_path=""');
      expect(f[0].anon_ok, fn).toBe(true);
      expect(f[0].auth_ok, fn).toBe(true);
      expect(f[0].public_ok, fn).toBe(false);
    }

    const member = await createMember({ tenantId: tenant, scope: 'all' });
    const session = await signIn(member.email);
    const rpc = await session.browserDb.rpc('sign_in_throttle_take', {
      p_kind: 'link',
      p_email_key: null,
      p_ip_key: '0'.repeat(64),
    });
    expect(rpc.error?.code).toBe('42501');
    const read = await session.browserDb.from('sign_in_throttle').select();
    expect(read.error?.code).toBe('42501');
  }, 60000);
});
