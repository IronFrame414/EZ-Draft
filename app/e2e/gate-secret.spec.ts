// EZD-007f T21 (vault/plans/EZD-007f.md section 4; P-T21; Q-0087 (ii); CLAUDE.md rule 8): the PostgREST
// gate secret never reaches the browser. The secret is the one playwright.config.ts loads into
// process.env from `local.mjs env` (F6), the same value the web server holds.
import { expect, test, type Response } from '@playwright/test';
import { cleanupTestMembers, createTestMember } from '../test-harness/auth-users';
import { cleanup, closeHarness, createTenant } from '../test-harness/rls/fixtures';
import { signInWithCode } from '../test-harness/sign-in';

let tenantId: string;

test.beforeAll(async () => {
  tenantId = await createTenant();
});

test.afterAll(async () => {
  await cleanupTestMembers();
  await cleanup();
  await closeHarness();
});

test.describe('EZD-007f gate secret', () => {
  test('EZD-007f T21 the gate secret never reaches the browser', async ({ browser, baseURL }) => {
    const secret = process.env.SUPABASE_API_GATE_SECRET ?? '';
    // A blank secret would make the search below pass on nothing (CLAUDE.md rule 16).
    expect(secret.length).toBeGreaterThanOrEqual(43);

    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1600, height: 1000 },
    });
    const seen: Promise<{ url: string; headers: string[]; body: string }>[] = [];
    context.on('response', (r: Response) => {
      seen.push(
        (async () => {
          const headers = Object.values(await r.allHeaders());
          let body = '';
          try {
            body = (await r.body()).toString('utf8');
          } catch {
            // Redirect responses have no body.
          }
          return { url: r.url(), headers, body };
        })(),
      );
    });
    const page = await context.newPage();
    const m = await createTestMember({ tenantId, status: 'active' });

    await page.goto('/sign-in');
    await signInWithCode(page, m.email);
    await page.goto('/');
    await page.getByTestId('sign-out').waitFor({ state: 'visible' });
    await page.goto('/auth/confirm?token_hash=x&type=email');
    await page.waitForLoadState('networkidle');

    const all = await Promise.all(seen);
    expect(all.length).toBeGreaterThan(0);
    const inBodies = all.filter((x) => x.body.includes(secret)).map((x) => x.url);
    const inHeaders = all
      .filter((x) => x.headers.some((h) => h.includes(secret)))
      .map((x) => x.url);
    expect(inBodies).toHaveLength(0);
    expect(inHeaders).toHaveLength(0);
    await context.close();
  });
});
