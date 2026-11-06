// EZD-120d B1-B5 (vault/plans/EZD-120d.md sections 4 and 6; AC-EZD-120d-1 to -3). Untagged, so desktop. Every test
// makes its own company (never tenant 1) with fixture S, members A and B (view_projects, edit_model) and its own
// context. Expected values: plan section 4 rows (Q-0503, Q-0507, Q-0581) and the section 6 dialog texts.
// The edit is the dev hook renaming the floor "Floor A"; "blocked" aborts the save route.
import type { Frame, Page } from '@playwright/test';
import {
  adminDb,
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
const DIALOG_TITLE = 'Sign out with changes not sent?';
const DIALOG_MESSAGE =
  'Some changes are saved only on this device. They will send the next time you sign in here.';

async function member(tenant: string) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, EDITOR as never);
  return m;
}

async function setup() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, a: await member(tenant) };
}

type Hook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
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

async function dbName(projectId: string): Promise<unknown> {
  const { data, error } = await adminDb()
    .from('model_object')
    .select('data')
    .eq('project_id', projectId)
    .eq('type', 'floor')
    .single();
  if (error) throw new Error(`model_object read failed: ${error.code}`);
  return (data.data as { name?: unknown }).name;
}

// The number of outbox records in the device database (all people on this browser).
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

const abortSaves = (page: Page) => page.route(SAVE_ROUTE, (r) => r.abort());

// Opens the editor, blocks saves and makes one edit that stays on the device.
async function queueOneEdit(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId('editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await abortSaves(page);
  await renameFloor(page, 'Floor A');
  await expect.poll(() => queued(page)).toBe(1);
}

async function signOut(page: Page) {
  await page.getByTestId('avatar-menu-trigger').click();
  await page.getByTestId('avatar-menu-sign-out').click();
}

// The Cookie header of every /sign-in request the page makes. After an offline sign-out the page sits on
// Chrome's error page, where context.cookies() returns nothing, so the marker is read from the request that
// carried it.
function watchSignInCookies(page: Page): () => string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname !== '/sign-in') return;
    void r
      .headerValue('cookie')
      .then((v) => seen.push(v ?? ''))
      .catch(() => {});
  });
  return () => seen;
}

const isSave = (r: { url(): string; method(): string }) =>
  r.method() === 'POST' && /\/api\/projects\/[^/]+\/objects$/.test(new URL(r.url()).pathname);

// Chrome's error page for a navigation that fails offline (EZD-348).
const CHROME_ERROR_URL = 'chrome-error://chromewebdata/';

// Resolves with the main frame once it has loaded Chrome's error page. Set up before the offline sign-out click,
// so the test can wait for the failed /sign-in navigation to finish before it leaves the page (EZD-348).
function offlineErrorPage(page: Page): Promise<Frame> {
  return page.waitForEvent('framenavigated', {
    predicate: (frame) => frame === page.mainFrame() && frame.url() === CHROME_ERROR_URL,
  });
}

test.describe('EZD-120d sign-out with queued edits', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-120d B1 sign out sends the queued edit first, with no dialog', async ({
    page,
    signInAs,
  }) => {
    const { ids, a } = await setup();
    await signInAs(a.email);
    await queueOneEdit(page, ids.P1);
    await page.goto('/');
    await expect(page.getByTestId('avatar-menu-trigger')).toBeVisible();
    await page.unroute(SAVE_ROUTE);
    await signOut(page);
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/sign-in');
    expect(await dbName(ids.P1)).toBe('Floor A');
  });

  test('EZD-120d B2 any office page sends the queued edit after the editor tab is closed', async ({
    page,
    signInAs,
  }) => {
    const { ids, a } = await setup();
    await signInAs(a.email);
    await queueOneEdit(page, ids.P1);
    const context = page.context();
    await page.close();
    const next = await context.newPage();
    const saved = next.waitForResponse((r) => isSave(r.request()) && r.status() === 200);
    await next.goto('/');
    await saved;
    await expect(next.getByTestId('editor-state')).toHaveCount(0);
    await expect.poll(() => dbName(ids.P1)).toBe('Floor A');
  });

  test('EZD-120d B3 offline sign-out asks, and Cancel stays signed in', async ({
    page,
    signInAs,
    network,
  }) => {
    const { ids, a } = await setup();
    await signInAs(a.email);
    await queueOneEdit(page, ids.P1);
    await page.goto('/');
    await expect(page.getByTestId('avatar-menu-trigger')).toBeVisible();
    await network.set(page, 'off');
    await signOut(page);
    const dialog = page.locator('[data-confirm]');
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText(DIALOG_TITLE);
    await expect(dialog).toContainText(DIALOG_MESSAGE);
    await expect(dialog.getByRole('button', { name: 'Sign out anyway' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.getByTestId('avatar-menu-trigger')).toBeVisible();
  });

  test('EZD-120d B4 Sign out anyway with the server unreachable leaves the marker, then the next request signs out', async ({
    page,
    signInAs,
    network,
  }) => {
    const { ids, a } = await setup();
    await signInAs(a.email);
    await queueOneEdit(page, ids.P1);
    await page.goto('/settings');
    await expect(page.getByTestId('avatar-menu-trigger')).toBeVisible();
    const signInCookies = watchSignInCookies(page);
    await network.set(page, 'off');
    const errorPage = offlineErrorPage(page);
    await signOut(page);
    await page.locator('[data-confirm]').getByRole('button', { name: 'Sign out anyway' }).click();
    await expect.poll(() => signInCookies().some((c) => c.includes('ezd_signed_out=1'))).toBe(true);
    await errorPage;
    await page.goto('about:blank');
    await network.set(page, 'on');
    await page.goto('/settings');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/sign-in');
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names.filter((n) => n.startsWith('sb-'))).toEqual([]);
    expect(names).not.toContain('ezd_signed_out');
    expect(await queued(page)).toBe(1);
  });

  test('EZD-120d B5 another person signing in on the device does not send the first person edits', async ({
    page,
    signInAs,
    network,
  }) => {
    const { tenant, ids, a } = await setup();
    const b = await member(tenant);
    await signInAs(a.email);
    await queueOneEdit(page, ids.P1);
    await page.goto('/settings');
    const signInCookies = watchSignInCookies(page);
    await network.set(page, 'off');
    const errorPage = offlineErrorPage(page);
    await signOut(page);
    await page.locator('[data-confirm]').getByRole('button', { name: 'Sign out anyway' }).click();
    await expect.poll(() => signInCookies().some((c) => c.includes('ezd_signed_out=1'))).toBe(true);
    await errorPage;
    await page.goto('about:blank');
    await network.set(page, 'on');
    await page.goto('/settings');
    await expect.poll(() => new URL(page.url()).pathname).toBe('/sign-in');

    let posts = 0;
    page.on('request', (r) => {
      if (isSave(r)) posts++;
    });
    await signInAs(b.email);
    await page.goto('/');
    await page.waitForTimeout(5000);
    expect(posts).toBe(0);
    expect(await queued(page)).toBe(1);
    await expect(page.locator('[data-confirm]')).toHaveCount(0);
    await signOut(page);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/sign-in');

    // queueOneEdit's abort route stays on this page; lift it so A's send can reach the server.
    await page.unroute(SAVE_ROUTE);
    const saved = page.waitForResponse((r) => isSave(r.request()) && r.status() === 200);
    await signInAs(a.email);
    await saved;
    expect(posts).toBe(1);
  });
});
