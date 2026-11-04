// EZD-007f browser tests (vault/plans/EZD-007f.md sections 3, 4; parent vault/plans/EZD-007.md P-T1, P-T2,
// P-T3, P-T14, P-T15, P-T22, P-T23; new rows T38, T40). Users are fresh createTestMember rows in a fresh
// createTenant, never a seeded row. Codes and links come from the local mail catcher (CLAUDE.md rule 6).
// Text is compared with the en / es catalogs, never copied wording. Two sign-in emails to one address
// are sent at least 1,100 ms apart (EZD-007d D2).
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { en } from '../src/server/messages/catalogs/en';
import { es } from '../src/server/messages/catalogs/es';
import { cleanupTestMembers, createTestMember } from '../test-harness/auth-users';
import { waitForAuthEmail, type AuthEmail } from '../test-harness/mail-catcher';
import { adminDb, cleanup, closeHarness, createTenant } from '../test-harness/rls/fixtures';
import { signInWithCode } from '../test-harness/sign-in';
import { captureTraffic } from '../test-harness/e2e/test';

const EMAIL_GAP_MS = 1100;
// 400 days (Q-0048 (a); EZD-007d cookie maxAge 34,560,000 s), with the plan's 1,000 s tolerance.
const LANG_MAX_AGE_LOW = 34_559_000;
const LANG_MAX_AGE_HIGH = 34_561_000;

const T = {
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
};
const text = (lang: 'en' | 'es', key: string): string => T[lang][key] as string;

let tenantId: string;

const activeMember = () => createTestMember({ tenantId, status: 'active' });

async function newContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
}

const path = (page: Page) => new URL(page.url()).pathname;

// The language wrapper of the signed-out pages: the innermost div[lang] holding the card.
const langBox = (page: Page) =>
  page.locator('div[lang]', { has: page.getByTestId('sign-in-card') }).last();

// Step 1 to step 2: type the email, press send, wait for the code field, read the email sent after it.
async function requestCode(page: Page, email: string): Promise<AuthEmail> {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-email').fill(email);
  const after = new Date();
  await page.getByTestId('sign-in-submit').click();
  await page.getByTestId('sign-in-code').waitFor({ state: 'visible' });
  return waitForAuthEmail(email, { after });
}

async function waitUntil(t: number): Promise<void> {
  const ms = t - Date.now();
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

const sbCookies = async (context: BrowserContext) =>
  (await context.cookies()).filter((c) => c.name.startsWith('sb-'));

test.describe('EZD-007f sign-in pages', () => {
  test.beforeAll(async () => {
    tenantId = await createTenant();
  });

  test.afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  // T1 (AC-1, AC-2): P-T1; Done when; EZD-007c (httpOnly); EZD-007d proxy (307).
  test(
    'EZD-007f done when: link from the mail catcher signs in and the user signs out',
    { tag: '@smoke' },
    async ({ page, context }) => {
      const m = await activeMember();
      await page.goto('/sign-in');
      await page.getByTestId('sign-in-email').fill(m.email);
      const after = new Date();
      await page.getByTestId('sign-in-submit').click();
      const mail = await waitForAuthEmail(m.email, { after });
      await page.goto(mail.link);
      await page.getByTestId('confirm-submit').click();
      await page.waitForURL((u) => u.pathname === '/');
      expect(path(page)).toBe('/');
      await expect(page.getByTestId('sign-out')).toBeVisible();
      const signedIn = await sbCookies(context);
      expect(signedIn.filter((c) => c.httpOnly).length).toBeGreaterThanOrEqual(1);

      await page.getByTestId('sign-out').click();
      await page.waitForURL((u) => u.pathname === '/sign-in');
      expect(path(page)).toBe('/sign-in');
      await page.goto('/');
      expect(path(page)).toBe('/sign-in');
      const left = (await sbCookies(context)).filter((c) => c.value !== '');
      expect(left).toHaveLength(0);
    },
  );

  // T2 and T3 share one email (T3 opens T2's link), so they run in order.
  test.describe('code and link are one token', () => {
    test.describe.configure({ mode: 'serial' });
    let t2Link = '';

    // T2 (AC-3): P-T2; R26 R15.
    test('EZD-007f done when: typing the 6-digit code signs in without opening the link', async ({
      browser,
      baseURL,
    }) => {
      const m = await activeMember();
      const context = await newContext(browser, baseURL);
      const requested: string[] = [];
      context.on('request', (r) => requested.push(new URL(r.url()).pathname));
      const page = await context.newPage();

      const mail = await requestCode(page, m.email);
      t2Link = mail.link;
      expect(mail.code).toMatch(/^\d{6}$/);
      await page.getByTestId('sign-in-code').fill(mail.code);
      await page.getByTestId('sign-in-code-submit').click();
      await page.waitForURL((u) => u.pathname === '/');
      expect(path(page)).toBe('/');
      await expect(page.getByTestId('sign-out')).toBeVisible();
      expect(requested.filter((p) => p === '/auth/confirm')).toHaveLength(0);
      await context.close();
    });

    // T3 (AC-3): P-T3 (P-Step 3: code and link are one one-time token).
    test('EZD-007f T3 one email, one sign-in: the used email link is refused', async ({
      browser,
      baseURL,
    }) => {
      expect(t2Link).not.toBe('');
      const context = await newContext(browser, baseURL);
      const page = await context.newPage();
      await page.goto(t2Link);
      await page.getByTestId('confirm-submit').click();
      await expect(page.getByTestId('confirm-error')).toHaveText(text('en', 'error.link_invalid'));
      expect(path(page)).not.toBe('/');
      await context.close();
    });
  });

  // T14 (AC-4): P-T14; 11 Accessibility; EZD-003 T8; F1. EZD-033 edit: Q-0091 (one password box).
  test('EZD-007f T14 one password field on step 1 and none on the code step, 44 px touch targets, page title', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    await expect(page.locator('input[type=password]')).toHaveCount(1);
    for (const id of ['sign-in-email', 'sign-in-submit']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.height, id).toBeGreaterThanOrEqual(44);
    }
    expect(await page.title()).toContain('EZ Draft');

    const m = await activeMember();
    await requestCode(page, m.email);
    await expect(page.locator('input[type=password]')).toHaveCount(0);
    for (const id of ['sign-in-code', 'sign-in-code-submit']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.height, id).toBeGreaterThanOrEqual(44);
    }
  });

  // T15 (AC-4): P-T15; EZD-007d signOut (scope 'local'); ticket Scope (long-lived field sessions).
  test("EZD-007f done when: sign-out ends only that device's session", async ({
    browser,
    baseURL,
  }) => {
    const m = await activeMember();
    const a = await newContext(browser, baseURL);
    const b = await newContext(browser, baseURL);
    const pageA = await a.newPage();
    const pageB = await b.newPage();

    await signInWithCode(pageA, m.email);
    const firstAt = Date.now();
    await waitUntil(firstAt + EMAIL_GAP_MS);
    await signInWithCode(pageB, m.email);

    await pageA.getByTestId('sign-out').click();
    await pageA.waitForURL((u) => u.pathname === '/sign-in');
    expect(path(pageA)).toBe('/sign-in');

    await pageB.reload();
    expect(path(pageB)).toBe('/');
    await expect(pageB.getByTestId('sign-out')).toBeVisible();
    await a.close();
    await b.close();
  });

  // T22 (AC-4): P-T22; Q-0047; Q-0029 (a); R26 R17; Q-0121 (a); Q-0048 (a).
  test('EZD-007f done when: the sign-in page switches to Español and remembers it on the device', async ({
    browser,
    baseURL,
  }) => {
    const a = await newContext(browser, baseURL);
    const pageA = await a.newPage();
    await pageA.goto('/sign-in');
    await expect(langBox(pageA)).toHaveAttribute('lang', 'en');
    await expect(pageA.locator('h1')).toHaveText(text('en', 'common.sign_in.title'));
    await expect(pageA.getByTestId('sign-in-lang-en')).toHaveAttribute('aria-pressed', 'true');

    const expectSpanish = async () => {
      await expect(langBox(pageA)).toHaveAttribute('lang', 'es');
      await expect(pageA.locator('h1')).toHaveText(text('es', 'common.sign_in.title'));
      await expect(pageA.getByTestId('sign-in-lang-es')).toHaveAttribute('aria-pressed', 'true');
      const now = Date.now() / 1000;
      const lang = (await a.cookies()).find((c) => c.name === 'ezd_sign_in_lang');
      expect(lang).toBeDefined();
      expect(lang!.value).toBe('es');
      expect(lang!.httpOnly).toBe(true);
      expect(lang!.expires).toBeGreaterThanOrEqual(now + LANG_MAX_AGE_LOW);
      expect(lang!.expires).toBeLessThanOrEqual(now + LANG_MAX_AGE_HIGH);
    };

    await pageA.getByTestId('sign-in-lang-es').click();
    await expectSpanish();
    await pageA.reload();
    await expectSpanish();

    await pageA.goto('/auth/confirm?token_hash=x&type=email');
    await expect(langBox(pageA)).toHaveAttribute('lang', 'es');
    await pageA.getByTestId('sign-in-lang-en').click();
    await expect(langBox(pageA)).toHaveAttribute('lang', 'en');
    expect(pageA.url()).toContain('token_hash=x');

    const b = await newContext(browser, baseURL);
    const pageB = await b.newPage();
    await pageB.goto('/sign-in');
    await expect(langBox(pageB)).toHaveAttribute('lang', 'en');
    await b.close();

    await pageA.goto('/sign-in');
    await pageA.getByTestId('sign-in-lang-es').click();
    await expect(langBox(pageA)).toHaveAttribute('lang', 'es');
    const m = await activeMember();
    await signInWithCode(pageA, m.email);
    await expect(pageA.getByTestId('sign-out')).toHaveText(text('en', 'common.sign_in.sign_out'));
    const { data, error } = await adminDb()
      .from('app_user')
      .select('language')
      .eq('id', m.appUserId)
      .single();
    expect(error).toBeNull();
    expect((data as { language: string }).language).toBe('en');
    await a.close();
  });

  // T23 (AC-4): P-T23; Q-0035 note; Q-0100.
  test('EZD-007f done when: the sign-in page never shows the link or the code and tells the user to check spam', async ({
    browser,
    baseURL,
  }) => {
    const m = await activeMember();
    const context = await newContext(browser, baseURL);
    const traffic = await captureTraffic(context);
    const page = await context.newPage();
    await page.goto('/sign-in');
    await page.getByTestId('sign-in-email').fill(m.email);
    const after = new Date();
    await page.getByTestId('sign-in-submit').click();
    await page.getByTestId('sign-in-code').waitFor({ state: 'visible' });
    await expect(page.getByTestId('sign-in-check-spam')).toBeVisible();
    await expect(page.getByTestId('sign-in-check-spam')).toHaveText(
      text('en', 'common.sign_in.check_spam'),
    );
    traffic.stop();

    const mail = await waitForAuthEmail(m.email, { after });
    const tokenHash = new URL(mail.link).searchParams.get('token_hash') ?? '';
    expect(tokenHash).not.toBe('');
    const { requests, responses } = await traffic.settle();
    const all = responses.map((r) => r.body);
    expect(all.length).toBeGreaterThan(0);
    expect(requests.filter((r) => r.external)).toHaveLength(0);
    expect(all.filter((b) => b.includes(tokenHash))).toHaveLength(0);
    expect(all.filter((b) => b.includes('/auth/confirm'))).toHaveLength(0);
    expect(await page.innerText('body')).not.toContain(mail.code);
    await context.close();
  });

  // T38 (AC-2, AC-4): P-Step 5; EZD-007d (code_invalid); F2, F3.
  test('EZD-007f T38 page states', async ({ page, context }) => {
    // (a) No query on the confirm page.
    await page.goto('/auth/confirm');
    await expect(page.getByTestId('confirm-error')).toHaveText(text('en', 'error.link_invalid'));
    await expect(page.getByTestId('confirm-submit')).toHaveCount(0);
    const title = text('en', 'common.sign_in.title');
    await expect(
      page
        .locator('a[href="/sign-in"]')
        .filter({
          hasText: new RegExp(`^\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`),
        })
        .first(),
    ).toBeVisible();

    // (b) Headers of the confirm page; GET never verifies.
    const res = await page.goto('/auth/confirm?token_hash=x&type=email');
    expect(res).not.toBeNull();
    const headers = res!.headers();
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cache-control'] ?? '').toContain('no-store');
    await expect(page.getByTestId('confirm-submit')).toBeVisible();

    // (c) No access.
    await page.goto('/sign-in?e=no_access');
    await expect(page.getByTestId('sign-in-error')).toHaveText(text('en', 'error.no_access'));

    // (d) Wrong code.
    const m = await activeMember();
    const mail = await requestCode(page, m.email);
    const firstAt = Date.now();
    const wrong = String((Number(mail.code) + 1) % 1000000).padStart(6, '0');
    await page.getByTestId('sign-in-code').fill(wrong);
    await page.getByTestId('sign-in-code-submit').click();
    await expect(page.getByTestId('sign-in-error')).toHaveText(text('en', 'error.code_invalid'));
    expect(path(page)).toBe('/sign-in');

    // (e) Step 2 survives a reload; "Use a different email" clears the email cookie.
    await page.reload();
    await expect(page.getByTestId('sign-in-code')).toBeVisible();
    await page.getByTestId('sign-in-change-email').click();
    await expect(page.getByTestId('sign-in-email')).toBeVisible();
    await expect
      .poll(
        async () =>
          (await context.cookies()).filter((c) => c.name === 'ezd_sign_in_email' && c.value !== '')
            .length,
      )
      .toBe(0);
    await page.reload();
    await expect(page.getByTestId('sign-in-email')).toBeVisible();
    await expect(page.getByTestId('sign-in-code')).toHaveCount(0);

    // (f) A signed-in visitor on /sign-in goes to /.
    await waitUntil(firstAt + EMAIL_GAP_MS);
    await signInWithCode(page, m.email);
    await page.goto('/sign-in');
    expect(path(page)).toBe('/');
  });

  // T40 (AC-1, AC-2, AC-4): Q-0170 (b); R24 #40; Q-0030 (a); L-012. Every POST to the page's own path
  // (the Server Action) answers 500; the route is off during each language click (also a Server Action).
  test('EZD-007f T40 an unexpected action failure shows error.sign_in_failed in both languages', async ({
    browser,
    baseURL,
  }) => {
    const context = await newContext(browser, baseURL);
    const page = await context.newPage();
    let failPath = '';
    const matcher = (u: URL) => u.pathname === failPath;
    const handler = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 500, body: '' });
      } else {
        await route.fallback();
      }
    };
    const failOn = async (p: string) => {
      failPath = p;
      await page.route(matcher, handler);
    };
    const failOff = () => page.unroute(matcher, handler);

    // (a) English sign-in form.
    const email = `nobody-${Math.random().toString(36).slice(2, 12)}@example.test`;
    await page.goto('/sign-in');
    await failOn('/sign-in');
    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-submit').click();
    await expect(page.getByTestId('sign-in-error')).toHaveText(text('en', 'error.sign_in_failed'));
    expect(path(page)).toBe('/sign-in');
    await expect(page.getByTestId('sign-in-email')).toBeVisible();

    // (b) Spanish sign-in form.
    await failOff();
    await page.getByTestId('sign-in-lang-es').click();
    await expect(langBox(page)).toHaveAttribute('lang', 'es');
    await failOn('/sign-in');
    await page.getByTestId('sign-in-email').fill(email);
    await page.getByTestId('sign-in-submit').click();
    await expect(page.getByTestId('sign-in-error')).toHaveText(text('es', 'error.sign_in_failed'));

    // (c) Spanish confirm form.
    await failOff();
    await page.goto('/auth/confirm?token_hash=x&type=email');
    await expect(langBox(page)).toHaveAttribute('lang', 'es');
    await failOn('/auth/confirm');
    await page.getByTestId('confirm-submit').click();
    await expect(page.getByTestId('confirm-error')).toHaveText(text('es', 'error.sign_in_failed'));
    await expect(page.getByTestId('confirm-submit')).toBeVisible();

    // (d) English confirm form.
    await failOff();
    await page.getByTestId('sign-in-lang-en').click();
    await expect(langBox(page)).toHaveAttribute('lang', 'en');
    await failOn('/auth/confirm');
    await page.getByTestId('confirm-submit').click();
    await expect(page.getByTestId('confirm-error')).toHaveText(text('en', 'error.sign_in_failed'));
    await failOff();
    await context.close();

    // (e) The catalogs.
    const enText = T.en['error.sign_in_failed'];
    const esText = T.es['error.sign_in_failed'];
    expect(typeof esText).toBe('string');
    expect((esText as string).trim()).not.toBe('');
    expect(esText).not.toBe(enText);
  });
});
