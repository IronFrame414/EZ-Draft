// EZD-5604b B1-B4 (vault/plans/EZD-5604b.md section 4; AC-EZD-5604-3, -4, -7, -8, -9; AC-EZD-5603-10 via Q-0651 (a)).
// B1-B3 are untagged (desktop 1600 x 1000); B4 is @ipad. Every test makes its own company (never tenant 1) with
// fixture S and its own member, as EZD-5603a's assistant-panel.spec.ts. Replies come through page.route, so no
// spec writes AI_STUB_DIR. Colours are compared against a probe element with the same var(--ez-*) declaration
// (shell-header.spec.ts). No import.meta or __dirname (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const ASSISTANT_ROUTE = '**/api/projects/*/assistant';
const STALE = "The drawing changed after this preview was made, so it can't be accepted.";

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

async function probe(page: Page, css: string): Promise<string> {
  return page.evaluate((style) => {
    const el = document.createElement('div');
    el.setAttribute('style', style);
    document.body.appendChild(el);
    const color = getComputedStyle(el).color;
    el.remove();
    return color;
  }, css);
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
    data: { key: 'sk-ant-api03-EZD5604B' + randomUUID().replaceAll('-', '') },
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
  return { walls, requests: () => requests };
}

test.describe('EZD-5604b assistant preview', () => {
  test.use({ serviceWorkers: 'block' });

  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-5604b B1 an added door shows blue with its chip and the legend; nothing is saved; Reject clears it', async ({
    page,
    signInAs,
  }) => {
    await ready(page, signInAs, DOOR);
    const legend = id(page, 'preview-legend');
    await expect(legend).toContainText('Preview');
    await expect(legend).toContainText('blue is added');
    await expect(legend).toContainText('red dashed is removed');
    await expect(id(page, 'preview-add-fill')).toHaveAttribute('d', /^M /);
    await expect(id(page, 'preview-add-leaf')).toHaveAttribute('d', /^M /);
    const stroke = await id(page, 'preview-add').evaluate((el) => getComputedStyle(el).stroke);
    expect(stroke).toBe(await probe(page, 'color: var(--ez-cobalt)'));
    await expect(id(page, 'preview-chip')).toHaveCount(1);
    await expect(id(page, 'preview-chip')).toHaveText('Door 1 · 3\' 0"');
    // EZD-5605 passes the Accept and Adjust handlers.
    await expect(id(page, 'assistant-accept')).toBeEnabled();
    await expect(id(page, 'assistant-adjust')).toBeEnabled();
    await expect(id(page, 'assistant-reject')).toBeEnabled();
    await expect(id(page, 'assistant-prompt')).toBeDisabled();
    let objs = await objects(page);
    expect(objs).toHaveLength(3);
    expect(objs.some((o) => o.type === 'opening')).toBe(false);

    await id(page, 'assistant-reject').click();
    await expect(id(page, 'preview-layer')).toHaveCount(0);
    await expect(id(page, 'assistant-prompt')).toBeEnabled();
    objs = await objects(page);
    expect(objs).toHaveLength(3);
  });

  test('EZD-5604b B2 an edit to a touched wall makes the preview stale; its button puts the prompt back unsent', async ({
    page,
    signInAs,
  }) => {
    const { walls, requests } = await ready(page, signInAs, DOOR);
    await expect(id(page, 'preview-layer')).toHaveCount(1);
    await page.evaluate(
      ({ wallId, schemaVersion }) => {
        const editor = (window as unknown as Window2).__ezdraftEditor;
        const wall = editor.objects().find((o) => o.id === wallId)!;
        const data = wall.data as { attributes: Record<string, unknown> };
        editor.edit([
          {
            id: wallId,
            value: {
              type: 'wall',
              schemaVersion,
              data: { ...data, attributes: { ...data.attributes, height: 100 } },
            },
          },
        ]);
      },
      { wallId: walls.w1, schemaVersion: CURRENT_SCHEMA_VERSION },
    );
    await expect(id(page, 'assistant-preview-stale')).toContainText(STALE);
    await expect(id(page, 'assistant-accept')).toHaveCount(0);
    await expect(id(page, 'preview-layer')).toHaveCount(0);
    await id(page, 'assistant-stale-action').click();
    await expect(id(page, 'assistant-prompt')).toHaveValue('add a door');
    await expect(id(page, 'assistant-prompt')).toBeEnabled();
    expect(requests()).toBe(1);
  });

  test('EZD-5604b B3 a removed wall shows red dashed and stays in the drawing', async ({
    page,
    signInAs,
  }) => {
    const { walls } = await ready(page, signInAs, (ids) => ({
      changes: [{ op: 'remove', type: 'wall', ref: 'w2' }],
      refs: { f1: ids.floor, w2: ids.w2 },
    }));
    await expect(id(page, 'preview-remove')).toHaveAttribute('d', /^M /);
    await expect(id(page, 'preview-add')).toHaveAttribute('d', '');
    const remove = id(page, 'preview-remove');
    const stroke = await remove.evaluate((el) => getComputedStyle(el).stroke);
    expect(stroke).toBe(await probe(page, 'color: var(--ez-preview-remove)'));
    const dash = await remove.evaluate((el) => getComputedStyle(el).strokeDasharray);
    expect(
      dash
        .replaceAll('px', '')
        .split(/[\s,]+/)
        .filter((s) => s.length > 0),
    ).toEqual(['6', '4']);
    await expect(id(page, 'preview-chip')).toHaveCount(0);
    expect((await objects(page)).some((o) => o.id === walls.w2)).toBe(true);
  });

  test(
    'EZD-5604b B4 the preview buttons are touch targets',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      await ready(page, signInAs, DOOR);
      await expect(id(page, 'assistant-preview-actions')).toBeVisible();
      expect(await expectTouchTargets(page, id(page, 'assistant-preview-actions'))).toBe(3);
    },
  );
});
