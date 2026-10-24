// EZD-034 B1-B4 (vault/plans/EZD-034.md Tests; Steps 4-8; R-013 (5), (6); Q-0047 (a); Q-0243 (c)): the security
// check on the sign-in form, using the same-origin stub script of /dev/captcha (never Cloudflare). Text is read
// from the en catalog. Every case records page requests and asserts none goes to challenges.cloudflare.com.
// Specs import every helper only from the harness test file (EZD-016a).
import type { Browser, BrowserContext, Page, Request } from '@playwright/test';
import { en } from '../src/server/messages/catalogs/en';
import { TURNSTILE_TEST_SITE_KEY } from '../src/server/auth/captcha-config';
import {
  cleanup,
  cleanupTestMembers,
  closeHarness,
  createPasswordMember,
  createTenant,
  expect,
  test,
} from '../test-harness/e2e/test';

const T = en as Record<string, unknown>;
const BUTTONS = ['sign-in-password-submit', 'sign-in-submit', 'sign-in-forgot'] as const;

type Stub = {
  renders: { sitekey: string; language: string }[];
  resets: number;
  removes: number;
  issue(): string;
};
const stub = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { __captchaStub: Stub }).__captchaStub;
    return { renders: s.renders, resets: s.resets, removes: s.removes };
  });
const issue = (page: Page) =>
  page.evaluate(() => (window as unknown as { __captchaStub: Stub }).__captchaStub.issue());

function watch(page: Page) {
  const posts: Request[] = [];
  const hosts: string[] = [];
  page.on('request', (r) => {
    hosts.push(new URL(r.url()).host);
    if (r.method() === 'POST' && r.postData() !== null) posts.push(r);
  });
  return { posts, hosts };
}
const noCloudflare = (hosts: string[]) =>
  expect(hosts.filter((h) => h === 'challenges.cloudflare.com')).toEqual([]);

async function newContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
}

let tenantId: string;

test.describe('EZD-034 captcha on sign-in', () => {
  test.beforeAll(async () => {
    tenantId = await createTenant();
  });

  test.afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  test('EZD-034 B1 the widget renders with the test key and language, and the buttons wait for a token', async ({
    page,
    browser,
    baseURL,
  }) => {
    const w = watch(page);
    await page.goto('/dev/captcha');
    await expect(page.locator('[data-testid=captcha-stub-widget]')).toBeVisible();
    expect((await stub(page)).renders[0]).toEqual({
      sitekey: TURNSTILE_TEST_SITE_KEY,
      language: 'en',
    });
    for (const id of BUTTONS) await expect(page.getByTestId(id)).toBeDisabled();
    expect(await issue(page)).not.toBe('');
    for (const id of BUTTONS) await expect(page.getByTestId(id)).toBeEnabled();
    noCloudflare(w.hosts);

    const context = await newContext(browser, baseURL);
    try {
      await context.addCookies([{ name: 'ezd_sign_in_lang', value: 'es', url: baseURL as string }]);
      const es = await context.newPage();
      const w2 = watch(es);
      await es.goto('/dev/captcha');
      await expect(es.locator('[data-testid=captcha-stub-widget]')).toBeVisible();
      expect((await stub(es)).renders[0]).toEqual({
        sitekey: TURNSTILE_TEST_SITE_KEY,
        language: 'es',
      });
      noCloudflare(w2.hosts);
    } finally {
      await context.close();
    }
  });

  test('EZD-034 B2 the token goes with the password sign-in and is renewed after a wrong password', async ({
    page,
    context,
  }) => {
    const m = await createPasswordMember({ tenantId });
    const w = watch(page);
    await page.goto('/dev/captcha');
    await expect(page.locator('[data-testid=captcha-stub-widget]')).toBeVisible();

    await page.getByTestId('sign-in-email').fill(m.email);
    await page.getByTestId('sign-in-password').fill('not-the-password-1');
    expect(await issue(page)).toBe('stub-token-1');
    await page.getByTestId('sign-in-password-submit').click();
    await expect(page.getByTestId('sign-in-error')).toHaveText(T['error.password_wrong'] as string);
    await expect.poll(async () => (await stub(page)).resets).toBe(1);
    for (const id of BUTTONS) await expect(page.getByTestId(id)).toBeDisabled();
    const first = w.posts.find((r) => (r.postData() ?? '').includes('captcha_token'));
    expect(first).toBeDefined();
    expect(first!.postData()).toContain('stub-token-1');

    await page.getByTestId('sign-in-email').fill(m.email);
    await page.getByTestId('sign-in-password').fill(m.password);
    expect(await issue(page)).toBe('stub-token-2');
    await page.getByTestId('sign-in-password-submit').click();
    await page.waitForURL((u) => u.pathname === '/');
    expect(w.posts.some((r) => (r.postData() ?? '').includes('stub-token-2'))).toBe(true);
    expect(
      (await context.cookies()).filter((c) => c.name.startsWith('sb-') && c.value !== '').length,
    ).toBeGreaterThanOrEqual(1);
    noCloudflare(w.hosts);
  });

  test('EZD-034 B3 when the script fails to load the page says so and the buttons stay disabled', async ({
    page,
  }) => {
    const w = watch(page);
    await page.route('**/dev/captcha/stub', (r) => r.abort());
    await page.goto('/dev/captcha');
    await expect(page.getByTestId('captcha-unavailable')).toHaveText(
      T['error.captcha_unavailable'] as string,
    );
    for (const id of BUTTONS) await expect(page.getByTestId(id)).toBeDisabled();
    noCloudflare(w.hosts);
  });

  test('EZD-034 B4 with no site key the sign-in page has no widget and sends no token', async ({
    page,
  }) => {
    const w = watch(page);
    await page.goto('/sign-in');
    await expect(page.getByTestId('sign-in-email')).toBeVisible();
    await expect(page.locator('[data-testid=captcha]')).toHaveCount(0);
    for (const id of BUTTONS) await expect(page.getByTestId(id)).toBeEnabled();
    await page
      .getByTestId('sign-in-email')
      .fill(`nobody-${Math.random().toString(16).slice(2, 12)}@example.test`);
    await page.getByTestId('sign-in-submit').click();
    await expect(page.getByTestId('sign-in-check-spam')).toBeVisible();
    expect(w.posts.length).toBeGreaterThanOrEqual(1);
    expect(w.posts.filter((r) => (r.postData() ?? '').includes('captcha_token'))).toEqual([]);
    noCloudflare(w.hosts);
  });
});
