// EZD-136 B1-B6 (vault/plans/EZD-136.md sections 3, 4; AC-EZD-136-1). Untagged tests run in desktop
// (1600 x 1000); @phone and @ipad route to those projects (EZD-016d projectGrep). Rows: DISCLAIMER_PAGES
// (app/test-harness/e2e/disclaimer-pages.ts). Expected values: D-EN Q-0208; D-ES section 6 W1; N-EN Q-0273 (b);
// N-ES section 6 W3; language rules Q-0229, R26 R17, Q-0305 (c), ARCH sign-in cookies; status bar 30 px (04
// Frame); Settings location text en.ts line 92 and settings-shell.spec.ts line 161; phone 390 x 844 (ARCH
// Browser tests). Fresh members come from EZD-006's fixtures and are removed in afterAll (messages.spec.ts).
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { DISCLAIMER_PAGES } from '../test-harness/e2e/disclaimer-pages';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  signInAsOwner,
  test,
} from '../test-harness/e2e/test';

const D_EN =
  "For design and planning only. All calculations and codes must be verified by the user and a licensed professional in the project's jurisdiction.";
const D_ES =
  'Solo para diseño y planificación. Todos los cálculos y códigos deben ser verificados por el usuario y por un profesional con licencia en la jurisdicción del proyecto.';
const N_EN = 'Page not found.';
const N_ES = 'Página no encontrada.';
const DOT = '·';
const BARS = 'footer[data-shell-region="status-bar"], footer[data-settings-region="status-bar"]';

async function setLanguage(appUserId: string, language: 'en' | 'es'): Promise<void> {
  const { error } = await adminDb().from('app_user').update({ language }).eq('id', appUserId);
  if (error) throw new Error(`set language failed: ${error.code}`);
}

async function newContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  return browser.newContext({ baseURL, viewport: { width: 1600, height: 1000 } });
}

const langCookie = (baseURL: string | undefined) => [
  { name: 'ezd_sign_in_lang', value: 'es', url: baseURL as string },
];

// Section 4 followingText: elements after the disclaimer in document order, not inside it, not
// script/style/template/noscript, with at least one client rect and a direct non-blank text child.
// -1 when the page has no disclaimer, so a missing line never reads as 0.
function followingText(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.querySelector('[data-testid="disclaimer"]');
    if (!d) return -1;
    const skip = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
    let n = 0;
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const pos = d.compareDocumentPosition(el);
      if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) continue;
      if (skip.has(el.tagName)) continue;
      if (el.getClientRects().length === 0) continue;
      const text = Array.from(el.childNodes).some(
        (c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim() !== '',
      );
      if (text) n++;
    }
    return n;
  });
}

const fits = (page: Page, selector: string) =>
  page.locator(selector).evaluate((e) => ({ scroll: e.scrollWidth, client: e.clientWidth }));

const docWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

// The not-found page's main and the elements inside it other than the provider div (section 3 markup:
// main > div[lang] > p[not-found], p[disclaimer]).
const notFoundMain = (page: Page) => page.locator('main:has([data-testid="not-found"])');
const mainInner = (page: Page) =>
  notFoundMain(page).evaluate((m) => {
    const provider = m.querySelector(':scope > div[lang]');
    return Array.from(m.querySelectorAll('*'))
      .filter((e) => e !== provider)
      .map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('data-testid') ?? ''}`);
  });

async function expectNotFound(
  page: Page,
  status: number | undefined,
  language: 'en' | 'es',
  label: string,
  full: boolean,
): Promise<void> {
  expect(status, label).toBe(404);
  const nf = page.getByTestId('not-found');
  const d = page.getByTestId('disclaimer');
  await expect(nf, label).toHaveText(language === 'es' ? N_ES : N_EN);
  await expect(d, label).toHaveText(language === 'es' ? D_ES : D_EN);
  await expect(notFoundMain(page).locator(':scope > div[lang]'), label).toHaveAttribute(
    'lang',
    language,
  );
  // Cases (i) and (ii) also check the count, placement, viewport and what main holds (section 4 B5).
  if (!full) return;
  await expect(nf, label).toHaveCount(1);
  await expect(d, label).toHaveCount(1);
  await expect(d, label).toHaveAttribute('data-placement', 'page');
  await expect(d, label).toBeInViewport();
  expect(await followingText(page), label).toBe(0);
  const withText = await notFoundMain(page).evaluate(
    (m) =>
      Array.from(m.querySelectorAll('*')).filter((e) =>
        Array.from(e.childNodes).some(
          (c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? '').trim() !== '',
        ),
      ).length,
  );
  expect(withText, label).toBe(2);
}

test.describe('EZD-136 disclaimer', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-136 done when: every page shows the disclaimer', async ({ browser, baseURL }) => {
    for (const row of DISCLAIMER_PAGES) {
      await test.step(row.path, async () => {
        const context = await newContext(browser, baseURL);
        try {
          const page = await context.newPage();
          if (row.signedIn) await signInAsOwner(page);
          await page.goto(row.path);
          const d = page.getByTestId('disclaimer');
          await expect(d, row.path).toHaveCount(1);
          await expect(d, row.path).toHaveText(D_EN);
          await expect(d, row.path).toHaveAttribute('data-placement', row.placement);
          await expect(d, row.path).toBeInViewport();
          expect(await followingText(page), row.path).toBe(0);
          if (row.placement === 'bar') {
            await expect(page.locator(BARS).getByTestId('disclaimer'), row.path).toHaveCount(1);
            const w = await fits(page, '[data-testid="disclaimer"]');
            expect(w.scroll, row.path).toBeLessThanOrEqual(w.client);
          }
        } finally {
          await context.close();
        }
      });
    }
  });

  test('EZD-136 B2 language: Spanish on the Spanish phone notice and sign-in, English on the client link @phone', async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto('/dev/device?lang=es');
    await expect(page.getByTestId('disclaimer')).toHaveText(D_ES);
    await context.addCookies(langCookie(baseURL));
    await page.goto('/sign-in');
    await expect(page.getByTestId('disclaimer')).toHaveText(D_ES);
    await page.goto('/dev/entry/client');
    await expect(page.getByTestId('disclaimer')).toHaveText(D_EN);
  });

  test(
    'EZD-136 B3 narrow bars: the line gives way and the readouts keep their room',
    { tag: ['@desktop', '@ipad'] },
    async ({ page }, testInfo) => {
      const editorBar = async (path: string) => {
        await page.goto(path);
        const d = page.getByTestId('disclaimer');
        await expect(d, path).toHaveCount(1);
        const dw = await fits(page, '[data-testid="disclaimer"]');
        expect(dw.scroll, path).toBeLessThanOrEqual(dw.client);
        const bar = page.locator('footer[data-shell-region="status-bar"]');
        expect((await bar.boundingBox())?.height, path).toBe(30);
        const bw = await fits(page, 'footer[data-shell-region="status-bar"]');
        expect(bw.scroll, path).toBeLessThanOrEqual(bw.client);
      };
      if (testInfo.project.name === 'desktop') {
        await page.setViewportSize({ width: 1024, height: 768 });
        await editorBar('/dev/entry/editor');
        return;
      }
      expect(testInfo.project.name).toBe('ipad-landscape');
      await editorBar('/dev/shell');
      await signInAsOwner(page);
      await page.goto('/settings/title-block');
      const sw = await fits(page, 'footer[data-settings-region="status-bar"]');
      expect(sw.scroll).toBeLessThanOrEqual(sw.client);
      await expect(page.getByTestId('disclaimer')).toHaveAttribute('title', D_EN);
      await expect(page.locator('span[data-settings-status="location"]')).toHaveText(
        `Settings ${DOT} Title block`,
      );
    },
  );

  test('EZD-136 B4 phone footer: the line is the last child of the phone main @phone', async ({
    page,
  }) => {
    await page.goto('/dev/entry/field');
    const d = page.getByTestId('disclaimer');
    await expect(d).toBeVisible();
    const last = await page
      .locator('[data-phone-region="main"]')
      .evaluate((m) => m.lastElementChild?.getAttribute('data-testid') ?? null);
    expect(last).toBe('disclaimer');
    expect(await docWidth(page)).toBe(390);
  });

  test('EZD-136 B5 not-found page: 404, the text and the line, in the record language, else the cookie', async ({
    page,
    browser,
    baseURL,
    signInAs,
  }) => {
    await test.step('(iv) a Spanish member, no cookie', async () => {
      const member = await createMember({ tenantId: await createTenant(), scope: 'all' });
      await setLanguage(member.appUserId, 'es');
      await signInAs(member.email);
      const r = await page.goto('/no-such-page');
      await expectNotFound(page, r?.status(), 'es', '(iv)', false);
    });

    await test.step('(i) the owner, signed in', async () => {
      const context = await newContext(browser, baseURL);
      try {
        const p = await context.newPage();
        await signInAsOwner(p);
        const r = await p.goto('/no-such-page');
        await expectNotFound(p, r?.status(), 'en', '(i)', true);
      } finally {
        await context.close();
      }
    });

    await test.step('(ii) signed out under /dev', async () => {
      const context = await newContext(browser, baseURL);
      try {
        const p = await context.newPage();
        const r = await p.goto('/dev/no-such-page');
        await expectNotFound(p, r?.status(), 'en', '(ii)', true);
      } finally {
        await context.close();
      }
    });

    await test.step('(iii) signed out with the es cookie', async () => {
      const context = await newContext(browser, baseURL);
      try {
        await context.addCookies(langCookie(baseURL));
        const p = await context.newPage();
        const r = await p.goto('/dev/no-such-page');
        await expectNotFound(p, r?.status(), 'es', '(iii)', false);
      } finally {
        await context.close();
      }
    });

    await test.step('(v) the owner with the es cookie: the record wins', async () => {
      const context = await newContext(browser, baseURL);
      try {
        await context.addCookies(langCookie(baseURL));
        const p = await context.newPage();
        await signInAsOwner(p);
        const r = await p.goto('/no-such-page');
        await expectNotFound(p, r?.status(), 'en', '(v)', false);
      } finally {
        await context.close();
      }
    });
  });

  test('EZD-136 B6 not-found on a phone: 404, both lines visible, no sideways scroll, nothing else in main @phone', async ({
    page,
  }) => {
    const r = await page.goto('/dev/no-such-page');
    expect(r?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toBeVisible();
    await expect(page.getByTestId('disclaimer')).toBeVisible();
    expect(await docWidth(page)).toBe(390);
    expect((await mainInner(page)).sort()).toEqual(['p:disclaimer', 'p:not-found']);
  });
});
