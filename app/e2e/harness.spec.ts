// EZD-016a T1, T2, T3, T12, T13 (vault/plans/EZD-016a.md section 4). Specs import only from the harness
// test.ts. Fresh tenants and users come from EZD-006 createTenant / createMember and are removed in
// afterAll; seeded rows (EZD-005b tenant 1 and Josh) are only read. Tests match codes, URLs, claims, sizes
// and names, never wording. The gate secret is compared only as a boolean or count (L-018).
import type { BrowserContext } from '@playwright/test';
import {
  adminDb,
  captureTraffic,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  JOSH_USER_ID,
  signInAsOwner,
  test,
} from '../test-harness/e2e/test';

const pathOf = (url: string) => new URL(url).pathname;

// T1 expected sizes per project: 04 Frame; Q-0053; Q-0088; S17/S18 Layout.
const SIZES: Record<string, { width: number; height: number; browser: string }> = {
  desktop: { width: 1600, height: 1000, browser: 'chromium' },
  'ipad-landscape': { width: 1180, height: 820, browser: 'webkit' },
  surface: { width: 1440, height: 960, browser: 'chromium' },
  phone: { width: 390, height: 844, browser: 'webkit' },
};

// T2: contexts opened by the sessions fixture, checked in afterAll, which runs after the test's fixture
// teardown (afterEach runs before it).
const t2Contexts: { context: BrowserContext; closed: () => boolean }[] = [];

test.describe('EZD-016a harness', () => {
  test.afterAll(async () => {
    try {
      for (const c of t2Contexts) {
        expect(c.closed()).toBe(true);
        expect(c.context.pages()).toHaveLength(0);
      }
    } finally {
      await cleanup();
      await closeHarness();
    }
  });

  // T1 (AC-EZD-016a-1): Done when; Q-0088; Q-0053; 04; S17/S18; EZD-005b seed ids; EZD-006 claims;
  // EZD-007f `/`, `sign-out`; Q-0039 (c).
  test(
    'EZD-016a done when: a sample browser test signs in as the seeded owner @smoke',
    { tag: ['@desktop', '@ipad', '@surface', '@phone'] },
    async ({ page, browserName }, testInfo) => {
      const signed = await signInAsOwner(page);
      expect(pathOf(page.url())).toBe('/');
      await expect(page.getByTestId('sign-out')).toBeVisible();

      expect(signed.email).toBe('josh@example.com');
      expect(signed.app_user_id).toBe('00000000-0000-4000-8000-000000001001');
      expect(signed.tenant_id).toBe('00000000-0000-4000-8000-000000000001');
      expect(signed.project_scope).toBe('all');

      const want = SIZES[testInfo.project.name];
      expect(want, `project ${testInfo.project.name}`).toBeDefined();
      const viewport = page.viewportSize();
      expect(viewport).toEqual({ width: want.width, height: want.height });
      const inner = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }));
      expect(inner).toEqual(viewport);
      expect(browserName).toBe(want.browser);
    },
  );

  // T2 (AC-EZD-016a-1 Scope): Row Scope; 12 Edit lock row; Q-0087 (ii); docs/architecture.md RLS
  // (`app_user` own row).
  test(
    'EZD-016a T2 two signed-in sessions at once, each at the project size',
    { tag: ['@desktop', '@ipad', '@surface'] },
    async ({ sessions }, testInfo) => {
      const tenantA = await createTenant();
      const a = await createMember({ tenantId: tenantA, scope: 'all' });
      const b = await createMember({ tenantId: tenantA, scope: 'all' });

      const open = await sessions.open([a.email, b.email]);
      for (const s of open) {
        let closed = false;
        s.context.on('close', () => {
          closed = true;
        });
        t2Contexts.push({ context: s.context, closed: () => closed });
      }

      expect(open).toHaveLength(2);
      expect(open.map((s) => s.email)).toEqual([a.email, b.email]);
      const own = [a.appUserId, b.appUserId];
      for (const [i, s] of open.entries()) {
        expect(pathOf(s.page.url())).toBe('/');
        await expect(s.page.getByTestId('sign-out')).toBeVisible();
        expect(s.claims.app_user_id).toBe(own[i]);
        expect(s.claims.tenant_id).toBe(tenantA);
        expect(s.page.viewportSize()).toEqual(testInfo.project.use.viewport);

        const server = await s.serverDb.from('app_user').select('id').eq('id', own[i]);
        expect(server.error).toBeNull();
        expect((server.data ?? []).map((r) => r.id)).toEqual([own[i]]);

        const browser = await s.browserDb.from('app_user').select('id').eq('id', own[i]);
        expect(browser.data).toBeNull();
        expect(browser.error).not.toBeNull();
      }
      expect(open[0].claims.session_id).not.toBe(open[1].claims.session_id);
    },
  );

  // T3 (AC-EZD-016a-1 Scope): Row Scope; 12 Offline row; health/route.ts line 10; EZD-007d PUBLIC_PATHS.
  test(
    'EZD-016a T3 network off and on',
    { tag: ['@desktop', '@phone'] },
    async ({ page, network }) => {
      await page.goto('/sign-in');
      await page.evaluate(() => {
        const w = window as unknown as { __ezdOnline: number; __ezdOffline: number };
        w.__ezdOnline = 0;
        w.__ezdOffline = 0;
        window.addEventListener('online', () => {
          w.__ezdOnline += 1;
        });
        window.addEventListener('offline', () => {
          w.__ezdOffline += 1;
        });
      });
      const counts = () =>
        page.evaluate(() => {
          const w = window as unknown as { __ezdOnline: number; __ezdOffline: number };
          return { online: w.__ezdOnline, offline: w.__ezdOffline, onLine: navigator.onLine };
        });
      const health = () =>
        page.evaluate(async () => {
          try {
            const r = await fetch('/api/health', { cache: 'no-store' });
            return { rejected: false, status: r.status };
          } catch {
            return { rejected: true, status: 0 };
          }
        });

      await network.set(page, 'off');
      const off = await counts();
      expect(off.onLine).toBe(false);
      expect(off.offline).toBe(1);
      expect((await health()).rejected).toBe(true);

      await network.set(page, 'on');
      const on = await counts();
      expect(on.onLine).toBe(true);
      expect(on.online).toBe(1);
      const back = await health();
      expect(back.rejected).toBe(false);
      expect(back.status).toBe(200);
    },
  );

  // T12 (AC-EZD-016a-1 harness): Q-0087 (ii); CLAUDE.md rule 8; 03 rule 1; EZD-005b. Untagged: desktop only.
  test('EZD-016a T12 the gate secret stays out of the browser', async ({ page, context }) => {
    const secret = process.env.SUPABASE_API_GATE_SECRET ?? '';
    // A blank secret would make the search below pass on nothing (CLAUDE.md rule 16).
    expect(secret.length >= 43).toBe(true);

    const traffic = await captureTraffic(context);

    const signed = await signInAsOwner(page);
    await page.reload();
    await page.getByTestId('sign-out').waitFor({ state: 'visible' });
    const html = await page.evaluate(() => document.documentElement.outerHTML);

    const { requests, responses, cookieValues } = await traffic.settle();
    const docs = responses.filter(
      (r) => r.resourceType === 'document' || r.resourceType === 'script',
    );
    expect(requests.length > 0).toBe(true);
    expect(requests.filter((r) => r.external).length).toBe(0);
    expect(
      requests.filter((r) => r.headerNames.some((n) => n.includes('x-ezd-api-gate'))).length,
    ).toBe(0);
    expect(docs.length > 0).toBe(true);
    expect([...responses.map((r) => r.body), html].filter((t) => t.includes(secret)).length).toBe(
      0,
    );
    expect(responses.filter((r) => r.headerValues.some((v) => v.includes(secret))).length).toBe(0);
    expect(cookieValues.filter((v) => v.includes(secret)).length).toBe(0);

    const server = await signed.serverDb.from('app_user').select('id').eq('id', JOSH_USER_ID);
    expect(server.error).toBeNull();
    expect((server.data ?? []).map((r) => r.id)).toEqual([JOSH_USER_ID]);
    const browser = await signed.browserDb.from('app_user').select('id').eq('id', JOSH_USER_ID);
    expect(browser.error).not.toBeNull();
  });

  // T13 (AC-EZD-016a-1 helper): Step 2 item 2; V7; R24 #14. Untagged: desktop only.
  test('EZD-016a T13 an unknown email is refused before the browser', async ({
    page,
    signInAs,
  }) => {
    const email = 'ezd016a-nobody@example.test';
    let message = '';
    await signInAs(email).then(
      () => {
        message = '(resolved)';
      },
      (e: unknown) => {
        message = e instanceof Error ? e.message : String(e);
      },
    );
    expect(message.startsWith('no active membership for')).toBe(true);
    expect(page.url()).toBe('about:blank');

    const found: string[] = [];
    for (let p = 1; ; p++) {
      const { data, error } = await adminDb().auth.admin.listUsers({ page: p, perPage: 1000 });
      expect(error).toBeNull();
      for (const u of data.users) if ((u.email ?? '').toLowerCase() === email) found.push(u.id);
      if (data.users.length < 1000) break;
    }
    expect(found).toHaveLength(0);
  });
});
