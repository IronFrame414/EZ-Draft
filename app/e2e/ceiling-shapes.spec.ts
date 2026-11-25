// EZD-513 (AC-EZD-513-1 "A tag reads its text from the ceiling data and updates with it"; AC-EZD-513-2 "A soffit, a
// tray, a coffer and crown each draw with edge dimensions and persist"; S05 Controls "Soffit, tray, coffer | Ceiling
// rail | Draws a soffit, tray, coffer or crown; edges get dimensions.", "Height and material tag | Ceiling rail | Click
// an area to place a tag ... Tag reads from the ceiling data."; board S05Ceiling tag "CLG 8' 0" · ..."; Q-0704 soffit
// dropHeight; vault/build/assumptions.md EZD-513). Desktop 1600 x 1000, untagged. The test makes its own company with
// fixture S and its own member; the 144" x 120" room has four Existing walls at the 96" default height, so its ceiling
// is 8' 0". The model and the drawn texts are read through the `__ezdraftEditor` and `__ezdraftPlan` test hooks. No
// import.meta or __dirname (L-017).
import {
  CURRENT_SCHEMA_VERSION,
  createWallData,
  newRoomAttributes,
  type Point,
} from '@ezdraft/geometry';
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

type Rgb = { r: number; g: number; b: number };
type Drawn = { surface: string; batches: Array<{ key: string; color: Rgb; order: number }> };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: {
    drawn(): Drawn;
    drawnTexts(): Array<{ objectId: string; text: string }>;
    handle: { modelToScreen(p: Point): Point };
  };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
};

async function fixtureS(permissions: string[]) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, permissions as never);
  return { ids, user };
}

const id = (page: Page, testId: string) => page.getByTestId(testId);
const drawn = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftPlan.drawn());
const objects = (page: Page) =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

async function clickModel(page: Page, p: Point) {
  const box = await page.locator('[data-shell-region="canvas"]').boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (q) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(q),
    p,
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

// A closed 144 x 120 room with its four Existing walls, in one edit (as ceiling-rcp.spec.ts). Returns the room id.
async function seedRoom(page: Page): Promise<string> {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const ring: Point[] = [
    { x: 0, y: 0 },
    { x: 144, y: 0 },
    { x: 144, y: 120 },
    { x: 0, y: 120 },
  ];
  const walls = ring.map((start, i) => {
    const made = createWallData({
      start,
      end: ring[(i + 1) % 4]!,
      level,
      thicknessSide: 'right',
      status: 'existing',
    });
    if (!made.ok) throw new Error('wall data');
    return {
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    };
  });
  const roomId = crypto.randomUUID();
  const room = {
    id: roomId,
    value: {
      type: 'room',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: {
        geometry: { boundary: ring },
        status: 'existing',
        level,
        attributes: newRoomAttributes('Family room'),
        closureOverride: null,
      },
    },
  };
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [...walls, room],
  );
  return roomId;
}

const rail = (page: Page) => page.locator('[data-shell-region="rail"]');
const tool = (page: Page, t: string) => rail(page).locator(`[data-rail-tool="${t}"]`);
const textsOf = (page: Page, objectId: string) =>
  page.evaluate(
    (oid) =>
      (window as unknown as Window2).__ezdraftPlan
        .drawnTexts()
        .filter((t) => t.objectId.toLowerCase() === oid.toLowerCase())
        .map((t) => t.text)
        .sort(),
    objectId,
  );
const ofTypes = async (page: Page) =>
  (await objects(page)).filter((o) => o.type === 'soffit' || o.type === 'ceiling_shape');

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
// Four small outlines, one per kind, in the lower left of the room (the view's zoom moves as they are added), each
// with its own edge lengths: 2' 0" x 2' 0", 2' 6" x 2' 0", 2' 0" x 1' 6", 2' 6" x 1' 6".
const DRAWN: Array<{ kind: string; outline: Point[]; edges: string[] }> = [
  { kind: 'soffit', outline: rect(6, 6, 30, 30), edges: [`2' 0"`, `2' 0"`, `2' 0"`, `2' 0"`] },
  { kind: 'tray', outline: rect(36, 6, 66, 30), edges: [`2' 0"`, `2' 0"`, `2' 6"`, `2' 6"`] },
  { kind: 'coffer', outline: rect(6, 36, 30, 54), edges: [`1' 6"`, `1' 6"`, `2' 0"`, `2' 0"`] },
  { kind: 'crown', outline: rect(36, 36, 66, 54), edges: [`1' 6"`, `1' 6"`, `2' 6"`, `2' 6"`] },
];

test.describe('EZD-513 Soffits, trays, coffers, crown, tags', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-513-1, -2: each kind draws with edge dimensions and persists; a tag reads the ceiling data', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS(['view_projects', 'edit_model']);
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await seedRoom(page);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');

    // Soffit, tray, coffer: the card picks the kind; each outline closes on its first corner.
    await tool(page, 'soffit').click();
    await expect(tool(page, 'soffit')).toHaveAttribute('aria-pressed', 'true');
    await expect(id(page, 'ceiling-shape-chooser')).toBeVisible();
    await expect(id(page, 'ceiling-shape-size')).toHaveValue(`1' 0"`);
    for (const { kind, outline } of DRAWN) {
      await id(page, `ceiling-shape-${kind}`).click();
      await expect(id(page, `ceiling-shape-${kind}`)).toHaveAttribute('aria-pressed', 'true');
      for (const p of outline) await clickModel(page, p);
      const before = (await ofTypes(page)).length;
      await clickModel(page, outline[0]!);
      await expect.poll(async () => (await ofTypes(page)).length).toBe(before + 1);
    }
    const made = await ofTypes(page);
    expect(
      made
        .map((o) => (o.type === 'soffit' ? 'soffit' : (o.data.attributes as { kind: string }).kind))
        .sort(),
    ).toEqual(['coffer', 'crown', 'soffit', 'tray']);
    const idOf = (kind: string) =>
      made.find((o) =>
        kind === 'soffit'
          ? o.type === 'soffit'
          : (o.data.attributes as { kind?: string }).kind === kind,
      )!.id;
    for (const { kind, edges } of DRAWN)
      await expect.poll(() => textsOf(page, idOf(kind))).toEqual(edges);

    // Height and material tag: a click inside the soffit reads the room's 8' 0" less the 12" drop.
    await tool(page, 'tag').click();
    await expect(id(page, 'ceiling-shape-chooser')).toHaveCount(0);
    await clickModel(page, { x: 18, y: 18 });
    await expect
      .poll(async () => (await objects(page)).filter((o) => o.type === 'ceiling_tag').length)
      .toBe(1);
    const tagId = (await objects(page)).find((o) => o.type === 'ceiling_tag')!.id;
    await expect.poll(() => textsOf(page, tagId)).toEqual([`CLG 7' 0" · drywall`]);

    // The soffit's drop changes to 18": the tag follows, with no edit to the tag.
    const soffit = made.find((o) => o.type === 'soffit')!;
    await page.evaluate(
      (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
      [
        {
          id: soffit.id,
          value: {
            type: 'soffit',
            schemaVersion: CURRENT_SCHEMA_VERSION,
            data: { ...soffit.data, attributes: { dropHeight: 18 } },
          },
        },
      ],
    );
    await expect.poll(() => textsOf(page, tagId)).toEqual([`CLG 6' 6" · drywall`]);

    // Persist: after the save, a reload brings every outline and the tag back and draws them again.
    await saved(page);
    await page.reload();
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await expect.poll(async () => (await ofTypes(page)).length).toBe(4);
    await id(page, 'surface-ceiling').click();
    await expect.poll(async () => (await drawn(page)).surface).toBe('ceiling');
    for (const { kind, edges } of DRAWN)
      await expect.poll(() => textsOf(page, idOf(kind))).toEqual(edges);
    await expect.poll(() => textsOf(page, tagId)).toEqual([`CLG 6' 6" · drywall`]);
  });
});
