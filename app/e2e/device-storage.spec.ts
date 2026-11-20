// EZD-134 (AC-EZD-134-1 to -3; 03b Architecture rules 10 and 12; 11 Offline; Q-0338; Q-0540). Every test makes its
// own company (never tenant 1) with fixture S and one editor. The edit is the dev hook renaming the floor, as
// EZD-120d's sign-out spec; aborting the save route keeps it queued on the device.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const SAVE_ROUTE = '**/api/projects/*/objects';
const BUILD_HEADER = 'x-ezdraft-app-build';
const UNSYNCED = 'Some changes are saved only on this device.';
// ReloadPrompt and the Projects warning read the queued count every 2,000 ms (QUEUED_POLL_MS).
const MORE_THAN_ONE_POLL_MS = 2500;

async function setup() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const a = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, a.membershipId, EDITOR as never);
  return { ids, a };
}

type Hook = {
  objects(): Array<{ id: string; type: string }>;
  edit(changes: unknown[]): string[];
};

const renameFloor = (page: Page, name: string) =>
  page.evaluate((n) => {
    const hook = (window as unknown as { __ezdraftEditor: Hook }).__ezdraftEditor;
    const floor = hook.objects().find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return hook.edit([
      { id: floor.id, value: { type: 'floor', schemaVersion: 1, data: { name: n, order: 1 } } },
    ]);
  }, name);

const queued = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('ezdraft-device');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('outbox')) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction('outbox', 'readonly').objectStore('outbox').count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
  );

async function queueOneEdit(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await page.route(SAVE_ROUTE, (r) => r.abort());
  await renameFloor(page, 'Floor A');
  await expect.poll(() => queued(page)).toBe(1);
}

// True once a worker controls the page and the page and every same-origin static file it loaded are cached.
const shellCached = (page: Page) =>
  page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) return false;
    const page = await (await caches.open('ezdraft-shell')).match(location.href, { ignoreVary: true });
    if (!page) return false;
    const files = [
      ...new Set(
        performance
          .getEntriesByType('resource')
          .map((e) => new URL(e.name))
          .filter((u) => u.origin === location.origin && u.pathname.startsWith('/_next/static/'))
          .map((u) => u.href),
      ),
    ];
    const stat = await caches.open('ezdraft-static');
    const hits = await Promise.all(files.map((f) => stat.match(f)));
    return files.length > 0 && hits.every((h) => h !== undefined);
  });

const appCaches = (page: Page) =>
  page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('ezdraft-')).sort());

test.describe('EZD-134 app-shell cache and device storage', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'EZD-134 done when: with the network off the app shell loads from the cache (AC-EZD-134-1)',
    { tag: ['@desktop', '@ipad', '@phone'] },
    async ({ page, signInAs, network }) => {
      const { a } = await setup();
      await signInAs(a.email);
      await page.goto('/');
      await expect(page.getByTestId('projects-header')).toBeVisible();
      await expect.poll(() => shellCached(page), { timeout: 20_000 }).toBe(true);
      await network.set(page, 'off');
      await page.reload();
      await expect(page.getByTestId('projects-header')).toBeVisible();
      await expect(page.getByTestId('projects-wordmark')).toHaveText('ezdraft');
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
      await network.set(page, 'on');
    },
  );

  test('EZD-134 sign-out deletes the app caches', async ({ page, signInAs }) => {
    const { a } = await setup();
    await signInAs(a.email);
    await page.goto('/');
    await expect.poll(() => shellCached(page), { timeout: 20_000 }).toBe(true);
    expect(await appCaches(page)).toContain('ezdraft-shell');
    await page.getByTestId('avatar-menu-trigger').click();
    await page.getByTestId('avatar-menu-sign-out').click();
    await expect.poll(() => new URL(page.url()).pathname).toBe('/sign-in');
    // Nothing of the signed-in pages is left (sign-in itself is never stored).
    const left = await page.evaluate(async () => {
      const out: string[] = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('ezdraft-') || name === 'ezdraft-static') continue;
        for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
      }
      return out;
    });
    expect(left).toEqual([]);
  });

  test('EZD-134 done when: a queued change shows the warning on the Projects page (AC-EZD-134-2)', async ({
    page,
    signInAs,
  }) => {
    const { ids, a } = await setup();
    await signInAs(a.email);
    await queueOneEdit(page, ids.P1);
    await page.goto('/');
    const warning = page.getByTestId('projects-unsynced');
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText(UNSYNCED);
    await page.unroute(SAVE_ROUTE);
    await expect.poll(() => queued(page), { timeout: 30_000 }).toBe(0);
    await expect(warning).toHaveCount(0);
    // The server answers with this page's own build: with the outbox empty, still no reload prompt.
    await page.reload();
    await expect(page.getByTestId('projects-header')).toBeVisible();
    await page.waitForTimeout(MORE_THAN_ONE_POLL_MS);
    await expect(page.getByTestId('app-reload-prompt')).toHaveCount(0);
  });

  test('EZD-134 done when: an older-version answer to a request other than a save shows the reload prompt only after the outbox is empty (AC-EZD-134-3)', async ({
    page,
    signInAs,
  }) => {
    const { ids, a } = await setup();
    await signInAs(a.email);
    await queueOneEdit(page, ids.P1);
    // The counts read answers as a newer server build would.
    let newer = 0;
    await page.route('**/api/projects/counts**', async (route) => {
      const response = await route.fetch();
      const build = Number(response.headers()[BUILD_HEADER]);
      expect(build).toBeGreaterThan(0);
      newer += 1;
      await route.fulfill({
        response,
        headers: { ...response.headers(), [BUILD_HEADER]: String(build + 1) },
      });
    });
    await page.goto('/');
    await expect(page.getByTestId('projects-unsynced')).toBeVisible();
    await expect.poll(() => newer).toBeGreaterThan(0);
    // Outdated, but one edit is still queued: no prompt over more than one read of the count.
    await page.waitForTimeout(MORE_THAN_ONE_POLL_MS);
    expect(await queued(page)).toBe(1);
    await expect(page.getByTestId('app-reload-prompt')).toHaveCount(0);
    // The outbox drains; then the prompt shows.
    await page.unroute(SAVE_ROUTE);
    await expect.poll(() => queued(page), { timeout: 30_000 }).toBe(0);
    const prompt = page.getByTestId('app-reload-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('EZ Draft has been updated. Reload to use the new version.');
    await page.unroute('**/api/projects/counts**');
    await prompt.getByTestId('app-reload').click();
    await expect(page.getByTestId('projects-header')).toBeVisible();
    await expect(page.getByTestId('app-reload-prompt')).toHaveCount(0);
  });
});
