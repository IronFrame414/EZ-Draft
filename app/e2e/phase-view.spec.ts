// EZD-214 (AC-EZD-214-1 to -7, -9; S03 Controls — status bar "View"; S03 Decisions; 09m Phase switch rows 1-7;
// Q-0664; Q-0667; Q-0671 (a)). Desktop 1600 x 1000, untagged. Every test makes its own company (never tenant 1) with
// fixture S and its own member, as status-bar.spec.ts. The canvas is read and driven through the `__ezdraftPlan` and
// `__ezdraftEditor` test hooks. No import.meta or __dirname (L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  type ObjectStatus,
  type Point,
} from '@ezdraft/geometry';
import type { Locator, Page, Request } from '@playwright/test';
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
const VIEWER = ['view_projects'];

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { ids, user };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Eyes = Record<ObjectStatus, boolean>;
type Window2 = {
  __ezdraftPlan: {
    handle: {
      setView(v: View): void;
      modelToScreen(p: Point): Point;
      wallAt(screen: Point): string | null;
    };
    phase: {
      get(): { view: string; eyes: Eyes };
      setEye(status: ObjectStatus, on: boolean): void;
    };
  };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const viewButton = (page: Page, v: 'existing' | 'proposed') =>
  id(page, 'status-phase').locator(`button[data-value="${v}"]`);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
}

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const statusOf = async (page: Page, oid: string) =>
  ((await objects(page)).find((o) => o.id === oid)?.data as { status?: string } | undefined)
    ?.status;
const eyes = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.phase.get().eyes);

// The wall the canvas finds at a model point (hover index), or null when nothing is drawn there.
const wallAt = (page: Page, p: Point) =>
  page.evaluate((q) => {
    const h = (window as unknown as Window2).__ezdraftPlan.handle;
    return h.wallAt(h.modelToScreen(q));
  }, p);

async function clickAt(page: Page, x: number, y: number) {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

// Walls (0,y)->(144,y), side right (body below the line), each with its status; one edit. Returns the ids in order.
async function seedWalls(page: Page, walls: Array<{ y: number; status: ObjectStatus }>) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const changes = walls.map((w) => {
    const made = createWallData({
      start: { x: 0, y: w.y },
      end: { x: 144, y: w.y },
      level,
      thicknessSide: 'right',
      status: w.status,
    });
    if (!made.ok) throw new Error('wall data');
    return {
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    };
  });
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return changes.map((c) => c.id);
}

// The point inside a seeded wall's body.
const body = (y: number): Point => ({ x: 72, y: y - 2.25 });

function phaseRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/phase-default')) seen.push(r);
  });
  return seen;
}

test.describe('EZD-214 status and phase switch', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-214 B1 the View switch hides New or Demo, resets the eyes and is kept for the project', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    // 09m row 7: a new project opens in Existing.
    await expect(id(page, 'status-phase')).toHaveAttribute('aria-label', 'Phase view');
    await expect(viewButton(page, 'existing')).toHaveAttribute('aria-pressed', 'true');
    await expect(viewButton(page, 'proposed')).toHaveAttribute('aria-pressed', 'false');
    expect(await eyes(page)).toEqual({ existing: true, demo: true, new: false });

    const [a, b, c] = await seedWalls(page, [
      { y: 0, status: 'existing' },
      { y: 48, status: 'new' },
      { y: 96, status: 'demo' },
    ]);
    // 09m rows 1, 2, 4 in Existing.
    await expect.poll(() => wallAt(page, body(0))).toBe(a);
    expect(await wallAt(page, body(48))).toBeNull();
    expect(await wallAt(page, body(96))).toBe(c);

    const answer = page.waitForResponse(
      (r) => r.url().includes('/phase-default') && r.request().method() === 'PUT',
    );
    await viewButton(page, 'proposed').click();
    const res = await answer;
    expect(res.status()).toBe(200);
    expect(res.request().postData()).toBe('{"phase":"proposed"}');
    await expect(viewButton(page, 'proposed')).toHaveAttribute('aria-pressed', 'true');
    expect(await eyes(page)).toEqual({ existing: true, demo: false, new: true });
    expect(await wallAt(page, body(0))).toBe(a);
    expect(await wallAt(page, body(48))).toBe(b);
    expect(await wallAt(page, body(96))).toBeNull();

    // 09m row 6: the Demo eye overrides the view until the next switch, which resets the eyes (Q-0667).
    await page.evaluate(() =>
      (window as unknown as Window2).__ezdraftPlan.phase.setEye('demo', true),
    );
    expect(await wallAt(page, body(96))).toBe(c);
    await viewButton(page, 'existing').click();
    expect(await eyes(page)).toEqual({ existing: true, demo: true, new: false });
    expect(await wallAt(page, body(48))).toBeNull();
    await viewButton(page, 'proposed').click();
    expect(await wallAt(page, body(96))).toBeNull();

    // AC-1: a wall drawn in Proposed is New.
    await page.keyboard.press('w');
    await clickAt(page, 0, 144);
    await clickAt(page, 96, 144);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect
      .poll(async () => (await objects(page)).filter((o) => o.type === 'wall').length)
      .toBe(4);
    const drawn = (await objects(page)).find(
      (o) => o.type === 'wall' && ![a, b, c].includes(o.id),
    )!;
    expect((drawn.data as { status: string }).status).toBe('new');
    await saved(page);

    // The View is kept on the project (phase_default) and survives a reload; the eyes start from it.
    await page.reload();
    await openReady(page, ids.P1);
    await expect(viewButton(page, 'proposed')).toHaveAttribute('aria-pressed', 'true');
    expect(await eyes(page)).toEqual({ existing: true, demo: false, new: true });
    await expect.poll(() => wallAt(page, body(48))).toBe(b);
    expect(await statusOf(page, drawn.id)).toBe('new');
  });

  test('EZD-214 B2 Status set in the inspector is saved and survives a reload', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const [a] = await seedWalls(page, [{ y: 0, status: 'existing' }]);
    await expect.poll(() => wallAt(page, body(0))).toBe(a);

    await clickAt(page, body(0).x, body(0).y);
    const select = id(page, 'inspector-status');
    await expect(select).toHaveValue('existing');
    await select.selectOption('demo');
    await expect.poll(() => statusOf(page, a)).toBe('demo');
    await expect(id(page, 'inspector-status-dot')).toHaveAttribute('data-status', 'demo');
    await saved(page);

    await page.reload();
    await openReady(page, ids.P1);
    expect(await statusOf(page, a)).toBe('demo');
    // 09m row 4: Demo is shown in Existing and hidden in Proposed.
    await expect.poll(() => wallAt(page, body(0))).toBe(a);
    await viewButton(page, 'proposed').click();
    expect(await wallAt(page, body(0))).toBeNull();
  });

  test('EZD-214 B3 a view-only user switches the display and nothing is saved', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(VIEWER);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const requests = phaseRequests(page);
    await expect(viewButton(page, 'existing')).toHaveAttribute('aria-pressed', 'true');
    await viewButton(page, 'proposed').click();
    await expect(viewButton(page, 'proposed')).toHaveAttribute('aria-pressed', 'true');
    expect(await eyes(page)).toEqual({ existing: true, demo: false, new: true });
    expect(requests).toHaveLength(0);

    await page.reload();
    await openReady(page, ids.P1);
    await expect(viewButton(page, 'existing')).toHaveAttribute('aria-pressed', 'true');
    expect(requests).toHaveLength(0);
  });
});
