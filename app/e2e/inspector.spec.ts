// EZD-213b B1-B8 (vault/plans/EZD-213b.md section 4; AC-EZD-213-1 to -3, -6, -7, -9, -10, -12, -16, -19, -21, -23; Slice 5
// test script steps 2 and 5). B1-B7 untagged (desktop 1600 x 1000); B8 is @surface. Every test makes its own company
// (never tenant 1) with fixture S (P1 "bravo" starts with the floor "Floor 1") and its own member. Fixture INS is added
// through the `__ezdraftEditor` hook; the canvas is read and driven through `__ezdraftPlan` (helpers copied from
// drawing-tools.spec.ts). No import.meta or __dirname (lesson L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createOpeningData,
  createWallData,
  type Point,
} from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
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
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];
const REFUSED = `Use 12'6", 12' 6 1/2", 150" or 12.5'`;

async function member(tenant: string, permissions: string[]) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return m;
}

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  return { tenant, ids, user: await member(tenant, permissions) };
}

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    handle: { setView(v: View): void; modelToScreen(p: Point): Point };
  };
  __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] };
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const aside = (page: Page) => page.locator('[data-shell-region="inspector"]');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

// view: model (0,0) at region px (128, 384); 8/3 px per inch.
async function view(page: Page) {
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen({ x: 0, y: 0 }),
      ),
    )
    .toEqual({ x: 128, y: 384 });
}

// at(x, y): the page point of a model point (canvas region box + the handle's modelToScreen).
async function at(page: Page, x: number, y: number): Promise<Point> {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  return { x: box.x + s.x, y: box.y + s.y };
}
const clickAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.click(p.x, p.y);
};
const dblclickAt = async (page: Page, x: number, y: number) => {
  const p = await at(page, x, y);
  await page.mouse.dblclick(p.x, p.y);
};
const shiftClickAt = async (page: Page, x: number, y: number) => {
  await page.keyboard.down('Shift');
  try {
    await clickAt(page, x, y);
  } finally {
    await page.keyboard.up('Shift');
  }
};

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const byId = (list: Obj[], oid: string): Obj => {
  const found = list.find((o) => o.id === oid);
  if (!found) throw new Error(`no object ${oid}`);
  return found;
};
const attrs = (o: Obj) =>
  o.data.attributes as Record<string, unknown> & {
    layers: Array<{ material: string; thickness: number }>;
  };
const geometry = (o: Obj) => o.data.geometry as { start: Point; end: Point };

const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

const pt = (x: number, y: number): Point => ({ x, y });

// Click spots (model points; P208a R2 bodies): W1, N1 (window on W1), W2, D1 (door on W2).
const SPOT = { W1: pt(20, -2.25), N1: pt(72, -2.25), W2: pt(10, 93.75), D1: pt(48, 93.75) };

// addIns: fixture INS. W1 (0,0)->(144,0) and W2 (0,96)->(96,96) (height 108), window N1 on W1 at (72,0), door D1 on W2
// at (48,96); one `edit`; returns the ids.
async function addIns(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const m1 = createWallData({ start: pt(0, 0), end: pt(144, 0), level, thicknessSide: 'right' });
  const m2 = createWallData({ start: pt(0, 96), end: pt(96, 96), level, thicknessSide: 'right' });
  if (!m1.ok || !m2.ok) throw new Error('wall data');
  const w2Data = { ...m2.data, attributes: { ...m2.data.attributes, height: 108 } };
  const w1 = crypto.randomUUID();
  const w2 = crypto.randomUUID();
  const n1 = crypto.randomUUID();
  const d1 = crypto.randomUUID();
  const window1 = createOpeningData({
    kind: 'window',
    host: { id: w1, type: 'wall', data: m1.data },
    center: pt(72, 0),
  });
  const door1 = createOpeningData({
    kind: 'door',
    host: { id: w2, type: 'wall', data: w2Data },
    center: pt(48, 96),
  });
  const make = (i: string, type: string, data: unknown) => ({
    id: i,
    value: { type, schemaVersion: CURRENT_SCHEMA_VERSION, data },
  });
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [
      make(w1, 'wall', m1.data),
      make(w2, 'wall', w2Data),
      make(n1, 'opening', window1),
      make(d1, 'opening', door1),
    ],
  );
  return { w1, w2, n1, d1 };
}

test.describe('EZD-213b inspector', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-213b B1 slice 5 step 5: two walls take one thickness and Height reads Mixed', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const ins = await addIns(page);
    await saved(page);
    await view(page);

    await expect(id(page, 'inspector-empty')).toContainText(
      'Select something on the plan to see its details here.',
    );
    await expect(id(page, 'inspector-empty-hint')).toHaveText(
      'Shift-click or drag a box to select more than one.',
    );
    expect((await aside(page).boundingBox())!.width).toBeCloseTo(336, 0);

    await clickAt(page, SPOT.W1.x, SPOT.W1.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'wall');
    await shiftClickAt(page, SPOT.W2.x, SPOT.W2.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'bulk');
    await expect(id(page, 'inspector-title')).toHaveText('2 walls selected');
    await expect(id(page, 'inspector-height')).toHaveValue('');
    await expect(id(page, 'inspector-height')).toHaveAttribute('placeholder', 'Mixed');
    await expect(id(page, 'inspector-length')).toHaveCount(0);

    await id(page, 'inspector-thickness').fill('6 1/2"');
    await id(page, 'inspector-thickness').press('Enter');
    await expect
      .poll(async () => attrs(byId(await objects(page), ins.w1)).thickness)
      .toBeCloseTo(6.5, 9);
    const list = await objects(page);
    for (const wid of [ins.w1, ins.w2]) {
      const a = attrs(byId(list, wid));
      expect(a.thickness, wid).toBeCloseTo(6.5, 9);
      expect(a.layers.find((l) => l.material === 'stud')!.thickness, wid).toBeCloseTo(5.5, 9);
    }
    await expect(id(page, 'inspector-thickness')).toHaveValue('6 1/2"');
    await expect(id(page, 'inspector-height')).toHaveValue('');
    await expect(id(page, 'inspector-height')).toHaveAttribute('placeholder', 'Mixed');
  });

  test('EZD-213b B2 slice 5 step 2: a placed window shows its sill height', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const ins = await addIns(page);
    await view(page);

    await clickAt(page, SPOT.N1.x, SPOT.N1.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-opening-kind', 'window');
    await expect(id(page, 'inspector-sill')).toHaveValue(`3' 0"`);
    await id(page, 'inspector-sill').fill(`3' 6"`);
    await id(page, 'inspector-sill').press('Enter');
    await expect
      .poll(async () => attrs(byId(await objects(page), ins.n1)).sillHeight)
      .toBeCloseTo(42, 9);
    await expect(id(page, 'inspector-sill')).toHaveValue(`3' 6"`);
  });

  test('EZD-213b B3 Bearing set on a wall is still set after a reload', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const ins = await addIns(page);
    await view(page);

    await clickAt(page, SPOT.W1.x, SPOT.W1.y);
    await id(page, 'inspector-bearing').check();
    await expect.poll(async () => attrs(byId(await objects(page), ins.w1)).bearing).toBe(true);
    await saved(page);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);
    await clickAt(page, SPOT.W1.x, SPOT.W1.y);
    await expect(id(page, 'inspector-bearing')).toBeChecked();
    expect(attrs(byId(await objects(page), ins.w1)).bearing).toBe(true);
    await id(page, 'inspector-bearing').uncheck();
    await expect.poll(async () => attrs(byId(await objects(page), ins.w1)).bearing).toBe(false);
  });

  test('EZD-213b B4 a refused length shows the formats message and keeps the field', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const ins = await addIns(page);
    await view(page);

    await clickAt(page, SPOT.W1.x, SPOT.W1.y);
    const length = id(page, 'inspector-length');
    await length.fill('12 ft');
    await length.press('Enter');
    await expect(id(page, 'inspector-length-error')).toHaveText(REFUSED);
    await expect(length).toBeFocused();
    await expect(length).toHaveValue('12 ft');
    expect(geometry(byId(await objects(page), ins.w1)).end).toEqual(pt(144, 0));

    await length.fill(`12' 6"`);
    await length.press('Enter');
    await expect
      .poll(async () => geometry(byId(await objects(page), ins.w1)).end.x)
      .toBeCloseTo(150, 9);
    const g = geometry(byId(await objects(page), ins.w1));
    expect(g.start).toEqual(pt(0, 0));
    expect(g.end.y).toBeCloseTo(0, 9);
    await expect(id(page, 'inspector-length-error')).toHaveCount(0);
    await expect(length).toHaveValue(`12' 6"`);

    await length.fill(`13'`);
    await length.press('Escape');
    await expect(length).toHaveValue(`12' 6"`);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'wall');
  });

  test('EZD-213b B5 Edit layers ends on a second press or a selection change', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    const ins = await addIns(page);
    await view(page);

    await clickAt(page, SPOT.W1.x, SPOT.W1.y);
    const toggle = id(page, 'inspector-edit-layers');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await id(page, 'inspector-layer-0-thickness').fill('5/8"');
    await id(page, 'inspector-layer-0-thickness').press('Enter');
    await expect
      .poll(async () => attrs(byId(await objects(page), ins.w1)).thickness)
      .toBeCloseTo(4.625, 9);
    await expect(id(page, 'inspector-layers-total')).toContainText('4 5/8"');
    await expect(id(page, 'inspector-thickness')).toHaveValue('4 5/8"');

    await id(page, 'inspector-layer-1-material').selectOption('drywall');
    await expect(id(page, 'inspector-layer-1-error')).toHaveText('The wall needs its stud layer');
    await expect(id(page, 'inspector-layer-1-material')).toHaveValue('stud');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(await id(page, 'inspector-layer-0-thickness').evaluate((el) => el.tagName)).toBe('SPAN');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await clickAt(page, SPOT.W2.x, SPOT.W2.y);
    await expect(id(page, 'inspector-edit-layers')).toHaveAttribute('aria-pressed', 'false');
  });

  test('EZD-213b B6 a view-only member reads plain text and cannot edit', async ({
    page,
    signInAs,
  }) => {
    const { tenant, ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addIns(page);
    await saved(page);
    await setPermissions(tenant, user.membershipId, VIEWER as never);
    await page.reload();
    await openReady(page, ids.P1);
    await view(page);

    await clickAt(page, SPOT.W1.x, SPOT.W1.y);
    await expect(id(page, 'inspector-view-only')).toHaveText('View only');
    await expect(id(page, 'inspector-length')).toHaveText(`12' 0"`);
    await expect(page.locator('[data-testid="inspector"] :is(input, select, button)')).toHaveCount(
      0,
    );
  });

  test('EZD-213b B7 two slow clicks cycle; a double-click on a wall focuses Length', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addIns(page);
    await view(page);

    await clickAt(page, SPOT.N1.x, SPOT.N1.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'opening');
    await clickAt(page, SPOT.N1.x, SPOT.N1.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'wall');

    await dblclickAt(page, SPOT.W1.x, SPOT.W1.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'wall');
    await expect(id(page, 'inspector-length')).toBeFocused();

    await dblclickAt(page, SPOT.N1.x, SPOT.N1.y);
    await expect(id(page, 'inspector')).toHaveAttribute('data-inspector-kind', 'opening');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  });

  test(
    'EZD-213b B8 tablet hint and 44 px controls',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const { ids, user } = await fixtureS();
      await signInAs(user.email);
      await openReady(page, ids.P1);
      await addIns(page);
      await view(page);

      await expect(id(page, 'inspector-empty-hint')).toHaveText(
        'Tap Select more, or drag a box, to select more than one.',
      );
      const inspector = id(page, 'inspector');
      await clickAt(page, SPOT.W1.x, SPOT.W1.y);
      expect(await expectTouchTargets(page, inspector)).toBeGreaterThan(0);
      await id(page, 'inspector-edit-layers').click();
      expect(await expectTouchTargets(page, inspector)).toBeGreaterThan(0);
      await clickAt(page, SPOT.N1.x, SPOT.N1.y);
      await id(page, 'inspector-impact-shutter').click();
      expect(await expectTouchTargets(page, inspector)).toBeGreaterThan(0);
      await clickAt(page, SPOT.D1.x, SPOT.D1.y);
      expect(await expectTouchTargets(page, inspector)).toBeGreaterThan(0);
    },
  );
});
