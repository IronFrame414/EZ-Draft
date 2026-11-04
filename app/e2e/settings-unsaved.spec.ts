// EZD-103b B7-B11 and the done-when test (vault/plans/EZD-103b.md sections 1, 3, 4; AC-EZD-103-5).
// Untagged, so desktop only (1600 x 1000). Signed in as the seeded owner (Josh, tenant 1). Page: the dev
// page /dev/settings[?fail=1] with input data-testid settings-sample-input (section 3; Decided "Dev page").
// Markup: section 3 "dialog" ([data-confirm], buttons Cancel, Discard, Save), "toast"
// ([data-toast-viewport] > [data-toast]), "links" ([data-settings-back], [data-settings-nav="<id>"]),
// "IndexedDB" (ezdraft-settings-drafts, store drafts), "sessionStorage" (ezd-dev-settings-saved).
// Expected values: AC-5; Q-0228 (the three words); Q-0265 (b) (browser Back); Q-0302 (drafts with a
// notice); section 6 wording. "Back" is history.back() in the page, then a wait for the expected URL
// (section 4 header). The done-when test reuses the inputs and expected values of B8 and B11 (a).
import type { Page } from '@playwright/test';
import { JOSH_EMAIL, expect, signInAsOwner, test } from '../test-harness/e2e/test';

const TITLE = 'Save your changes?';
const BUTTONS = ['Cancel', 'Discard', 'Save'];
const RESTORED = 'Your unsaved changes from last time are still here.';
const SAVED_KEY = 'ezd-dev-settings-saved';

const pathOf = (page: Page) => new URL(page.url()).pathname;
const input = (page: Page) => page.getByTestId('settings-sample-input');
const dialog = (page: Page) => page.locator('[data-confirm]');
const toasts = (page: Page) => page.locator('[data-toast-viewport] > [data-toast]');
const nav = (page: Page, id: string) => page.locator(`[data-settings-nav="${id}"]`);
const backLink = (page: Page) => page.locator('[data-settings-back]');
const choose = (page: Page, label: string) =>
  dialog(page).getByRole('button', { name: label, exact: true }).click();
const atPath = (page: Page, path: string) => page.waitForURL((u) => u.pathname === path);
const back = async (page: Page, path: string) => {
  await page.evaluate(() => history.back());
  await atPath(page, path);
};
const savedValue = (page: Page) =>
  page.evaluate((key) => window.sessionStorage.getItem(key), SAVED_KEY);

const expectPrompt = async (page: Page) => {
  await expect(dialog(page)).toHaveCount(1);
  await expect(dialog(page).locator('h2')).toHaveText(TITLE);
  await expect(dialog(page).getByRole('button')).toHaveText(BUTTONS);
};

// Section 4: the stored drafts, read without ever creating the database.
const readDrafts = (page: Page) =>
  page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    if (!dbs.some((d) => d.name === 'ezdraft-settings-drafts')) return [];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('ezdraft-settings-drafts');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!db.objectStoreNames.contains('drafts')) return [];
      return await new Promise<unknown[]>((resolve, reject) => {
        const req = db.transaction('drafts', 'readonly').objectStore('drafts').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  });

test.describe('EZD-103b settings unsaved edits', () => {
  test('EZD-103b done when: leaving with unsaved edits asks Save your changes? with Save / Discard / Cancel, and the edits come back with a notice', async ({
    page,
  }) => {
    await signInAsOwner(page);
    page.on('dialog', (d) => void d.accept());
    await page.goto('/settings/company');
    await page.goto('/dev/settings');
    await input(page).fill('x');

    await backLink(page).click();
    await expectPrompt(page);
    await choose(page, 'Cancel');
    await expect(dialog(page)).toHaveCount(0);
    expect(pathOf(page)).toBe('/dev/settings');

    await expect.poll(() => readDrafts(page)).toEqual([{ value: 'x' }]);
    await page.evaluate(() => history.go(-2));
    await atPath(page, '/settings/company');
    await page.goto('/dev/settings');
    await expect(input(page)).toHaveValue('x');
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toContainText(RESTORED);
  });

  test('B7 prompt Cancel, Discard', async ({ page }) => {
    await signInAsOwner(page);
    await page.goto('/dev/settings');
    await nav(page, 'company').click();
    await atPath(page, '/settings/company');
    await expect(dialog(page)).toHaveCount(0);

    await page.goto('/dev/settings');
    await input(page).fill('x');
    await nav(page, 'company').click();
    await expectPrompt(page);

    await choose(page, 'Cancel');
    await expect(dialog(page)).toHaveCount(0);
    expect(pathOf(page)).toBe('/dev/settings');
    await expect(input(page)).toHaveValue('x');

    await nav(page, 'company').click();
    await expect(dialog(page)).toHaveCount(1);
    await choose(page, 'Discard');
    await atPath(page, '/settings/company');
  });

  test('B8 prompt Save', async ({ page }) => {
    await signInAsOwner(page);

    // (a) Save succeeds: leaves for Projects and the value is saved.
    await page.goto('/dev/settings');
    await input(page).fill('abc');
    await backLink(page).click();
    await expect(dialog(page)).toHaveCount(1);
    await choose(page, 'Save');
    await atPath(page, '/');
    expect(await savedValue(page)).toBe('abc');

    // (b) Save fails: the dialog closes and the page stays with the edit.
    await page.goto('/dev/settings?fail=1');
    await input(page).fill('q');
    await backLink(page).click();
    await expect(dialog(page)).toHaveCount(1);
    await choose(page, 'Save');
    await expect(dialog(page)).toHaveCount(0);
    expect(pathOf(page)).toBe('/dev/settings');
    await expect(input(page)).toHaveValue('q');
  });

  test('B9 leaving the tab', async ({ page, sessions }) => {
    await signInAsOwner(page);

    // (a) With an edit, closing the tab shows the browser's leave warning.
    await page.goto('/dev/settings');
    await input(page).fill('x');
    const seen = new Promise<string>((resolve) => {
      page.once('dialog', (d) => {
        const type = d.type();
        void d.dismiss();
        resolve(type);
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await seen).toBe('beforeunload');

    // (b) With no edit, the tab closes with no warning. A fresh context (its own empty IndexedDB), so the
    // draft of (a) is never restored here; the fixture's teardown closes that context.
    const [session] = await sessions.open([JOSH_EMAIL]);
    const clean = session.page;
    await clean.goto('/dev/settings');
    await expect(input(clean)).toBeVisible();
    let dialogs = 0;
    clean.on('dialog', (d) => {
      dialogs += 1;
      void d.dismiss();
    });
    const closed = clean.waitForEvent('close', { timeout: 2_000 });
    await clean.close({ runBeforeUnload: true });
    await closed;
    expect(dialogs).toBe(0);
    expect(clean.isClosed()).toBe(true);
  });

  test('B10 browser Back and Forward', async ({ page }) => {
    await signInAsOwner(page);
    let dialogs = 0;
    page.on('dialog', (d) => {
      dialogs += 1;
      void d.dismiss();
    });
    const start = async () => {
      await page.goto('/settings/company');
      await page.goto('/dev/settings');
      await expect(input(page)).toBeVisible();
    };

    // (a) No edit: Back leaves in one press.
    await start();
    await back(page, '/settings/company');
    await expect(dialog(page)).toHaveCount(0);
    expect(dialogs).toBe(0);

    // (b) Edit, Back asks; Cancel stays; Back asks again; Discard leaves.
    await start();
    await input(page).fill('x');
    await page.evaluate(() => history.back());
    await expectPrompt(page);
    expect(pathOf(page)).toBe('/dev/settings');
    await choose(page, 'Cancel');
    await expect(dialog(page)).toHaveCount(0);
    expect(pathOf(page)).toBe('/dev/settings');
    await expect(input(page)).toHaveValue('x');
    await page.evaluate(() => history.back());
    await expectPrompt(page);
    await choose(page, 'Discard');
    await atPath(page, '/settings/company');
    expect(dialogs).toBe(0);

    // (c) Edit, Back, Save: leaves and the value is saved.
    await start();
    await input(page).fill('abc');
    await page.evaluate(() => history.back());
    await expect(dialog(page)).toHaveCount(1);
    await choose(page, 'Save');
    await atPath(page, '/settings/company');
    expect(await savedValue(page)).toBe('abc');
    expect(dialogs).toBe(0);

    // (d) A guarded nav leave replaces the extra entry: Back, Back walks origin then the first page.
    await start();
    await input(page).fill('y');
    await nav(page, 'users').click();
    await expect(dialog(page)).toHaveCount(1);
    await choose(page, 'Discard');
    await atPath(page, '/settings/users');
    await back(page, '/dev/settings');
    await back(page, '/settings/company');
    expect(dialogs).toBe(0);

    // (e) While armed there is no forward entry: Forward does nothing and the edit stays.
    await page.goto('/settings/company');
    await page.goto('/dev/settings');
    await page.goto('/settings/users');
    await back(page, '/dev/settings');
    await input(page).fill('x');
    await page.evaluate(() => history.forward());
    await page.waitForTimeout(1_000);
    expect(pathOf(page)).toBe('/dev/settings');
    await expect(input(page)).toHaveValue('x');
    await expect(dialog(page)).toHaveCount(0);
    expect(dialogs).toBe(0);
  });

  test('B11 draft', async ({ page }) => {
    await signInAsOwner(page);
    page.on('dialog', (d) => void d.accept());
    await page.goto('/settings/company');
    await page.goto('/dev/settings');

    // (a) The edit is stored; a jump of two entries leaves with no prompt; the edit comes back with a notice.
    await input(page).fill('x');
    await expect.poll(() => readDrafts(page)).toEqual([{ value: 'x' }]);
    await page.evaluate(() => history.go(-2));
    await atPath(page, '/settings/company');
    await expect(dialog(page)).toHaveCount(0);
    await page.goto('/dev/settings');
    await expect(input(page)).toHaveValue('x');
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toContainText(RESTORED);

    // (b) Discard clears the draft: nothing comes back and no notice.
    await nav(page, 'company').click();
    await expect(dialog(page)).toHaveCount(1);
    await choose(page, 'Discard');
    await atPath(page, '/settings/company');
    await page.goto('/dev/settings');
    await expect(input(page)).toBeVisible();
    await expect(input(page)).toHaveValue('');
    expect(await readDrafts(page)).toEqual([]);
    await page.waitForTimeout(1_000);
    await expect(toasts(page)).toHaveCount(0);

    // (c) A reload keeps the edit and shows the notice.
    await input(page).fill('z');
    await expect.poll(() => readDrafts(page)).toEqual([{ value: 'z' }]);
    await page.reload();
    await expect(input(page)).toHaveValue('z');
    await expect(toasts(page)).toHaveCount(1);
    await expect(toasts(page)).toContainText(RESTORED);

    // (d) Save clears the draft.
    await backLink(page).click();
    await expect(dialog(page)).toHaveCount(1);
    await choose(page, 'Save');
    await atPath(page, '/');
    expect(await savedValue(page)).toBe('z');
    await page.goto('/dev/settings');
    await expect(input(page)).toBeVisible();
    await expect(input(page)).toHaveValue('');
    expect(await readDrafts(page)).toEqual([]);
    await page.waitForTimeout(1_000);
    await expect(toasts(page)).toHaveCount(0);
  });
});
