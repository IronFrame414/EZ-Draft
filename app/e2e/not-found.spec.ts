// EZD-1990 (Q-0808; AC-EZD-1990-1, -2): a wrong link inside the signed-in app shows the normal app header, the
// message "Page not found." in the middle of the page and a "Back to Projects" button that opens Projects.
// Signed out the page stays as it was (EZD-136 B5, B6 in disclaimer.spec.ts check it in full). Expected text:
// "Page not found." Q-0273 (b); "Back to Projects" Q-0808; header wordmark "ez" + "draft" (EZD-117b).
import { closeHarness, expect, signInAsOwner, test } from '../test-harness/e2e/test';

test.describe('EZD-1990 not-found page', () => {
  test.afterAll(async () => {
    await closeHarness();
  });

  test('EZD-1990 signed in: header, centred message, Back to Projects opens Projects', async ({
    page,
  }) => {
    await signInAsOwner(page);
    const r = await page.goto('/no-such-page');
    expect(r?.status()).toBe(404);

    const header = page.getByTestId('projects-header');
    await expect(header).toBeVisible();
    await expect(page.getByTestId('projects-wordmark')).toHaveText('ezdraft');
    await expect(page.getByTestId('projects-search')).toHaveCount(0);

    const message = page.getByTestId('not-found');
    await expect(message).toHaveText('Page not found.');
    const view = page.viewportSize();
    const box = await message.boundingBox();
    const headerBox = await header.boundingBox();
    if (!view || !box || !headerBox) throw new Error('no layout');
    // Centred across the page, and below the header in the middle of the page rather than at its top.
    expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThanOrEqual(2);
    expect(box.y).toBeGreaterThan(headerBox.y + headerBox.height);
    expect(box.y + box.height / 2).toBeGreaterThan(view.height / 3);
    expect(box.y + box.height / 2).toBeLessThan((view.height * 2) / 3);

    const back = page.getByRole('link', { name: 'Back to Projects' });
    await expect(back).toBeVisible();
    await expect(page.getByTestId('disclaimer')).toBeInViewport();
    await back.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('projects-title')).toHaveText('Projects');
    await expect(page.getByTestId('projects-grid')).toBeVisible();
  });

  test('EZD-1990 signed out: no header and no button', async ({ page }) => {
    const r = await page.goto('/dev/no-such-page');
    expect(r?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toHaveText('Page not found.');
    await expect(page.getByTestId('projects-header')).toHaveCount(0);
    await expect(page.getByTestId('not-found-back')).toHaveCount(0);
  });
});
