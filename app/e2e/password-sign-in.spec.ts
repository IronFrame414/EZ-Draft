// EZD-033 T1, T2, T4, T5, T6, T18 (browser part) (vault/plans/EZD-033.md Tests; Steps 3 and 6): password
// sign-in on the real sign-in page. Members come from createPasswordMember / createTestMember with random
// @example.test emails; no seeded row is changed (EZD-016a seed rule). Codes come from the local mail catcher
// (CLAUDE.md rule 6). Text is compared with the en / es catalogs, never copied wording (the builder writes the
// Spanish, Q-0030). Specs import every helper only from the harness test file (EZD-016a).
import { createClient } from '@supabase/supabase-js';
import type { Browser, BrowserContext, Page, Response } from '@playwright/test';
import { en } from '../src/server/messages/catalogs/en';
import { es } from '../src/server/messages/catalogs/es';
import {
  TENANT_1_ID,
  cleanup,
  cleanupTestMembers,
  closeHarness,
  countAuthEmails,
  createPasswordMember,
  createTenant,
  createTestMember,
  emailSubjects,
  expect,
  harnessSql,
  signInWithCode,
  test,
  waitForAuthEmail,
} from '../test-harness/e2e/test';

const T = { en: en as Record<string, unknown>, es: es as Record<string, unknown> };
const text = (lang: 'en' | 'es', key: string): string => T[lang][key] as string;

let tenantId: string;

const path = (page: Page) => new URL(page.url()).pathname;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const sbCookies = async (context: BrowserContext) =>
  (await context.cookies()).filter((c) => c.name.startsWith('sb-') && c.value !== '');

async function newContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
}

const randomLetters = (n: number) =>
  Array.from(
    { length: n },
    () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)],
  ).join('');

async function submitPassword(page: Page, email: string, password: string) {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(password);
  await page.getByTestId('sign-in-password-submit').click();
}

async function authUserRow(email: string) {
  const rows = await harnessSql()`
    select email_confirmed_at, encrypted_password from auth.users where email = ${email}`;
  expect(rows.length).toBe(1);
  return rows[0] as { email_confirmed_at: Date | null; encrypted_password: string | null };
}

const publishableClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

test.describe('EZD-033 password sign-in', () => {
  test.beforeAll(async () => {
    tenantId = await createTenant();
  });

  test.afterAll(async () => {
    await cleanupTestMembers();
    await cleanup();
    await closeHarness();
  });

  // T1 (AC-EZD-033-1): ticket Done when; Q-0090; Q-0091; EZD-007 Steps 3 and 5 (cookies, sign-out).
  test(
    'EZD-033 done when: a member with a password signs in with email and password',
    { tag: ['@smoke', '@desktop', '@phone'] },
    async ({ page, context }) => {
      const m = await createPasswordMember({ tenantId: TENANT_1_ID });
      const after = new Date();
      await submitPassword(page, m.email, m.password);
      await page.waitForURL((u) => u.pathname === '/');
      expect(path(page)).toBe('/');
      await expect(page.getByTestId('sign-out')).toBeVisible();
      const cookies = await sbCookies(context);
      expect(cookies.filter((c) => c.httpOnly).length).toBeGreaterThanOrEqual(1);
      await sleep(3000);
      expect(await countAuthEmails(m.email, { after })).toBe(0);

      await page.getByTestId('sign-out').click();
      await page.waitForURL((u) => u.pathname === '/sign-in');
      expect(path(page)).toBe('/sign-in');
      expect(await sbCookies(context)).toHaveLength(0);
    },
  );

  // T2 (AC-EZD-033-2): ticket Done when; Q-0091 ("Email or password is wrong."); Q-0094 (guard).
  test('EZD-033 done when: wrong password, unknown email and unconfirmed account get the same error', async ({
    browser,
    baseURL,
  }) => {
    const wrongMember = await createPasswordMember({ tenantId });
    const u = await createTestMember({ tenantId, status: 'active' });
    const pu = randomLetters(20);
    const signUp = await publishableClient().auth.signUp({ email: u.email, password: pu });
    expect(signUp.error).toBeNull();

    const cases = [
      { email: wrongMember.email, password: randomLetters(20) },
      { email: `nobody-${randomLetters(12)}@example.test`, password: randomLetters(20) },
      { email: u.email, password: pu },
    ];
    const errors: string[] = [];
    for (const c of cases) {
      const context = await newContext(browser, baseURL);
      const page = await context.newPage();
      await submitPassword(page, c.email, c.password);
      const error = page.getByTestId('sign-in-error');
      await expect(error).toHaveText(text('en', 'error.password_wrong'));
      errors.push((await error.textContent()) ?? '');
      expect(path(page)).toBe('/sign-in');
      expect(await sbCookies(context)).toHaveLength(0);
      await expect(page.getByTestId('sign-in-password')).toHaveValue('');
      await expect(page.getByTestId('sign-in-email')).toHaveValue(c.email);
      await context.close();
    }
    expect(new Set(errors).size).toBe(1);
  });

  // T4 (AC-EZD-033-3): ticket Done when; Q-0094; EZD-007a Step 2.5 and T26.
  test('EZD-033 done when: a password set on an unconfirmed account does not survive confirmation', async ({
    page,
  }) => {
    const c = await createTestMember({ tenantId, status: 'active' });
    const password = randomLetters(20);
    const signUp = await publishableClient().auth.signUp({ email: c.email, password });
    expect(signUp.error).toBeNull();

    await sleep(1500); // Auth refuses a second email to one address within max_frequency (1 s)
    await signInWithCode(page, c.email);
    expect(path(page)).toBe('/');
    await page.getByTestId('sign-out').click();
    await page.waitForURL((u) => u.pathname === '/sign-in');

    await submitPassword(page, c.email, password);
    await expect(page.getByTestId('sign-in-error')).toHaveText(text('en', 'error.password_wrong'));
    expect(path(page)).toBe('/sign-in');

    const row = await authUserRow(c.email);
    expect(row.email_confirmed_at).not.toBeNull();
    expect(row.encrypted_password).toBeNull();
  });

  // T5: Q-0091 (order, wording); 11 Accessibility (44 px); Q-0047 (language switch); Step 6.
  test(
    'EZD-033 T5 page order, sizes, wording and Enter',
    { tag: ['@desktop', '@phone'] },
    async ({ page }) => {
      await page.goto('/sign-in');
      const password = page.locator('input[type=password]');
      await expect(password).toHaveCount(1);
      await expect(password).toHaveAttribute('name', 'password');
      await expect(password).toHaveAttribute('autocomplete', 'current-password');

      const top = async (id: string) => {
        const box = await page.getByTestId(id).boundingBox();
        expect(box, id).not.toBeNull();
        return box!;
      };
      const email = await top('sign-in-email');
      const pw = await top('sign-in-password');
      const pwSubmit = await top('sign-in-password-submit');
      const send = await top('sign-in-submit');
      const forgot = await top('sign-in-forgot');
      expect(email.y).toBeLessThan(pw.y);
      expect(pw.y).toBeLessThan(pwSubmit.y);
      expect(pwSubmit.y).toBeLessThan(send.y);
      expect(forgot.y).toBeGreaterThan(pw.y);
      for (const [id, box] of Object.entries({
        'sign-in-email': email,
        'sign-in-password': pw,
        'sign-in-password-submit': pwSubmit,
        'sign-in-submit': send,
        'sign-in-forgot': forgot,
      })) {
        expect(box.height, id).toBeGreaterThanOrEqual(44);
      }

      const expectTexts = async (lang: 'en' | 'es') => {
        await expect(page.getByTestId('sign-in-password-submit')).toHaveText(
          text(lang, 'common.sign_in.password_submit'),
        );
        await expect(page.getByTestId('sign-in-submit')).toHaveText(
          text(lang, 'common.sign_in.send_instead'),
        );
        await expect(page.getByTestId('sign-in-forgot')).toHaveText(
          text(lang, 'common.sign_in.forgot'),
        );
        await expect(
          page.getByLabel(text(lang, 'common.sign_in.password_label'), { exact: true }),
        ).toHaveAttribute('data-testid', 'sign-in-password');
      };
      await expectTexts('en');
      await page.getByTestId('sign-in-lang-es').click();
      await expect(page.getByTestId('sign-in-lang-es')).toHaveAttribute('aria-pressed', 'true');
      await expectTexts('es');
      await page.getByTestId('sign-in-lang-en').click();
      await expect(page.getByTestId('sign-in-lang-en')).toHaveAttribute('aria-pressed', 'true');
      await expectTexts('en');

      const m = await createPasswordMember({ tenantId });
      const after = new Date();
      await page.getByTestId('sign-in-email').fill(m.email);
      await page.getByTestId('sign-in-password').fill(randomLetters(20));
      await page.getByTestId('sign-in-password').press('Enter');
      await expect(page.getByTestId('sign-in-error')).toHaveText(
        text('en', 'error.password_wrong'),
      );
      await sleep(3000);
      expect(await countAuthEmails(m.email, { after })).toBe(0);
    },
  );

  // T6: Q-0094 ("'Forgot password?' sends the normal sign-in code email"); Q-0091; EZD-007 Steps 1, 5; Q-0035.
  test('EZD-033 T6 forgot and link-instead send the normal sign-in email', async ({
    page,
    browser,
    baseURL,
  }) => {
    const SIGN_IN_SUBJECT = 'Your EZ Draft sign-in link and code / ';
    const f = await createPasswordMember({ tenantId });
    await page.goto('/sign-in');
    await page.getByTestId('sign-in-email').fill(f.email);
    const after = new Date();
    await page.getByTestId('sign-in-forgot').click();
    await expect(page.getByTestId('sign-in-code')).toBeVisible();
    await expect(page.getByTestId('sign-in-check-spam')).toBeVisible();
    const mail = await waitForAuthEmail(f.email, { after });
    await sleep(3000);
    expect(await countAuthEmails(f.email, { after })).toBe(1);
    expect(mail.subject.startsWith(SIGN_IN_SUBJECT)).toBe(true);
    expect(
      (await emailSubjects(f.email)).filter((s) =>
        s.startsWith('EZ Draft password reset requested'),
      ),
    ).toEqual([]);
    await page.getByTestId('sign-in-code').fill(mail.code);
    await page.getByTestId('sign-in-code-submit').click();
    await page.waitForURL((u) => u.pathname === '/');
    expect(path(page)).toBe('/');

    const g = await createPasswordMember({ tenantId });
    const context = await newContext(browser, baseURL);
    const second = await context.newPage();
    await second.goto('/sign-in');
    await second.getByTestId('sign-in-email').fill(g.email);
    const afterG = new Date();
    await second.getByTestId('sign-in-submit').click();
    await expect(second.getByTestId('sign-in-code')).toBeVisible();
    const mailG = await waitForAuthEmail(g.email, { after: afterG });
    await sleep(3000);
    expect(await countAuthEmails(g.email, { after: afterG })).toBe(1);
    expect(mailG.subject.startsWith(SIGN_IN_SUBJECT)).toBe(true);
    await context.close();
  });

  // T18 (browser part): EZD-000 Errors and logging; Q-0087 (the gate secret is server-only).
  test('EZD-033 T18 the password is never echoed to the browser', async ({ page }) => {
    const m = await createPasswordMember({ tenantId });
    const wrong = randomLetters(20);
    const gateSecret = process.env.SUPABASE_API_GATE_SECRET as string;
    expect(gateSecret.length).toBeGreaterThanOrEqual(43);

    const pending: Promise<string>[] = [];
    let wrongAttempt: Promise<string>[] = [];
    page.on('response', (r: Response) => {
      pending.push(r.text().catch(() => ''));
    });

    await submitPassword(page, m.email, wrong);
    await expect(page.getByTestId('sign-in-error')).toHaveText(text('en', 'error.password_wrong'));
    wrongAttempt = [...pending];

    await page.getByTestId('sign-in-password').fill(m.password);
    await page.getByTestId('sign-in-password-submit').click();
    await page.waitForURL((u) => u.pathname === '/');

    const all = await Promise.all(pending);
    const attempt = await Promise.all(wrongAttempt);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((b) => b.includes(m.password))).toHaveLength(0);
    expect(all.filter((b) => b.includes(wrong))).toHaveLength(0);
    expect(attempt.filter((b) => b.includes(gateSecret))).toHaveLength(0);
  });
});
