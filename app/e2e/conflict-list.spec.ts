// EZD-299 B1-B9 (vault/plans/EZD-299.md sections 4 and 5; AC-EZD-299-1, -5, -6, -7, -8, -10, -12; Decided D-Fault,
// D-Bench, D-Banner, D-Editor, D-Show; Q-0502, Q-0508, Q-0511, Q-0540, Q-0628 (b), Q-0631 (b)). Untagged = desktop;
// B9 is @ipad. Each test makes its own company with fixture S (P1 "bravo", client "Zed Co"; P2 "Alpha") and an editor
// on the test page /dev/saves/<P1>. Wall numbers are read from the stored target, never assumed.
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  eventsIn,
  expect,
  expectTouchTargets,
  harnessSql,
  readSentryStubOutboxDir,
  readStubOutboxDir,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'] as const;

type Member = Awaited<ReturnType<typeof createMember>>;
type Ids = Awaited<ReturnType<typeof seedFixtureS>>;

async function setup(listedKeys: Array<'P1' | 'P2'> = []) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({
    tenantId: tenant,
    scope: listedKeys.length > 0 ? 'listed' : 'all',
    listed: listedKeys.map((k) => ids[k]),
  });
  await setPermissions(tenant, user.membershipId, [...EDITOR]);
  return { tenant, ids, user };
}

type Hook = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form object data read in the page
  objects(): Array<{ id: string; type: string; schemaVersion: number; data: Record<string, any> }>;
  edit(changes: unknown[]): string[];
};
type PlanHook = {
  handle: {
    getView(): { x: number; y: number; ppi: number };
    setView(v: { x: number; y: number; ppi: number }): void;
    modelToScreen(p: { x: number; y: number }): { x: number; y: number };
  };
};
type Win = { __ezdraftEditor: Hook; __ezdraftPlan: PlanHook };

const tid = (page: Page, id: string): Locator => page.getByTestId(id);
const rowFor = (page: Page, key: string): Locator =>
  page.locator(`[data-testid="conflict-row"][data-conflict-key="${key}"]`);

async function openBench(page: Page, ids: Ids) {
  await page.goto(`/dev/saves/${ids.P1}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
}

async function makeConflict(page: Page) {
  const result = tid(page, 'bench-result');
  await tid(page, 'bench-conflict').click();
  await expect(result).toHaveAttribute('data-phase', 'done', { timeout: 60_000 });
  return result;
}

async function makeFifty(page: Page) {
  const result = tid(page, 'bench-result');
  await tid(page, 'bench-fifty').click();
  await expect(result).toHaveAttribute('data-phase', 'done', { timeout: 60_000 });
}

async function conflictItems(page: Page, member: Member): Promise<Array<Record<string, unknown>>> {
  const res = await page.request.get('/api/sync-conflicts', {
    headers: { 'x-ezdraft-membership': member.membershipId },
  });
  return ((await res.json()) as { items: Array<Record<string, unknown>> }).items;
}

const pollItems = (page: Page, member: Member, n: number) =>
  expect.poll(async () => (await conflictItems(page, member)).length, { timeout: 30_000 }).toBe(n);

async function stored(id: string): Promise<{ height: unknown; number: unknown }> {
  const rows = await harnessSql()<{ data: { attributes: Record<string, unknown> } }[]>`
    select data from public.model_object where object_id = ${id}::uuid`;
  const attributes = rows[0]?.data.attributes ?? {};
  return { height: attributes.height, number: attributes.number };
}

// Plan section 4: "Wall n", or "Wall" when the stored target has no number.
const wallLabel = (n: unknown) => (typeof n === 'number' ? `Wall ${n}` : 'Wall');

async function setHeight(page: Page, id: string, h: number) {
  await page.evaluate(
    ({ id, h }) => {
      const hook = (window as unknown as Win).__ezdraftEditor;
      const o = hook.objects().find((x) => x.id === id);
      if (!o) throw new Error('no object');
      const data = JSON.parse(JSON.stringify(o.data));
      data.attributes.height = h;
      return hook.edit([{ id, value: { type: o.type, schemaVersion: o.schemaVersion, data } }]);
    },
    { id, h },
  );
}

const wallIds = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as unknown as Win).__ezdraftEditor
      .objects()
      .filter((o) => o.type === 'wall')
      .map((o) => o.id)
      .sort(),
  );

const invalidEvents = () =>
  eventsIn(readSentryStubOutboxDir(process.env.SENTRY_STUB_DIR as string)).filter(
    (e) => e.tags?.['ezd.location'] === 'outbox.invalid_object',
  );

const openList = async (page: Page) => {
  await tid(page, 'conflict-review').click();
  await expect(tid(page, 'conflict-panel')).toBeVisible();
};

test.describe('EZD-299 conflict list', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-299 B1 make a conflict: banner, row and chips; other edits still save', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await openBench(page, ids);
    const result = await makeConflict(page);
    await expect(result).toHaveAttribute('data-rows', '1');
    await expect(result).toHaveAttribute('data-objects', '11');
    await expect(result).toHaveAttribute('data-checkpoints', '0');
    const target = (await result.getAttribute('data-target')) as string;
    expect(target).not.toBe('');
    const row = await stored(target);
    expect(row.height).toBe(98);
    const label = wallLabel(row.number);

    await expect(tid(page, 'conflict-banner-title')).toHaveText("Couldn't save 1 change to bravo.");
    await expect(tid(page, 'conflict-banner-saved')).toHaveText('Your other edits are saved.');
    await pollItems(page, user, 1);
    await openList(page);
    const line = rowFor(page, `${ids.P1}/${target}`);
    await expect(line).toBeVisible();
    await expect(line.getByTestId('conflict-row-title')).toHaveText(label);
    await expect(line.getByTestId('conflict-row-detail')).toHaveText('· Height');
    await expect(line.getByTestId('conflict-yours-value')).toHaveText(`8' 1"`);
    await expect(line.getByTestId('conflict-saved-value')).toHaveText(`8' 2"`);
    await expect(line.getByTestId('conflict-show')).toBeVisible();
    await expect(line.getByTestId('conflict-keep-mine')).toBeVisible();
    await expect(line.getByTestId('conflict-keep-theirs')).toBeVisible();

    const other = (await wallIds(page)).find((w) => w !== target) as string;
    await setHeight(page, other, 100);
    await expect.poll(async () => (await stored(other)).height, { timeout: 30_000 }).toBe(100);
    await expect(line).toBeVisible();
  });

  test('EZD-299 B2 the notification opens the list', async ({ page, signInAs }) => {
    test.setTimeout(120_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await openBench(page, ids);
    const result = await makeConflict(page);
    const target = (await result.getAttribute('data-target')) as string;
    const label = wallLabel((await stored(target)).number);
    await pollItems(page, user, 1);

    await page.goto('/');
    await tid(page, 'notification-bell').click();
    await expect(tid(page, 'notification-item')).toHaveCount(1, { timeout: 30_000 });
    await expect(tid(page, 'notification-item-title')).toHaveText(
      `Couldn't save 1 change: ${label}`,
    );
    await expect(tid(page, 'notification-item-project')).toHaveText('bravo · Zed Co');
    await tid(page, 'notification-item').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${ids.P1}\\?conflicts=open$`));
    await expect(tid(page, 'conflict-panel')).toBeVisible();
    await expect(rowFor(page, `${ids.P1}/${target}`)).toBeVisible();
    await expect(tid(page, 'conflict-banner')).toBeVisible();

    await tid(page, 'conflict-close').click();
    await expect(tid(page, 'conflict-panel')).toHaveCount(0);
    await tid(page, 'conflict-review').click();
    await expect(rowFor(page, `${ids.P1}/${target}`)).toBeVisible();

    const mine = () =>
      readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
        (m) => m.to.toLowerCase() === user.email.toLowerCase(),
      );
    await expect.poll(() => mine().length, { timeout: 15_000 }).toBe(1);
    expect(mine()[0].subject).toBe(`Couldn't save 1 change: ${label}`);
  });

  test('EZD-299 B3 an older version of the app keeps the change and Reload sends it', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(150_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await openBench(page, ids);
    await makeFifty(page);
    const objectsPost = '**/api/projects/*/objects';
    await page.route(objectsPost, (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      return route.continue({ headers: { ...request.headers(), 'x-ezdraft-app-build': '0' } });
    });
    const wallId = (await wallIds(page))[0];
    await setHeight(page, wallId, 100);

    await expect(tid(page, 'conflict-banner-title')).toHaveText(
      /Couldn't save 1 change to bravo\./,
      {
        timeout: 60_000,
      },
    );
    await openList(page);
    const outdated = page.locator('[data-testid="conflict-row"][data-reason="outdated"]');
    await expect(outdated).toHaveCount(1);
    await expect(outdated.getByTestId('conflict-why')).toHaveText(
      'This change was made in an older version of EZ Draft. Reload to send it again.',
    );
    await expect(outdated.getByTestId('conflict-reload')).toBeVisible();
    await expect(outdated.getByTestId('conflict-keep-mine')).toHaveCount(0);
    await expect(outdated.getByTestId('conflict-keep-theirs')).toHaveCount(0);
    await expect(outdated.getByTestId('conflict-remove')).toHaveCount(0);
    await expect(tid(page, 'save-failed-banner')).toHaveCount(0);

    await page.unroute(objectsPost);
    await outdated.getByTestId('conflict-reload').click();
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready', {
      timeout: 60_000,
    });
    await expect.poll(async () => (await stored(wallId)).height, { timeout: 60_000 }).toBe(100);
    await expect(tid(page, 'conflict-banner')).toHaveCount(0, { timeout: 30_000 });
  });

  test('EZD-299 B4 a change that fails the schema check can only be shown or removed', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(150_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await openBench(page, ids);
    await makeFifty(page);
    const before = invalidEvents().length;
    const wallId = (await wallIds(page))[0];
    await setHeight(page, wallId, -1);

    await expect(tid(page, 'conflict-banner')).toBeVisible({ timeout: 60_000 });
    await openList(page);
    const line = page.locator('[data-testid="conflict-row"][data-reason="invalid"]');
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('conflict-why')).toHaveText(
      "EZ Draft built this change wrong, so it can't be saved. We've reported the problem.",
    );
    await expect(line.getByTestId('conflict-show')).toBeVisible();
    await expect(line.getByTestId('conflict-remove')).toBeVisible();
    await expect(line.getByTestId('conflict-keep-mine')).toHaveCount(0);
    await expect(line.getByTestId('conflict-keep-theirs')).toHaveCount(0);
    await expect.poll(() => invalidEvents().length, { timeout: 10_000 }).toBeGreaterThan(before);
  });

  test('EZD-299 B5a a removed Edit model right leaves Remove only', async ({ page, signInAs }) => {
    test.setTimeout(150_000);
    const { tenant, ids, user } = await setup();
    await signInAs(user.email);
    await openBench(page, ids);
    await makeFifty(page);
    await setPermissions(tenant, user.membershipId, ['view_projects']);
    const wallId = (await wallIds(page))[0];
    await setHeight(page, wallId, 101);

    await expect(tid(page, 'conflict-banner')).toBeVisible({ timeout: 60_000 });
    await openList(page);
    const line = page.locator('[data-testid="conflict-row"][data-reason="not_editable"]');
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('conflict-why')).toHaveText(
      "You can no longer edit this project's model, so this change can't be saved.",
    );
    await expect(line.getByTestId('conflict-remove')).toBeVisible();
    await expect(line.getByTestId('conflict-keep-mine')).toHaveCount(0);
    await expect(line.getByTestId('conflict-keep-theirs')).toHaveCount(0);

    await line.getByTestId('conflict-remove').click();
    await expect(tid(page, 'conflict-row')).toHaveCount(0);
    await expect(tid(page, 'conflict-banner')).toHaveCount(0);
    await expect.poll(async () => (await conflictItems(page, user)).length).toBe(0);
  });

  test('EZD-299 B5b a deleted project lands in Projects you can no longer open', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(150_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await page.goto(`/dev/saves/${ids.P2}`);
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await makeFifty(page);
    await harnessSql()`delete from public.project where id = ${ids.P2}::uuid`;
    const wallId = (await wallIds(page))[0];
    // The refusal for a missing project is kept on this device only and raises no banner, so wait for the
    // refused save, then for the next conflict-list fetch, before leaving the page.
    const refused = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes(`/api/projects/${ids.P2}/objects`) &&
        r.status() === 404,
      { timeout: 60_000 },
    );
    await setHeight(page, wallId, 101);
    await refused;
    await page.waitForResponse(
      (r) => r.request().method() === 'GET' && r.url().includes('/api/sync-conflicts'),
      { timeout: 60_000 },
    );

    // The deleted project cannot show the list; another project's page does (as in B6).
    await page.goto(`/projects/${ids.P1}?conflicts=open`);
    await expect(tid(page, 'conflict-panel')).toBeVisible();
    const group = page.locator('[data-testid="conflict-group"][data-group="not_open"]');
    await expect(group).toHaveCount(1);
    await expect(group.getByTestId('conflict-group-count')).toHaveText('1');
    await expect(tid(page, 'conflict-panel')).toContainText('Projects you can no longer open');
    const line = page.locator('[data-testid="conflict-row"][data-reason="not_open"]');
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('conflict-why')).toHaveText(
      "You no longer have access to this project, so this change can't be saved.",
    );
    await expect(line.getByTestId('conflict-remove')).toBeVisible();
    await expect(line.getByTestId('conflict-keep-mine')).toHaveCount(0);
    await expect(line.getByTestId('conflict-keep-theirs')).toHaveCount(0);
    await expect(tid(page, 'conflict-panel')).not.toContainText('Alpha');
  });

  test('EZD-299 B6 a project you can no longer open shows no name and no saved value', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(150_000);
    const { ids, user } = await setup(['P1', 'P2']);
    await signInAs(user.email);
    await openBench(page, ids);
    await makeConflict(page);
    await pollItems(page, user, 1);
    await harnessSql()`
      delete from public.membership_project
      where membership_id = ${user.membershipId}::uuid and project_id = ${ids.P1}::uuid`;

    // Removing the membership_project row ends every session of the member (end-sessions trigger), so sign in again.
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P2}?conflicts=open`);
    await expect(tid(page, 'conflict-panel')).toBeVisible();
    const group = page.locator('[data-testid="conflict-group"][data-group="not_open"]');
    await expect(group).toHaveCount(1);
    await expect(group.getByTestId('conflict-group-count')).toHaveText('1');
    await expect(tid(page, 'conflict-panel')).toContainText('Projects you can no longer open');
    const line = page.locator('[data-testid="conflict-row"][data-reason="not_open"]');
    await expect(line.getByTestId('conflict-why')).toHaveText(
      "You no longer have access to this project, so this change can't be saved.",
    );
    await expect(line.getByTestId('conflict-remove')).toBeVisible();
    await expect(line).toHaveCount(1);
    await expect(line.getByTestId('conflict-keep-mine')).toHaveCount(0);
    await expect(line.getByTestId('conflict-keep-theirs')).toHaveCount(0);
    await expect(tid(page, 'conflict-panel')).not.toContainText('bravo');
    const items = await conflictItems(page, user);
    expect(items).toHaveLength(1);
    expect(items[0].reason).toBe('not_open');
    expect(items[0].saved).toBeNull();
    expect(items[0].projectName).toBeNull();
  });

  test('EZD-299 B7 Show brings the object into view and closes the list', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await openBench(page, ids);
    const result = await makeConflict(page);
    const target = (await result.getAttribute('data-target')) as string;
    await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
    await pollItems(page, user, 1);
    await openList(page);
    await page.evaluate(() => {
      const h = (window as unknown as Win).__ezdraftPlan.handle;
      h.setView({ x: 100000, y: 100000, ppi: h.getView().ppi });
    });
    const midpoint = await page.evaluate((id) => {
      const o = (window as unknown as Win).__ezdraftEditor.objects().find((x) => x.id === id);
      if (!o) throw new Error('no target');
      const g = o.data.geometry as {
        start: { x: number; y: number };
        end: { x: number; y: number };
      };
      return { x: (g.start.x + g.end.x) / 2, y: (g.start.y + g.end.y) / 2 };
    }, target);
    const region = page.locator('[data-shell-region="canvas"]');
    const box = await region.boundingBox();
    if (!box) throw new Error('canvas region has no box');
    const screen = () =>
      page.evaluate(
        (p) => (window as unknown as Win).__ezdraftPlan.handle.modelToScreen(p),
        midpoint,
      );
    const inside = (s: { x: number; y: number }) =>
      s.x >= 0 && s.x <= box.width && s.y >= 0 && s.y <= box.height;
    expect(inside(await screen())).toBe(false);

    await rowFor(page, `${ids.P1}/${target}`).getByTestId('conflict-show').click();
    await expect(tid(page, 'conflict-panel')).toHaveCount(0);
    await expect.poll(async () => inside(await screen())).toBe(true);
  });

  test('EZD-299 B8 Keep mine writes the queued value, Keep theirs leaves the saved one', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    const { ids, user } = await setup();
    await signInAs(user.email);
    await openBench(page, ids);
    const result = await makeConflict(page);
    const target = (await result.getAttribute('data-target')) as string;
    await pollItems(page, user, 1);
    await openList(page);
    const line = rowFor(page, `${ids.P1}/${target}`);
    await expect(line).toBeVisible();
    await line.getByTestId('conflict-keep-mine').click();
    await expect(tid(page, 'conflict-empty')).toBeVisible({ timeout: 30_000 });
    await expect(tid(page, 'conflict-banner')).toHaveCount(0);
    await expect.poll(async () => (await stored(target)).height, { timeout: 30_000 }).toBe(97);
    await pollItems(page, user, 0);

    await tid(page, 'bench-conflict').click();
    await pollItems(page, user, 1);
    await expect(line).toBeVisible({ timeout: 60_000 });
    await line.getByTestId('conflict-keep-theirs').click();
    await expect(tid(page, 'conflict-empty')).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await stored(target)).height, { timeout: 30_000 }).toBe(99);
    const hookHeight = await page.evaluate(
      (id) =>
        (window as unknown as Win).__ezdraftEditor.objects().find((o) => o.id === id)?.data
          .attributes.height,
      target,
    );
    expect(hookHeight).toBe(99);
    await expect.poll(async () => (await conflictItems(page, user)).length).toBe(0);
  });

  test(
    'EZD-299 B9 touch targets in the list and the banner @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      test.setTimeout(120_000);
      const { ids, user } = await setup();
      await signInAs(user.email);
      await openBench(page, ids);
      await makeConflict(page);
      await pollItems(page, user, 1);
      await expect(tid(page, 'conflict-banner')).toBeVisible();
      await openList(page);
      await expect(tid(page, 'conflict-row')).toHaveCount(1);
      expect(await expectTouchTargets(page, tid(page, 'conflict-panel'))).toBe(4);
      expect(await expectTouchTargets(page, tid(page, 'conflict-banner'))).toBe(1);
    },
  );
});
