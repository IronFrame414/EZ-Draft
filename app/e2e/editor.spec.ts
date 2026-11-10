// EZD-120c B1-B11 (vault/plans/EZD-120c.md section 4; AC-EZD-120c-1 to -15). Untagged, so desktop 1600 x 1000. Every
// test makes its own company (never tenant 1) with fixture S (app/test-harness/projects-fixture.ts; P1 "bravo",
// client "Zed Co"; each project starts with the floor "Floor 1", P120a M4) and its own members and context.
// Expected values: plan section 4 rows (Q-0500, Q-0501, Q-0505, Q-0214, Q-0273, S03 States, 03a, ARCH Errors) and
// `scripts/perf/budgets.mjs` download.editor (B11). E(n) renames the floor to n through the dev hook.
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  signedInJsContents,
  signedInJsSize,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

async function member(
  tenant: string,
  permissions: string[],
  scope: 'all' | 'listed' = 'all',
  listed: string[] = [],
) {
  const m = await createMember({ tenantId: tenant, scope, listed });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, user: await member(tenant, permissions) };
}

type Hook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edit(changes: unknown[]): string[];
};

// E(n): rename the floor to n through the test hook.
const E = (page: Page, n: string) =>
  page.evaluate((name) => {
    const hook = (window as unknown as { __ezdraftEditor: Hook }).__ezdraftEditor;
    const floor = hook.objects().find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return hook.edit([
      { id: floor.id, value: { type: 'floor', schemaVersion: 1, data: { name, order: 1 } } },
    ]);
  }, n);

const floorName = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __ezdraftEditor: Hook }).__ezdraftEditor
        .objects()
        .find((o) => o.type === 'floor')?.data.name,
  );

// DB: the floor's name in model_object, read as the service role.
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

// IDB(store): the number of records in a store of the device database.
const IDB = (page: Page, store: 'outbox' | 'working_copy') =>
  page.evaluate(
    (s) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('ezdraft-device');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(s)) {
            db.close();
            resolve(0);
            return;
          }
          const count = db.transaction(s, 'readonly').objectStore(s).count();
          count.onerror = () => reject(count.error);
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
    store,
  );

const editorState = (page: Page) => page.getByTestId('editor-state');
const saveState = (page: Page) => page.getByTestId('save-state');
const banner = (page: Page) => page.getByTestId('save-failed-banner');
const SAVE_ROUTE = '**/api/projects/*/objects';
const LOAD_ROUTE = '**/api/projects/*/model';
const NO_ACCESS = "You don't have access to this. Ask your supervisor.";

const apiRequests = (page: Page): string[] => {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) urls.push(r.url());
  });
  return urls;
};
// Landing settle (EZD-334, copy of projects.spec.ts): finished GET /api/notifications; two after sign-in, four after `/`.
function countNotificationGets(page: Page): () => number {
  let count = 0;
  page.on('requestfinished', (req) => {
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/notifications') count++;
  });
  return () => count;
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
}

test.describe('EZD-120c editor route', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-120c B1 a project card opens the editor, which asks for the model and the conflict list and nothing else', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    const landing = countNotificationGets(page);
    await signInAs(user.email);
    await expect.poll(landing).toBe(2);
    await page.goto('/');
    await expect(page.getByTestId('project-card')).toHaveCount(6);
    await expect.poll(landing).toBe(4);
    const urls = apiRequests(page);
    await page.locator(`[data-testid="project-card"][data-project-id="${ids.P1}"]`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${ids.P1}`);
    await expect(page.getByText('bravo')).toBeVisible();
    await page.waitForTimeout(500);
    expect(urls.map((u) => new URL(u).pathname)).toEqual([
      `/api/projects/${ids.P1}/model`,
      '/api/sync-conflicts',
    ]);
  });

  test('EZD-120c B2 the editor shows the project, the client, the working copy, Saved and the Plan tab, with the drawing rail, no panels or status items', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(saveState(page).locator('xpath=..')).toHaveText('Zed Co · Working copy · Saved');
    await expect(page.locator('header nav button')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveCount(5);
    for (const region of ['left-panel', 'inspector'])
      await expect(page.locator(`[data-shell-region="${region}"]`)).toHaveCount(0);
    await expect(page.locator('[data-status-item]')).toHaveCount(4);
    await expect(page.getByTestId('plan-empty-hint')).toHaveText(
      'Draw walls with Wall (W) or Room rectangle (R).',
    );
    const text = await page.locator('[data-shell-region="canvas"]').evaluate((el) => {
      const c = el.cloneNode(true) as HTMLElement;
      c.querySelector('[data-testid="plan-empty-hint"]')?.remove();
      return (c.textContent ?? '').trim();
    });
    expect(text).toBe('');
  });

  test('EZD-120c B3 an edit shows Saving…, then Saved just now with the change in the database, then Saved 1 min ago', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await page.clock.install();
    await openReady(page, ids.P1);
    await E(page, 'Floor A');
    await expect(saveState(page)).toHaveText('Saving…');
    await expect(saveState(page)).toHaveText('Saved just now');
    await expect.poll(() => dbName(ids.P1)).toBe('Floor A');
    await page.clock.fastForward(60_000);
    await expect(saveState(page)).toHaveText('Saved 1 min ago');
  });

  test('EZD-120c done when B4 offline: edits queue on the device under the Offline banner and sync when the connection returns', async ({
    page,
    signInAs,
    network,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await network.set(page, 'off');
    await E(page, 'Floor A');
    await E(page, 'Floor B');
    await expect(page.locator('[data-state="offline"]')).toHaveText(
      'Offline. Changes are saved on this device and will sync.',
    );
    await expect.poll(() => IDB(page, 'outbox')).toBe(1);
    expect(await dbName(ids.P1)).toBe('Floor 1');
    await network.set(page, 'on');
    await expect(page.locator('[data-state="offline"]')).toHaveCount(0);
    await expect.poll(() => IDB(page, 'outbox')).toBe(0);
    await expect.poll(() => dbName(ids.P1)).toBe('Floor B');
  });

  test('EZD-120c B5 a failing save shows Changes not saved and Not saved, and Retry saves it', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(60_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await page.route(SAVE_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      }),
    );
    await E(page, 'Floor A');
    await expect(banner(page)).toContainText('Changes not saved', { timeout: 20_000 });
    await expect(saveState(page)).toHaveText('Not saved');
    expect(await IDB(page, 'outbox')).toBe(1);
    expect(await dbName(ids.P1)).toBe('Floor 1');
    await page.unroute(SAVE_ROUTE);
    await banner(page).getByRole('button', { name: 'Retry' }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect.poll(() => IDB(page, 'outbox')).toBe(0);
    await expect.poll(() => dbName(ids.P1)).toBe('Floor A');
  });

  test('EZD-120c B6 a view-only member sees the project and the working copy, with no save state and no hook', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await expect(page.getByText('Zed Co · Working copy')).toBeVisible();
    await expect(saveState(page)).toHaveCount(0);
    expect(await page.evaluate(() => '__ezdraftEditor' in window)).toBe(false);
  });

  test('EZD-120c B7 a member without View projects sees the no-access line and no project data', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS([]);
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'no-access');
    await expect(page.getByTestId('no-access')).toHaveText(NO_ACCESS);
    await expect(page.getByText('bravo')).toHaveCount(0);
  });

  test('EZD-120c B8 an unknown project and one outside the member list both show Page not found', async ({
    sessions,
  }) => {
    const { tenant, ids, user } = await fixtureS();
    const listed = await member(tenant, EDITOR, 'listed', [ids.P3]);
    const [a, b] = await sessions.open([user.email, listed.email]);
    const unknown = crypto.randomUUID();
    for (const [session, id] of [
      [a, unknown],
      [b, ids.P1],
    ] as const) {
      const model = session.page.waitForResponse(
        (r) => new URL(r.url()).pathname === `/api/projects/${id}/model`,
      );
      await session.page.goto(`/projects/${id}`);
      expect((await model).status()).toBe(404);
      await expect(editorState(session.page)).toHaveAttribute('data-editor-state', 'not-found');
      await expect(session.page.getByTestId('editor-not-found')).toHaveText('Page not found.');
    }
  });

  test('EZD-120c B9 a held load shows the skeleton, a failed load shows the message with Retry, and Retry opens the project', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(LOAD_ROUTE, async (route) => {
      await held;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      });
    });
    await page.goto(`/projects/${ids.P1}`);
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'loading');
    await expect(editorState(page).locator('[data-skeleton]').first()).toBeVisible();
    release();
    await expect(page.getByText("Couldn't load this project.")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await page.unroute(LOAD_ROUTE);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect(page.getByText('bravo')).toBeVisible();
  });

  test('EZD-120c B10 an edit that was not saved is back after a reload, saved to the server on open', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await page.route(SAVE_ROUTE, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      }),
    );
    await E(page, 'Floor A');
    await expect.poll(() => IDB(page, 'outbox')).toBe(1);
    await page.unroute(SAVE_ROUTE);
    await page.reload();
    await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
    await expect.poll(() => floorName(page)).toBe('Floor A');
    expect(await IDB(page, 'working_copy')).toBe(1);
    await expect.poll(() => dbName(ids.P1)).toBe('Floor A');
    await expect(saveState(page)).toHaveText('Saved just now');
  });

  test('EZD-120c B11 the editor route loads no code past the editor entry rules and stays within 500,000 compressed bytes', async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const state = await page.context().storageState();
    const url = `/projects/${ids.P1}`;
    const contents = await signedInJsContents(browser, state, url, 'editor');
    expect('error' in contents).toBe(false);
    expect('value' in contents ? contents.value : -1).toBe(0);
    const size = await signedInJsSize(browser, state, url);
    expect('error' in size).toBe(false);
    expect('value' in size ? size.value : Infinity).toBeLessThanOrEqual(500_000);
  });
});
