// EZD-229 B1, B2 (AC-EZD-229-1, -2, -3, -5; Q-0704 03-data-model row 2, 05-screens "Room photos come with EZD-229, in
// the Rooms tab"; 09q Floor level, Transitions row 1). Local stack, real sign-in (as pins.spec.ts and
// left-panel.spec.ts). B1: a supply register and an attic access placed from the Fixtures panel are hvac and access
// objects, status Existing, and survive a reload. B2: two open-plan rooms; Kitchen's floor level set to 3/4" lists a
// 3/4" transition to Family in the Rooms tab; a PNG attaches as a room photo with its thumbnail; a text file is
// refused; level and photo survive a reload.
import { CURRENT_SCHEMA_VERSION, newRoomAttributes, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
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

type View = { x: number; y: number; ppi: number };
type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftPlan: { handle: { setView(v: View): void; modelToScreen(p: Point): Point } };
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
};

// A 1 x 1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const canvasRegion = (page: Page) => page.locator('[data-shell-region="canvas"]');
const saved = (page: Page) =>
  expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });
const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());

async function editor() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
  return { ids, user };
}

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await page.evaluate(() =>
    (window as unknown as Window2).__ezdraftPlan.handle.setView({ x: -48, y: 144, ppi: 8 / 3 }),
  );
}

async function clickAt(page: Page, x: number, y: number) {
  const box = await canvasRegion(page).boundingBox();
  if (!box) throw new Error('canvas region has no box');
  const s = await page.evaluate(
    (p) => (window as unknown as Window2).__ezdraftPlan.handle.modelToScreen(p),
    { x, y },
  );
  await page.mouse.click(box.x + s.x, box.y + s.y);
}

const ofType = async (page: Page, type: string) =>
  (await objects(page)).filter((o) => o.type === type);

test.describe('EZD-229 existing-condition details', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-229 B1 a supply register and an attic access place and persist as Existing', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await editor();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    await page.keyboard.press('f');
    await expect(id(page, 'details-section')).toBeVisible();
    await id(page, 'detail-kind-supply').click();
    await clickAt(page, 150, 60);
    await expect.poll(async () => (await ofType(page, 'hvac')).length).toBe(1);
    await id(page, 'detail-kind-attic_hatch').click();
    await clickAt(page, 210, 60);
    await expect.poll(async () => (await ofType(page, 'access')).length).toBe(1);
    await page.keyboard.press('Escape');
    await saved(page);

    await page.reload();
    await openReady(page, ids.P1);
    const [hvac] = await ofType(page, 'hvac');
    const [access] = await ofType(page, 'access');
    expect(hvac!.data).toMatchObject({
      geometry: { center: { x: 150, y: 60 } },
      status: 'existing',
      attributes: { kind: 'supply' },
    });
    expect(access!.data).toMatchObject({
      geometry: { center: { x: 210, y: 60 } },
      status: 'existing',
      attributes: { kind: 'attic_hatch' },
    });
  });

  test('EZD-229 B2 a 3/4" floor-level step lists a transition; a room photo attaches and persists', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await editor();
    await signInAs(user.email);
    await openReady(page, ids.P1);

    // Two open-plan rooms sharing the edge x = 144, no wall between them.
    const level = (await objects(page)).find((o) => o.type === 'floor')!.id;
    const room = (name: string, x: number) => ({
      id: crypto.randomUUID(),
      value: {
        type: 'room',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: {
            boundary: [
              { x, y: 0 },
              { x: x + 144, y: 0 },
              { x: x + 144, y: 120 },
              { x, y: 120 },
            ],
          },
          status: 'existing',
          level,
          attributes: newRoomAttributes(name),
          closureOverride: null,
        },
      },
    });
    const kitchen = room('Kitchen', 0);
    const family = room('Family', 144);
    await page.evaluate(
      (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
      [kitchen, family],
    );
    await saved(page);

    await id(page, 'left-panel-tab-rooms').click();
    await id(page, 'room-row').filter({ hasText: 'Kitchen' }).click();
    await expect(id(page, 'room-fields')).toHaveAttribute('data-room-id', kitchen.id);
    await expect(id(page, 'room-transition-none')).toHaveText('None');
    await id(page, 'room-floor-level').fill('3/4"');
    await id(page, 'room-floor-level').press('Enter');
    await expect(id(page, 'room-transition')).toHaveText(['To Family · 3/4" step']);

    await id(page, 'room-photo-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a photo'),
    });
    await expect(id(page, 'room-photo-refused')).toHaveText('Choose a JPEG, PNG or HEIC photo.');
    await id(page, 'room-photo-input').setInputFiles({
      name: 'kitchen.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    const photos = async () =>
      ((await objects(page)).find((o) => o.id === kitchen.id)!.data.attributes as {
        photos: string[];
      }).photos;
    await expect.poll(async () => (await photos()).length).toBe(1);
    const [photo] = await photos();
    const thumb = id(page, 'room-photo-thumb');
    await expect(thumb).toBeVisible();
    expect(await thumb.getAttribute('src')).toContain(photo!);
    await saved(page);

    await page.reload();
    await openReady(page, ids.P1);
    const after = (await objects(page)).find((o) => o.id === kitchen.id)!;
    expect(after.data.attributes).toMatchObject({ floorLevel: 0.75, photos: [photo] });
    await id(page, 'left-panel-tab-rooms').click();
    await id(page, 'room-row').filter({ hasText: 'Kitchen' }).click();
    await expect(id(page, 'room-floor-level')).toHaveValue('3/4"');
    await expect(id(page, 'room-transition')).toHaveText(['To Family · 3/4" step']);
    await expect(id(page, 'room-photo-thumb')).toBeVisible();
  });
});
