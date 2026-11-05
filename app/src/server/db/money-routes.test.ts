// EZD-133 C1, C4, K1, K2, M1, M2, P1 (vault/plans/EZD-133.md section 4; AC-EZD-133-2, -3, -4; Architecture rule 2).
// next/headers is mocked and members sign in as in app/src/app/api/settings/customers/route.test.ts; emit and
// kickJobRunner are mocked (no sink, no job runs); the file holds the shared job-queue lock (EZD-009). Expected
// values: the case list (28 routes, 2026-11-04), Decided D8 (class to switch), Q-0087 (ii) for P1.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { CANARY_CASE, CANARY_FIELDS } from '../../../test-harness/money/canary-route';
import { MONEY_PAGE_CASES } from '../../../test-harness/money/page-cases';
import { listPages, uncoveredPages } from '../../../test-harness/money/pages';
import {
  MONEY_ROUTE_CASES,
  type CaseEnv,
} from '../../../test-harness/money/route-cases';
import { uncoveredRoutes } from '../../../test-harness/money/routes';
import { runMoneyCase } from '../../../test-harness/money/run-case';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  signIn,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { PERMISSION_KEYS, type PermissionKey } from '../../lib/permissions/catalog';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import { deniedMoneyClasses, MONEY_FIELDS } from './money-fields';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('../jobs/kick', () => ({ kickJobRunner: vi.fn() }));

vi.mock('../events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});

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

const APP_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

type User = {
  tenantId: string;
  projectId: string;
  member: Member;
  cookies: Map<string, string>;
  granted: PermissionKey[];
  env: CaseEnv;
};

describe('EZD-133 money fields only with their permission', () => {
  let release: () => Promise<void> = async () => {};
  let noCost: User;
  let noSell: User;

  async function makeUser(without: PermissionKey): Promise<User> {
    const tenantId = await createTenant();
    const [projectId] = await createProjects(tenantId, 1);
    const member = await createMember({ tenantId, scope: 'all' });
    const granted = PERMISSION_KEYS.filter((k) => k !== without);
    await setPermissions(tenantId, member.membershipId, granted);
    return {
      tenantId,
      projectId,
      member,
      cookies: await cookiesFor(member.email),
      granted,
      env: { tenantId, projectId, member, created: new Map() },
    };
  }

  beforeAll(async () => {
    release = await holdJobQueueShared();
    noCost = await makeUser('see_company_costs');
    noSell = await makeUser('see_sell_prices');
  }, 120000);

  afterAll(async () => {
    try {
      for (const u of [noCost, noSell]) {
        if (!u) continue;
        const sources = [u.env.created.get('storagePath')].filter((p): p is string => !!p);
        const media = ['checkedLogoPath', 'logoPath']
          .map((k) => u.env.created.get(k))
          .filter((p): p is string => !!p);
        if (sources.length) await adminDb().storage.from('sources').remove(sources);
        if (media.length) await adminDb().storage.from('media').remove(media);
      }
      await cleanup();
    } finally {
      try {
        await closeHarness();
      } finally {
        await release();
      }
    }
  });

  it('C1 every exported route method has a money case and every case names a real method @smoke', () => {
    const result = uncoveredRoutes(APP_SRC, MONEY_ROUTE_CASES);
    expect(result.missing).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it('C4 every page file has a money page case and every case names a real page; there are 32 pages @smoke', () => {
    const result = uncoveredPages(APP_SRC, MONEY_PAGE_CASES);
    expect(result.missing).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(listPages(APP_SRC).length).toBe(32);
  });

  it('K1 the canary route leaks its cost key and the scan reports it @smoke', async () => {
    const env = { ...noCostEnvStub() };
    const r = await runMoneyCase(CANARY_CASE, env, [...MONEY_FIELDS, ...CANARY_FIELDS], [
      'company_cost',
    ]);
    expect(r.status).toBe(200);
    expect(r.violations).toEqual(['$.item.canaryCost']);
  });

  it('K2 the canary route leaks its sell key and the scan reports it', async () => {
    const r = await runMoneyCase(CANARY_CASE, noCostEnvStub(), [...MONEY_FIELDS, ...CANARY_FIELDS], [
      'sell_price',
    ]);
    expect(r.status).toBe(200);
    expect(r.violations).toEqual(['$.item.canarySell']);
  });

  async function runAll(u: User): Promise<string[]> {
    const denied = deniedMoneyClasses(new Set(u.granted));
    const failures: string[] = [];
    for (const c of MONEY_ROUTE_CASES) {
      state.store = new Map(u.cookies);
      let outcome: { status: number; violations: string[] };
      try {
        outcome = await runMoneyCase(c, u.env, MONEY_FIELDS, denied);
      } catch (e) {
        failures.push(`${c.method} ${c.file}: threw ${(e as Error).message}`);
        continue;
      } finally {
        vi.resetModules();
      }
      if (outcome.status !== c.expectStatus) {
        failures.push(`${c.method} ${c.file}: status ${outcome.status}, expected ${c.expectStatus}`);
      }
      if (outcome.violations.length > 0) {
        failures.push(`${c.method} ${c.file}: ${outcome.violations.join(', ')}`);
      }
    }
    return failures;
  }

  it('M1 no route answers a member without See company costs with a cost field @smoke', async () => {
    expect(await runAll(noCost)).toEqual([]);
  }, 120000);

  it('M2 no route answers a member without See sell prices with a sell price field @smoke', async () => {
    expect(await runAll(noSell)).toEqual([]);
  }, 120000);

  it('P1 a browser client without the server gate cannot read any money column, nor a control column', async () => {
    const s = await signIn(noCost.member.email);
    const targets = [
      ...MONEY_FIELDS.map((f) => ({ schema: f.schema, table: f.table, column: f.column })),
      { schema: 'public' as const, table: 'project', column: 'id' },
    ];
    const codes: string[] = [];
    for (const t of targets) {
      const r = await s.browserDb.schema(t.schema).from(t.table).select(t.column);
      codes.push(`${t.schema}.${t.table}.${t.column}: ${r.error?.code}`);
    }
    expect(codes).toEqual(targets.map((t) => `${t.schema}.${t.table}.${t.column}: 42501`));
  });

  function noCostEnvStub(): CaseEnv {
    return { tenantId: '', projectId: '', member: { appUserId: '', authUserId: '', membershipId: '', email: '' }, created: new Map() };
  }
});
