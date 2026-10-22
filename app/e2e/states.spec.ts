// EZD-015c B1-B7 (vault/plans/EZD-015c.md section 4). No import.meta or __dirname (L-017).
import type { Locator, Page } from '@playwright/test';
import { expect, expectTouchTargets, test } from '../test-harness/e2e/test';
import { en } from '../src/server/messages/catalogs/en';
import { es } from '../src/server/messages/catalogs/es';

const T = en as unknown as Record<string, string>;
const TES = es as unknown as Record<string, string>;

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

const coarse = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.matchMedia('(any-pointer: coarse)').matches);

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForSelector('[data-testid="states-demo"][data-ready="true"]');
}

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const section = (page: Page): Locator => id(page, 'async-section');

test.describe('EZD-015c states test page', () => {
  test('EZD-015c done when: On a test page: the skeleton shows while a promise is pending', async ({
    page,
  }) => {
    await open(page, '/dev/states');
    const skel = page.locator('[data-testid=async-section] [data-skeleton]');
    await expect(section(page)).toHaveAttribute('data-load-count', '0');
    await expect(skel).toHaveCount(0);
    await id(page, 'load-start').click();
    await expect(skel).toHaveCount(6);
    for (const s of await skel.all()) await expect(s).toBeVisible();
    await expect(page.locator('[data-testid=async-section] [data-skeleton-group]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    await expect(id(page, 'loaded')).toHaveCount(0);
    await expect(section(page)).toHaveAttribute('data-load-count', '1');
    await id(page, 'load-resolve').click();
    await expect(skel).toHaveCount(0);
    await expect(id(page, 'loaded')).toHaveText(T['dev.states.loaded']);
  });

  test('EZD-015c done when: the inline error shows its message and Retry calls the handler', async ({
    page,
  }) => {
    await open(page, '/dev/states');
    const retrySection = id(page, 'retry-section');
    const alert = retrySection.locator('[role=alert]');
    await expect(alert).toHaveAttribute('data-state', 'error');
    await expect(alert).toContainText(T['dev.states.sample_error']);
    await expect(id(page, 'retry-count')).toHaveText('0');
    await retrySection.getByRole('button', { name: T['common.retry'] }).click();
    await expect(id(page, 'retry-count')).toHaveText('1');

    await id(page, 'load-start').click();
    await id(page, 'load-reject').click();
    const sectionAlert = page.locator('[data-testid=async-section] [role=alert]');
    await expect(sectionAlert).toHaveCount(1);
    await expect(sectionAlert).toContainText(T['dev.states.sample_error']);
    await expect(sectionAlert.getByRole('button')).toHaveCount(1);
    await expect(sectionAlert.getByRole('button')).toHaveText(T['common.retry']);
    await expect(page.locator('[data-testid=async-section] [data-skeleton]')).toHaveCount(0);
    await sectionAlert.getByRole('button', { name: T['common.retry'] }).click();
    const skel = page.locator('[data-testid=async-section] [data-skeleton]');
    await expect(skel).toHaveCount(6);
    for (const s of await skel.all()) await expect(s).toBeVisible();
    await expect(sectionAlert).toHaveCount(0);
    await expect(section(page)).toHaveAttribute('data-load-count', '2');
  });

  test('EZD-015c done when: the offline banner shows when the network helper is off', async ({
    page,
    network,
  }) => {
    await open(page, '/dev/states');
    const banner = page.locator('[data-testid=offline-section] [data-state=offline]');
    await expect(banner).toHaveCount(0);
    await network.set(page, 'off');
    await expect(banner).toHaveCount(1);
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'status');
    await expect(banner).toHaveText(T['common.offline']);
    await network.set(page, 'on');
    await expect(banner).toHaveCount(0);
  });

  test('EZD-015c done when: a toast appears and clears', async ({ page }) => {
    await open(page, '/dev/states');
    const viewport = page.locator('[data-toast-viewport]');
    const toast = page.locator('[data-toast-viewport] [data-toast]');
    await expect(viewport).toHaveAttribute('role', 'status');
    await expect(viewport).toHaveAttribute('aria-live', 'polite');
    await id(page, 'toast-show').click();
    await expect(toast).toHaveCount(1);
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(T['dev.states.sample_toast']);
    await expect(toast).toHaveCount(0, { timeout: 4000 });

    await id(page, 'toast-show-persistent').click();
    await expect(toast).toHaveCount(1);
    await page.waitForTimeout(2000);
    await expect(toast).toHaveCount(1);
    const close = toast.getByRole('button', { name: T['common.close'] });
    await expect(close).toHaveAttribute('aria-label', T['common.close']);
    await close.click();
    await expect(toast).toHaveCount(0);
  });

  test('EZD-015c done when: the confirm dialog returns the pressed choice.', async ({ page }) => {
    await open(page, '/dev/states');
    const result = id(page, 'confirm-result');
    const dialog = page.getByRole('alertdialog', { name: T['dev.states.confirm_title'] });
    const overlay = page.locator('[data-confirm-overlay]');
    const overlayColor = (await probe(page, 'background-color: var(--ez-overlay)')).backgroundColor;
    const redColor = (await probe(page, 'background-color: var(--ez-red)')).backgroundColor;

    const openAndCheck = async (first: boolean): Promise<void> => {
      await id(page, 'confirm-open').click();
      await expect(result).toHaveText('pending');
      await expect(dialog).toHaveCount(1);
      await expect(dialog).toHaveAccessibleDescription(T['dev.states.confirm_message']);
      await expect(page.locator('[data-confirm]')).toHaveAttribute('lang', 'en');
      const action = dialog.getByRole('button', { name: T['dev.states.confirm_ok'] });
      const cancel = dialog.getByRole('button', { name: T['common.cancel'] });
      await expect(action).toHaveCount(1);
      await expect(cancel).toHaveCount(1);
      await expect(cancel).toBeFocused();
      await expect(overlay).toHaveCSS('background-color', overlayColor);
      if (first) await expect(action).toHaveCSS('background-color', redColor);
    };

    await openAndCheck(true);
    await page.mouse.move(0, 0);
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: T['dev.states.confirm_ok'] })
      .click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(result).toHaveText('confirm');

    await openAndCheck(false);
    await page.getByRole('alertdialog').getByRole('button', { name: T['common.cancel'] }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(result).toHaveText('cancel');

    await openAndCheck(false);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(result).toHaveText('cancel');
  });

  test(
    'EZD-015c done when: Retry, toast close and dialog buttons are 44 px targets on iPad, Surface and phone',
    { tag: ['@ipad', '@surface', '@phone'] },
    async ({ page }) => {
      await open(page, '/dev/states');
      expect(await coarse(page)).toBe(true);
      await id(page, 'load-start').click();
      await id(page, 'load-reject').click();
      const r1 = page.locator('[data-testid=async-section] [role=alert]');
      const r2 = page.locator('[data-testid=retry-section] [role=alert]');
      for (const [root, count] of [
        [r1, 1],
        [r2, 1],
      ] as const) {
        await root.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        expect(await expectTouchTargets(page, root)).toBe(count);
      }
      await id(page, 'toast-show-persistent').click();
      const r3 = page.locator('[data-toast]');
      expect(await expectTouchTargets(page, r3)).toBe(1);
      await r3.getByRole('button', { name: T['common.close'] }).click();
      await expect(r3).toHaveCount(0);
      await id(page, 'confirm-open').click();
      const r4 = page.locator('[data-confirm]');
      await expect(r4).toHaveCount(1);
      await expect(r4.getByRole('button', { name: T['common.cancel'] })).toBeFocused();
      // Radix sets body pointer-events none, then gives the dialog pointer-events auto on its next render.
      await expect(r4).toHaveCSS('pointer-events', 'auto');
      expect(await expectTouchTargets(page, r4)).toBe(2);
    },
  );

  test(
    'EZD-015c done when: Retry, Offline and Cancel show in Spanish on a phone',
    { tag: ['@phone'] },
    async ({ page, network }) => {
      await open(page, '/dev/states?lang=es');
      await id(page, 'load-start').click();
      await id(page, 'load-reject').click();
      const retry = page
        .locator('[data-testid=async-section]')
        .getByRole('button', { name: TES['common.retry'] });
      await expect(retry).toHaveText(TES['common.retry']);
      await network.set(page, 'off');
      const banner = page.locator('[data-testid=offline-section] [data-state=offline]');
      await expect(banner).toHaveText(TES['common.offline']);
      const langOf = (el: typeof retry) =>
        el.evaluate((n) => n.closest('[lang]')?.getAttribute('lang'));
      const retryLang = await langOf(retry);
      await id(page, 'confirm-open').click();
      const cancel = page.getByRole('alertdialog').getByRole('button', {
        name: TES['common.cancel'],
      });
      await expect(cancel).toHaveText(TES['common.cancel']);
      expect(retryLang).toBe('es');
      for (const el of [banner, cancel]) {
        expect(await langOf(el)).toBe('es');
      }
      for (const k of ['common.retry', 'common.offline', 'common.cancel']) {
        expect(TES[k].trim()).not.toBe('');
        expect(TES[k]).not.toBe(T[k]);
      }
    },
  );
});
