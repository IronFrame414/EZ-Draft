// EZD-209 B1-B5 (vault/plans/EZD-209.md section 4). No sign-in. Colours are compared against a probe element
// with the same var(--ez-*) declarations. No import.meta or __dirname (lesson L-017).
import type { Locator, Page } from '@playwright/test';
import { expect, expectTouchTargets, test } from '../test-harness/e2e/test';
import { en } from '../src/server/messages/catalogs/en';

const EN = en as unknown as Record<string, string>;
type Box = { x: number; y: number; width: number; height: number };

const id = (page: Page, testId: string): Locator => page.locator(`[data-testid="${testId}"]`);
const region = (page: Page): Locator => page.locator('[data-shell-region="canvas"]');
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error('no bounding box');
  return b;
}

async function probe(page: Page, css: string): Promise<Record<string, string>> {
  return page.evaluate((style) => {
    const el = document.createElement('div');
    el.setAttribute('style', style);
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const out = {
      backgroundColor: cs.backgroundColor,
      color: cs.color,
      borderTopColor: cs.borderTopColor,
    };
    el.remove();
    return out;
  }, css);
}

test.describe('EZD-209 typed dimension bar', () => {
  test('EZD-209 B1 bar placement and look', async ({ page }) => {
    await page.goto('/dev/typed-bar');
    const r = await box(region(page));
    const bar = id(page, 'typed-bar');
    const b = await box(bar);
    expect(Math.abs(b.y + b.height - (r.y + r.height - 20))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.x + b.width / 2 - (r.x + r.width / 2))).toBeLessThanOrEqual(0.5);
    const chip = id(page, 'typed-bar-field');
    await expect(chip).toHaveCSS('background-color', 'rgb(20, 23, 28)');
    await expect(chip).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(chip).toHaveCSS('border-top-left-radius', '8px');
    await expect(bar).toHaveCSS('border-top-left-radius', '12px');
    await expect(bar).toHaveCSS('padding', '6px 14px 6px 6px');
    await expect(bar).toHaveCSS('box-shadow', 'rgba(20, 30, 50, 0.08) 0px 6px 20px 0px');
    await expect(id(page, 'typed-bar-tab')).toHaveCSS('border-top-left-radius', '5px');
    await expect(id(page, 'typed-bar-label')).toHaveText('Length');
    await expect(id(page, 'typed-bar-value')).toHaveCount(0);

    await page.goto('/dev/typed-bar?edit=0');
    await expect(id(page, 'typed-bar')).toHaveCount(0);
    await page.keyboard.press('1');
    await expect(id(page, 'typed-box')).toHaveCount(0);
  });

  test('EZD-209 B2 done when in the browser', async ({ page }) => {
    await page.goto('/dev/typed-bar');
    const r = await box(region(page));
    await page.mouse.move(r.x + 400, r.y + 300);
    await page.keyboard.press('1');
    const input = id(page, 'typed-box-input');
    await expect(input).toBeFocused();
    const b = await box(id(page, 'typed-box'));
    expect(Math.abs(b.x - (r.x + 412))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b.y - (r.y + 312))).toBeLessThanOrEqual(0.5);
    await page.keyboard.type('2\'6"');
    await expect(input).toHaveValue('12\'6"');
    await page.keyboard.press('Tab');
    await expect(id(page, 'typed-box-label')).toHaveText('Angle');
    await expect(id(page, 'typed-bar-label')).toHaveText('Angle');
    await page.keyboard.type('90');
    await page.keyboard.press('Enter');
    await expect(id(page, 'typed-box')).toHaveCount(0);
    const items = id(page, 'stub-commits').locator('li');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveText('{"length":150,"angle":90}');
    await expect(id(page, 'typed-bar-label')).toHaveText('Length');
    await expect(id(page, 'typed-bar-value')).toHaveText('12\' 6"');
    await expect(id(page, 'stub-key-count')).toHaveText('0');
    await page.keyboard.press('w');
    await expect(id(page, 'stub-key-count')).toHaveText('1');
  });

  test('EZD-209 B3 refusal and Esc', async ({ page }) => {
    await page.goto('/dev/typed-bar');
    const r = await box(region(page));
    await page.mouse.move(r.x + 400, r.y + 300);
    await page.keyboard.type('12 6');
    await page.keyboard.press('Enter');
    const red = await probe(page, 'color: var(--ez-red)');
    const redBorder = await probe(page, 'border-top-color: var(--ez-red)');
    await expect(id(page, 'typed-bar-error')).toHaveText(EN['office.length.refused']!);
    await expect(id(page, 'typed-bar-error')).toHaveCSS('color', red.color!);
    await expect(id(page, 'typed-box')).toBeVisible();
    const input = id(page, 'typed-box-input');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveCSS('border-top-color', redBorder.borderTopColor!);
    await expect(id(page, 'stub-commits').locator('li')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(id(page, 'typed-box')).toHaveCount(0);
    await expect(id(page, 'typed-bar-error')).toHaveCount(0);
    await expect(id(page, 'typed-bar-hint')).toBeVisible();
  });

  test('EZD-209 B4 edge clamp, blur and tool reset', async ({ page }) => {
    await page.goto('/dev/typed-bar');
    const r = await box(region(page));
    await page.mouse.move(r.x + r.width - 4, r.y + r.height - 4);
    await page.keyboard.press('1');
    const b = await box(id(page, 'typed-box'));
    expect(b.x + b.width).toBeLessThanOrEqual(r.x + r.width - 8 + 0.5);
    expect(b.y + b.height).toBeLessThanOrEqual(r.y + r.height - 8 + 0.5);
    expect(b.x).toBeGreaterThanOrEqual(r.x + 8 - 0.5);
    await id(page, 'typed-bar-stage').click({ position: { x: 200, y: 200 } });
    await page.keyboard.press('2');
    await expect(id(page, 'typed-box-input')).toHaveValue('12');
    await page.keyboard.press('Enter');
    const items = id(page, 'stub-commits').locator('li');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toHaveText('{"length":12,"angle":null}');
    await page.keyboard.press('3');
    await expect(id(page, 'typed-box')).toHaveCount(1);
    await id(page, 'stub-tool-toggle').click();
    await expect(id(page, 'typed-bar')).toHaveCount(0);
    await expect(id(page, 'typed-box')).toHaveCount(0);
    await id(page, 'stub-tool-toggle').click();
    await expect(id(page, 'typed-bar')).toHaveCount(1);
    await expect(id(page, 'typed-box')).toHaveCount(0);
  });

  test('EZD-209 B5 tap on iPad', { tag: ['@ipad'] }, async ({ page }) => {
    await page.goto('/dev/typed-bar');
    const bar = id(page, 'typed-bar');
    await id(page, 'typed-bar-field').tap();
    await expect(id(page, 'typed-box')).toBeVisible();
    await expect(id(page, 'typed-box-input')).toBeFocused();
    const r = await box(region(page));
    const barBox = await box(bar);
    const b = await box(id(page, 'typed-box'));
    expect(b.y + b.height).toBeLessThanOrEqual(barBox.y - 8 + 0.5);
    expect(Math.abs(b.x + b.width / 2 - (r.x + r.width / 2))).toBeLessThanOrEqual(1);
    expect(await expectTouchTargets(page, bar)).toBeGreaterThanOrEqual(1);
  });
});
