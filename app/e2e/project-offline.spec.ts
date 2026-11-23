// EZD-1401 (AC-EZD-1401-1; 11 Offline "the current project [is] cached by the service worker after first load";
// S17 Offline status icon; Q-0338 (a): also the ipad-landscape WebKit project). Every test makes its own
// company (never tenant 1) with fixture S and one editor, as device-storage.spec.ts (EZD-134).
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

async function setup() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const a = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, a.membershipId, EDITOR as never);
  return { ids, a };
}

const icon = (page: Page) => page.getByTestId('offline-icon');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(page.getByTestId('plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// The editor's test hook exists only while the editor autosaves (an editor holding the lock).
const editing = (page: Page) =>
  page.evaluate(() => (window as unknown as { __ezdraftEditor?: unknown }).__ezdraftEditor !== undefined);

const renameFloor = (page: Page, name: string) =>
  page.evaluate((n) => {
    type Hook = { objects(): Array<{ id: string; type: string }>; edit(c: unknown[]): string[] };
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

// EZD-1937: what an offline open needs, read from the device itself: the worker controls the page (its offline
// routes answer the reload, sw-rules.mjs), and the page copy, the model answer (project-cache.ts) and every
// script, style and icon file the page loaded are in the device caches. The green icon alone is not that: it
// turns green on the page copy and the model, while the worker may still be storing the files (warmFiles).
const offlineReady = (page: Page, projectId: string) =>
  page.evaluate(async (id) => {
    if (navigator.serviceWorker.controller === null) return false;
    const held = { ignoreVary: true };
    const projects = await caches.open('ezdraft-projects');
    const here = new URL(location.href);
    here.hash = '';
    if (!(await projects.match(here.href, held))) return false;
    const model = new URL(`/api/projects/${id}/model`, location.origin).href;
    if (!(await projects.match(model, held))) return false;
    const files = await caches.open('ezdraft-static');
    for (const entry of performance.getEntriesByType('resource')) {
      const kind = (entry as PerformanceResourceTiming).initiatorType;
      if (kind === 'fetch' || kind === 'xmlhttprequest' || kind === 'beacon') continue;
      const url = new URL(entry.name);
      url.hash = '';
      if (url.origin !== location.origin) continue;
      if (!/^\/(_next\/static|app-icons|icons)\//.test(url.pathname)) continue;
      if (!(await files.match(url.href))) return false;
    }
    return true;
  }, projectId);

test.describe('EZD-1401 service worker cache', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'EZD-1401 done when: with the network off, a project opened earlier opens read-only from the cache and the icon shows cached (AC-EZD-1401-1)',
    // Q-0338 (a) names phone too, but a phone never opens the editor ("Editing is done on an iPad or a computer");
    // the phone's offline open is the field pack's (EZD-1404). vault/build/assumptions.md EZD-1401.
    { tag: ['@desktop', '@ipad'] },
    async ({ page, signInAs, network }) => {
      const { ids, a } = await setup();
      await signInAs(a.email);
      await openReady(page, ids.P1);
      // Online the editor edits and autosaves; once the project is stored the icon turns green.
      await expect.poll(() => editing(page)).toBe(true);
      await expect(icon(page)).toHaveAttribute('data-state', 'cached', { timeout: 20_000 });
      await expect(icon(page)).toHaveAttribute('aria-label', 'Saved on this device for offline use');
      const header = page.getByText('bravo', { exact: true }).first();
      await expect(header).toBeVisible();

      // EZD-1937: the network goes off only once the device holds all an offline open needs.
      await expect.poll(() => offlineReady(page, ids.P1)).toBe(true);
      await network.set(page, 'off');
      await page.reload();
      await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
      await expect(page.getByTestId('plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
      await expect(page.getByText('bravo', { exact: true }).first()).toBeVisible();
      await expect(icon(page)).toHaveAttribute('data-state', 'cached');
      // Read-only: no autosave, so no save word and no edit hook.
      await expect(page.getByTestId('save-state')).toHaveCount(0);
      expect(await editing(page)).toBe(false);
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
      await network.set(page, 'on');
    },
  );

  test('EZD-1401 offline with a queued change the icon is amber with the count', async ({
    page,
    signInAs,
    network,
  }) => {
    const { ids, a } = await setup();
    await signInAs(a.email);
    await openReady(page, ids.P1);
    await expect(icon(page)).toHaveAttribute('data-state', 'cached', { timeout: 20_000 });
    await page.route(SAVE_ROUTE, (r) => r.abort());
    await renameFloor(page, 'Floor A');
    await expect.poll(() => queued(page)).toBe(1);
    await network.set(page, 'off');
    await page.reload();
    await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect(icon(page)).toHaveAttribute('data-state', 'queued');
    await expect(icon(page)).toHaveText('1');
    await expect(icon(page)).toHaveAttribute('aria-label', 'Offline. Changes waiting to sync: 1');
    await network.set(page, 'on');
    await page.unroute(SAVE_ROUTE);
  });
});
