// EZD-011c H12-H14 (vault/plans/EZD-011c.md section 4). Colors are compared against a probe element with the
// same var(--ez-*) declarations, so the result does not depend on how Chromium serializes oklch().
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../test-harness/e2e/test';

const tab = (page: Page, name: string): Locator =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });

async function probe(page: Page, css: string): Promise<{ color: string; boxShadow: string }> {
  return page.evaluate((style) => {
    const el = document.createElement('div');
    el.setAttribute('style', style);
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = { color: cs.color, boxShadow: cs.boxShadow };
    el.remove();
    return out;
  }, css);
}

const styleOf = (l: Locator) =>
  l.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, boxShadow: cs.boxShadow };
  });

test.describe('EZD-011c shell header', () => {
  test('EZD-011c done when: header is 60 px; active tab shows cobalt text and 2 px bottom border', async ({
    page,
  }) => {
    await page.goto('/dev/header');
    const header = page.locator('header');
    const box = await header.boundingBox();
    expect(box?.height).toBe(60);

    const a = await probe(
      page,
      'color: var(--ez-cobalt-text); box-shadow: inset 0 -2px 0 var(--ez-cobalt)',
    );
    const b = await probe(page, 'color: var(--ez-slate-500)');

    const plan = tab(page, 'Plan');
    await expect(plan).toHaveAttribute('aria-current', 'page');
    const ps = await styleOf(plan);
    expect(ps.color).toBe(a.color);
    expect(ps.boxShadow).toBe(a.boxShadow);
    expect(ps.boxShadow).toContain('inset');
    expect(ps.boxShadow).toContain('-2px');

    for (const name of ['3D', 'Sheets', 'Render']) {
      const s = await styleOf(tab(page, name));
      expect(s.boxShadow).toBe('none');
      expect(s.color).toBe(b.color);
    }

    const pb = await plan.boundingBox();
    const hb = await header.boundingBox();
    expect(pb!.y + pb!.height).toBe(hb!.y + hb!.height - 1);
  });

  test('EZD-011c H13 frame position', async ({ page }) => {
    await page.goto('/dev/header');
    const box = await page.locator('header').boundingBox();
    expect(box?.x).toBe(16);
    expect(box?.y).toBe(16);
    expect(box?.width).toBe(1568);
    expect(await page.evaluate(() => getComputedStyle(document.body).margin)).toBe('0px');
  });

  test('EZD-011c H14 clicks', async ({ page }) => {
    await page.goto('/dev/header');
    const a = await probe(
      page,
      'color: var(--ez-cobalt-text); box-shadow: inset 0 -2px 0 var(--ez-cobalt)',
    );
    const three = tab(page, '3D');
    const plan = tab(page, 'Plan');
    const frame = page.getByTestId('header-demo');

    for (let i = 0; i < 2; i++) {
      await three.click();
      await expect(three).toHaveAttribute('aria-current', 'page');
      const s = await styleOf(three);
      expect(s.color).toBe(a.color);
      expect(s.boxShadow).toBe(a.boxShadow);
      await expect(plan).not.toHaveAttribute('aria-current', 'page');
      expect((await styleOf(plan)).boxShadow).toBe('none');
      await expect(page.locator('[aria-current="page"]')).toHaveCount(1);
    }

    await expect(frame).toHaveAttribute('data-project-menu-count', '0');
    await page.getByRole('button', { name: 'Sample project' }).click();
    await expect(frame).toHaveAttribute('data-project-menu-count', '1');
  });
});
