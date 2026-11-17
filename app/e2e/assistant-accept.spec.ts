// EZD-5605 B1-B3 (vault/plans/EZD-5605.md section 4 T22; Josh's test script steps 2-3; AC-EZD-5605-1, -3, -4, -7,
// -8). Desktop 1600 x 1000. Each test makes its own company (never tenant 1) with fixture S and its own member; the
// Assistant reply comes through page.route (no AI_STUB_DIR, no live service), as EZD-5604b's assistant-preview.spec.ts
// whose setup this copies. The saved drawing is read back from GET /api/projects/<id>/model. No import.meta or
// __dirname (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const ASSISTANT_ROUTE = '**/api/projects/*/assistant';

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);

async function fixtureS() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, EDITOR as never);
  return { ids, user };
}

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());

// Walls (0,0)->(144,0) and (144,0)->(144,120) through the editor hook; returns the floor and the two wall ids.
async function addWalls(page: Page) {
  const floor = (await objects(page)).find((o) => o.type === 'floor');
  if (!floor) throw new Error('no floor');
  const pts: Point[] = [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
  ];
  const changes = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({
      start: pts[i]!,
      end: pts[i + 1]!,
      level: floor.id,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    changes.push({
      id: randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
  return { floor: floor.id, w1: changes[0]!.id, w2: changes[1]!.id };
}

type Ids = Awaited<ReturnType<typeof addWalls>>;
const DOOR = (ids: Ids) => ({
  changes: [
    { op: 'add', type: 'door', ref: 'n1', hostWall: 'w1', center: { x: 72, y: 0 }, width: 36 },
  ],
  refs: { f1: ids.floor, w1: ids.w1 },
});

async function ready(
  page: Page,
  signInAs: (email: string) => Promise<unknown>,
  reply: (ids: Ids) => { changes: unknown[]; refs: Record<string, string> },
) {
  const { ids, user } = await fixtureS();
  await signInAs(user.email);
  const key = await page.request.post('/api/profile/ai-key', {
    headers: appOriginHeaders(),
    data: { key: 'sk-ant-api03-EZD5605A' + randomUUID().replaceAll('-', '') },
  });
  expect(key.ok()).toBe(true);
  await page.goto(`/projects/${ids.P1}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  const walls = await addWalls(page);
  await expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
  let requests = 0;
  await page.route(ASSISTANT_ROUTE, (r) => {
    requests += 1;
    return r.fulfill({
      status: 200,
      json: { message: 'Here is a door.', costMicroUsd: 20000, model: 'sonnet', ...reply(walls) },
    });
  });
  await tool(page, 'assistant').click();
  await expect(id(page, 'assistant-prompt')).toBeEnabled();
  await id(page, 'assistant-prompt').fill('add a door');
  await id(page, 'assistant-send').click();
  await expect(id(page, 'assistant-reply-text')).toHaveText('Here is a door.');
  return { walls, requests: () => requests, project: ids.P1 };
}

const HINT = 'Adjust: edit the preview by hand, then Accept. Accepted changes can be undone.';

// The server's saved openings (GET /api/projects/<id>/model).
async function savedOpenings(page: Page, project: string): Promise<number> {
  const res = await page.request.get(`/api/projects/${project}/model`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { objects: { type: string }[] };
  return body.objects.filter((o) => o.type === 'opening').length;
}

test.describe('EZD-5605 assistant Accept, Adjust, Reject', () => {
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-5605 B1 Accept saves the door in one step; one Undo takes it back', async ({
    page,
    signInAs,
  }) => {
    const { project } = await ready(page, signInAs, DOOR);
    await expect(id(page, 'assistant-preview-hint')).toHaveText(HINT);
    expect(await savedOpenings(page, project)).toBe(0);
    await expect(id(page, 'assistant-accept')).toBeEnabled();
    await id(page, 'assistant-accept').click();

    await expect(id(page, 'preview-layer')).toHaveCount(0);
    await expect(id(page, 'assistant-prompt')).toBeEnabled();
    await expect.poll(() => savedOpenings(page, project), { timeout: 15_000 }).toBe(1);
    const door = (await objects(page)).find((o) => o.type === 'opening');
    expect(door).toBeDefined();
    expect((door!.data as { attributes: { number: number } }).attributes.number).toBe(1);

    await page.keyboard.press('ControlOrMeta+z');
    expect((await objects(page)).some((o) => o.type === 'opening')).toBe(false);
    await expect.poll(() => savedOpenings(page, project), { timeout: 15_000 }).toBe(0);
  });

  test('EZD-5605 B2 Reject leaves the drawing and the undo stack as they were', async ({
    page,
    signInAs,
  }) => {
    const { project } = await ready(page, signInAs, DOOR);
    const before = await objects(page);
    await id(page, 'assistant-reject').click();
    await expect(id(page, 'preview-layer')).toHaveCount(0);
    expect(await objects(page)).toEqual(before);
    expect(await savedOpenings(page, project)).toBe(0);
    // The undo stack still ends with the hand-drawn walls: one Undo removes them, not a door.
    await page.keyboard.press('ControlOrMeta+z');
    expect((await objects(page)).filter((o) => o.type === 'wall')).toHaveLength(0);
  });

  test('EZD-5605 B3 Adjust: the rail is off but Select, the panel stays, and Accept saves the adjusted change', async ({
    page,
    signInAs,
  }) => {
    const { project } = await ready(page, signInAs, DOOR);
    await id(page, 'assistant-adjust').click();
    await expect(id(page, 'assistant-adjust')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'assistant-adjust')).toBeDisabled();
    await expect(tool(page, 'select')).toBeEnabled();
    await expect(tool(page, 'wall')).toBeDisabled();
    await expect(tool(page, 'move')).toBeDisabled();
    await expect(tool(page, 'assistant')).toBeDisabled();
    await expect(id(page, 'assistant-prompt')).toBeVisible();
    await page.keyboard.press('w');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    // Undo during Adjust acts on the preview, never on the hand-drawn walls in the model.
    await page.keyboard.press('ControlOrMeta+z');
    expect((await objects(page)).filter((o) => o.type === 'wall')).toHaveLength(2);
    // Nothing is in the model until Accept.
    expect((await objects(page)).some((o) => o.type === 'opening')).toBe(false);

    await id(page, 'assistant-accept').click();
    await expect(id(page, 'preview-layer')).toHaveCount(0);
    await expect(tool(page, 'wall')).toBeEnabled();
    await expect.poll(() => savedOpenings(page, project), { timeout: 15_000 }).toBe(1);
  });
});
