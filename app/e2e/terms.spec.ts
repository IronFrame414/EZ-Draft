// EZD-1707 browser tests (vault/plans/EZD-1707.md sections 3, 4, 6; AC-EZD-1707-1, AC-EZD-1707-2).
// Desktop project only (no device tag). Expected text is read from the en / es catalogs, which section 6
// (W1-W5) pins in terms-messages.test.ts (T1); the helper is the one in sign-in.spec.ts.
import { en } from '../src/server/messages/catalogs/en';
import { es } from '../src/server/messages/catalogs/es';
import { expect, signInAsOwner, test } from '../test-harness/e2e/test';

const T = {
  en: en as Record<string, unknown>,
  es: es as Record<string, unknown>,
};
const text = (lang: 'en' | 'es', key: string): string => T[lang][key] as string;

test.describe('EZD-1707 terms of service', () => {
  // T4 (AC-1): opens with no session, with the two statements, the placeholder and the back link.
  test('EZD-1707 done when: /terms opens without signing in with the non-certification statement', async ({
    page,
    request,
  }) => {
    const r = await request.get('/terms', { maxRedirects: 0 });
    expect(r.status()).toBe(200);
    await page.goto('/terms');
    expect(new URL(page.url()).pathname).toBe('/terms');
    await expect(page.locator('h1')).toHaveText(text('en', 'common.terms.title'));
    await expect(page.getByTestId('terms-no-certification')).toHaveText(
      text('en', 'common.terms.no_certification'),
    );
    await expect(page.getByTestId('terms-responsibility')).toHaveText(
      text('en', 'common.terms.responsibility'),
    );
    await expect(page.getByTestId('terms-placeholder')).toHaveText(
      text('en', 'common.terms.placeholder'),
    );
    await expect(page.getByTestId('terms-back')).toHaveAttribute('href', '/sign-in');
    await expect(page.getByTestId('terms-back')).toHaveText(text('en', 'common.terms.back'));
    await expect(page.getByTestId('disclaimer')).toHaveCount(1);
  });

  // T5 (AC-2): the sign-in page links to /terms; there is no agree step (no checkbox on the card).
  test('EZD-1707 done when: the sign-in page links to /terms with no agree step', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    const link = page.getByTestId('sign-in-terms-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/terms');
    await expect(link).toHaveText(text('en', 'common.terms.title'));
    await expect(page.getByTestId('sign-in-card').locator('input[type="checkbox"]')).toHaveCount(0);
    await link.click();
    await expect(page.getByTestId('terms-card')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/terms');
  });

  // T6 (AC-1, AC-2): the page and the sign-in link follow the device's Spanish choice.
  test('EZD-1707 T6 the terms page and the sign-in link show Spanish when the device chose es', async ({
    context,
    page,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'ezd_sign_in_lang', value: 'es', url: baseURL as string }]);
    await page.goto('/terms');
    await expect(page.locator('h1')).toHaveText(text('es', 'common.terms.title'));
    await expect(page.getByTestId('terms-no-certification')).toHaveText(
      text('es', 'common.terms.no_certification'),
    );
    await expect(page.getByTestId('terms-responsibility')).toHaveText(
      text('es', 'common.terms.responsibility'),
    );
    await expect(page.getByTestId('terms-placeholder')).toHaveText(
      text('es', 'common.terms.placeholder'),
    );
    await expect(page.getByTestId('terms-back')).toHaveText(text('es', 'common.terms.back'));
    await expect(page.getByTestId('sign-in-lang-es')).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/sign-in');
    await expect(page.getByTestId('sign-in-terms-link')).toHaveText(
      text('es', 'common.terms.title'),
    );
  });

  // T7: a signed-in person may open /terms too (decided: public).
  test('EZD-1707 T7 a signed-in person opens /terms', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto('/terms');
    expect(new URL(page.url()).pathname).toBe('/terms');
    await expect(page.getByTestId('terms-card')).toBeVisible();
  });
});
