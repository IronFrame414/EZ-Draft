// EZD-2026 (AC-EZD-2026-1, -2, -3; Q-0904 A; accessibility and iPad audit 2026-11-27 A7): on a wide screen (at
// least 1024 px wide and wider than tall) field measure shows the drawing on the left and the room chips, wall field,
// ceiling field and keypad on the right, all inside the screen with no page scroll, at 1180 x 820 (iPad held
// sideways) and 1366 x 1024 (12.9" iPad held sideways); tapping a wall letter then typing needs no scrolling. On the
// phone (390 x 844) and on screens narrower than the wide width (1023 x 768) or taller than wide (820 x 1180) the
// layout is the phone board's single column (S17b Layout: canvas, then the fields, then the hint line, then the
// keypad). The pixel-for-pixel "screenshot unchanged" check is a before / after tool, like EZD-1996's
// style-split-screens.spec.ts (a standing whole-screen baseline would fail on every later change to this screen): it
// runs only with EZD_FM_SCREENSHOTS=1, once with --update-snapshots on the code before this ticket, then without on
// the code after it. Each test makes its own company (never tenant 1).
// L-shape lengths are the board's Family room (S17bFieldMeasure): wall B 9' 0 1/2".
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

async function setup() {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  await harnessSql()`update public.project set name = 'Kitchen remodel' where id = ${project}::uuid`;
  const a = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, a.membershipId, ['view_projects', 'send_field_measurement']);
  return { project, a };
}

type Box = { x: number; y: number; width: number; height: number };

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (b === null) throw new Error('not shown');
  return b;
}

const parts = (page: Page) => ({
  drawing: page.getByTestId('shape-canvas').locator('svg'),
  chips: page.getByRole('group', { name: 'Rooms', exact: true }),
  wall: page.locator('[data-field="wall"]'),
  ceiling: page.locator('[data-field="ceiling"]'),
  keypad: page.getByTestId('keypad'),
  hint: page.getByTestId('walls-done'),
});

// How far the page and the phone frame's main region have scrolled, and how far they could scroll.
async function scrollState(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('[data-phone-region="main"]') as HTMLElement;
    const doc = document.scrollingElement as HTMLElement;
    return {
      mainTop: main.scrollTop,
      mainOver: main.scrollHeight - main.clientHeight,
      docTop: doc.scrollTop,
      docOver: doc.scrollHeight - window.innerHeight,
    };
  });
}

async function openLShape(page: Page, project: string) {
  await page.goto(`/projects/${project}/field-measure`);
  await page.getByRole('button', { name: 'L-shape' }).click();
  await expect(page.getByRole('button', { name: /^Wall A(, |$)/ })).toHaveAttribute('aria-pressed', 'true');
}

// Taps the middle of what is on screen now, so nothing is scrolled into view first (locator.tap would scroll).
async function tapInPlace(page: Page, l: Locator) {
  const b = await box(l);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}

test.describe('EZD-2026 Field measure on a wide screen', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  for (const size of [
    { width: 1180, height: 820 },
    { width: 1366, height: 1024 },
  ]) {
    test(
      `EZD-2026 at ${size.width}x${size.height} the drawing is on the left, the chips, fields and keypad on the right, all on screen with no scroll (AC-EZD-2026-1)`,
      { tag: ['@ipad'] },
      async ({ page, signInAs }) => {
        const { project, a } = await setup();
        await page.setViewportSize(size);
        await signInAs(a.email);
        await openLShape(page, project);

        const p = parts(page);
        const drawing = await box(p.drawing);
        const right = {
          chips: await box(p.chips),
          wall: await box(p.wall),
          ceiling: await box(p.ceiling),
          keypad: await box(p.keypad),
        };
        for (const [name, b] of Object.entries({ drawing, ...right })) {
          expect(b.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
          expect(b.y, `${name} top edge`).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width, `${name} right edge`).toBeLessThanOrEqual(size.width);
          expect(b.y + b.height, `${name} bottom edge`).toBeLessThanOrEqual(size.height);
        }
        // Drawing on the left: every right-hand part starts right of the drawing's right edge.
        for (const [name, b] of Object.entries(right)) {
          expect(b.x, `${name} is right of the drawing`).toBeGreaterThanOrEqual(drawing.x + drawing.width);
        }
        // The right column keeps the board's order: chips, then the fields, then the keypad.
        expect(right.wall.y).toBeGreaterThanOrEqual(right.chips.y + right.chips.height);
        expect(right.keypad.y).toBeGreaterThanOrEqual(right.wall.y + right.wall.height);
        const s = await scrollState(page);
        expect(s.mainOver, 'the screen region does not scroll').toBeLessThanOrEqual(0);
        expect(s.docOver, 'the page does not scroll').toBeLessThanOrEqual(0);

        // Tapping a wall letter, then typing on the keypad, needs no scrolling.
        await tapInPlace(page, page.getByRole('button', { name: /^Wall B(, |$)/ }));
        await expect(page.getByRole('button', { name: /^Wall B(, |$)/ })).toHaveAttribute(
          'aria-pressed',
          'true',
        );
        for (const k of ['9', "'", '0', '1/2']) {
          await tapInPlace(page, p.keypad.locator(`[data-key=${JSON.stringify(k)}]`));
        }
        await expect(p.wall).toContainText('Wall B');
        // The field shows the keys as typed until Next wall saves them.
        await expect(p.wall).toContainText(`9' 0 1/2`);
        expect(await scrollState(page)).toEqual({ mainTop: 0, mainOver: s.mainOver, docTop: 0, docOver: s.docOver });
      },
    );
  }

  test(
    'EZD-2026 every field measure control is a 44 px touch target at 1180x820 (AC-EZD-2026-3)',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { project, a } = await setup();
      await page.setViewportSize({ width: 1180, height: 820 });
      await signInAs(a.email);
      await openLShape(page, project);
      // All of it is on screen (AC-EZD-2026-1), so one check covers every control.
      const checked = await expectTouchTargets(page, page.getByTestId('field-measure'));
      expect(checked).toBeGreaterThan(0);
    },
  );

  // Not wide: the phone board's single column, canvas across the screen and everything else below it.
  async function expectPhoneColumn(page: Page, width: number) {
    const p = parts(page);
    const drawing = await box(p.drawing);
    const wall = await box(p.wall);
    const ceiling = await box(p.ceiling);
    const hint = await box(p.hint);
    const keypad = await box(p.keypad);
    // Body padding 14 px each side, canvas card padding 8 px and border 1 px: the drawing is width - 46 px wide.
    expect(drawing.width).toBeCloseTo(width - 46, 0);
    expect(wall.y).toBeGreaterThanOrEqual(drawing.y + drawing.height);
    expect(ceiling.y).toBe(wall.y);
    expect(hint.y).toBeGreaterThanOrEqual(wall.y + wall.height);
    expect(keypad.y).toBeGreaterThanOrEqual(hint.y + hint.height);
    // The keypad runs edge to edge (margin -14 px across the body padding).
    expect(keypad.x).toBeCloseTo(0, 0);
    expect(keypad.width).toBeCloseTo(width, 0);
  }

  test(
    'EZD-2026 on the phone (390x844) the layout is the single column (AC-EZD-2026-2)',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, a } = await setup();
      await signInAs(a.email);
      await openLShape(page, project);
      await expectPhoneColumn(page, 390);
    },
  );

  for (const size of [
    { width: 1023, height: 768 },
    { width: 820, height: 1180 },
  ]) {
    test(
      `EZD-2026 at ${size.width}x${size.height} (not wide) the layout is the single column (AC-EZD-2026-2)`,
      { tag: ['@ipad'] },
      async ({ page, signInAs }) => {
        const { project, a } = await setup();
        await page.setViewportSize(size);
        await signInAs(a.email);
        await openLShape(page, project);
        await expectPhoneColumn(page, size.width);
      },
    );
  }
});

test.describe('EZD-2026 Field measure screenshots before / after (AC-EZD-2026-2)', () => {
  test.skip(!process.env.EZD_FM_SCREENSHOTS, 'before / after screenshot tool: set EZD_FM_SCREENSHOTS=1');
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  const shots: Array<{ tag: string; name: string; size?: { width: number; height: number } }> = [
    { tag: '@phone', name: 'phone-390x844' },
    { tag: '@ipad', name: 'narrow-1023x768', size: { width: 1023, height: 768 } },
    { tag: '@ipad', name: 'portrait-820x1180', size: { width: 820, height: 1180 } },
  ];
  for (const s of shots) {
    test(`EZD-2026 field measure ${s.name} looks as before`, { tag: [s.tag] }, async ({ page, signInAs }) => {
      const { project, a } = await setup();
      if (s.size) await page.setViewportSize(s.size);
      await signInAs(a.email);
      await openLShape(page, project);
      for (const k of ['1', '8', "'", '2', '"']) {
        await page.getByTestId('keypad').locator(`[data-key=${JSON.stringify(k)}]`).tap();
      }
      await expect(page.locator('[data-field="wall"]')).toContainText(`18' 2"`);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${s.name}.png`, {
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
        mask: [page.getByTestId('measure-status')],
      });
    });
  }
});
