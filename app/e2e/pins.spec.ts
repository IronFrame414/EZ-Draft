// EZD-220 B1 (AC-EZD-220-1, -2, -5; 03f:16; W3; Q-0704 05-screens "Pins draw in the Existing view only"; Q-0704
// 03-data-model "Downloads are signed from the row's own storage_path"). Local stack, real sign-in (as
// fixtures-tool.spec.ts). A moisture pin placed from the Fixtures panel is Existing; a PNG attaches as its photo and
// its thumbnail loads through a signed Storage link; a text file is refused with the photo-types message; the pin and
// its photo survive a reload; in Proposed the pin is not drawn, so a click on it selects nothing; Delete removes it. Points are on 3"
// multiples right of the panel; the pin's head is 10" above its point (vault/build/assumptions.md EZD-220).
import type { Point } from '@ezdraft/geometry';
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
  __ezdraftEditor: { objects(): Obj[] };
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
const viewButton = (page: Page, v: 'existing' | 'proposed') =>
  id(page, 'status-phase').locator(`button[data-value="${v}"]`);

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

const pins = async (page: Page) =>
  (await page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects())).filter(
    (o) => o.type === 'pin',
  );

test.describe('EZD-220 existing-condition pins', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-220 B1 a moisture pin with a photo persists and shows only in the Existing view', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await signInAs(user.email);
    await openReady(page, ids.P1);

    await page.keyboard.press('f');
    await id(page, 'pin-kind-damage_moisture').click();
    await clickAt(page, 150, 60);
    await expect.poll(async () => (await pins(page)).length).toBe(1);
    const [pin] = await pins(page);
    expect(pin.data).toMatchObject({
      geometry: { point: { x: 150, y: 60 } },
      status: 'existing',
      attributes: { kind: 'damage_moisture', photoFileId: null },
    });
    await page.keyboard.press('Escape');
    await expect(id(page, 'fixtures-panel')).toHaveCount(0);

    // Select the pin by its head and attach a photo.
    await clickAt(page, 150, 70);
    const inspector = page.locator('[data-inspector-kind="pin"]');
    await expect(inspector).toBeVisible();
    await expect(id(page, 'inspector-title')).toHaveText('Damage / moisture pin');
    await id(page, 'pin-photo-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not a photo'),
    });
    await expect(id(page, 'pin-photo-refused')).toHaveText('Choose a JPEG, PNG or HEIC photo.');
    await id(page, 'pin-photo-input').setInputFiles({
      name: 'stain.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect
      .poll(
        async () =>
          ((await pins(page))[0]?.data.attributes as { photoFileId: unknown }).photoFileId,
      )
      .not.toBeNull();
    const photo = (await pins(page))[0]!.data.attributes as { photoFileId: string };
    const thumb = id(page, 'pin-photo-thumb');
    await expect(thumb).toBeVisible();
    await expect
      .poll(() =>
        thumb.evaluate(
          (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth,
        ),
      )
      .toBe(1);
    expect(await thumb.getAttribute('src')).toContain(`/object/sign/sources/`);
    expect(await thumb.getAttribute('src')).toContain(photo.photoFileId);
    await saved(page);

    // It survives a reload.
    await page.reload();
    await openReady(page, ids.P1);
    const [after] = await pins(page);
    expect(after.data).toMatchObject({
      status: 'existing',
      attributes: { kind: 'damage_moisture', photoFileId: photo.photoFileId },
    });
    await clickAt(page, 150, 70);
    await expect(id(page, 'pin-photo-thumb')).toBeVisible();

    // Hidden in Proposed: a click on its head selects nothing; shown again in Existing.
    await page.keyboard.press('Escape');
    await viewButton(page, 'proposed').click();
    await clickAt(page, 150, 70);
    await expect(inspector).toHaveCount(0);
    await viewButton(page, 'existing').click();
    await clickAt(page, 150, 70);
    await expect(inspector).toBeVisible();

    // AC-6: Delete removes the pin (its source_file row is kept, pins.db.test.ts).
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await pins(page)).length).toBe(0);
  });
});
