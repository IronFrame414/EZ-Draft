// EZD-221b B1-B9 (vault/plans/EZD-221b.md section 4; AC-EZD-221-1, -2, -3, -4, -5, -6, -7). Untagged, so desktop
// 1600 x 1000; B9 is @ipad. Every test makes its own company (never tenant 1). Expected values: Q-0565 (five tiles,
// Empty first and selected), Q-0570 (sizes, Ceiling 8' 0", live Area), Q-0561 (`12 6` refused after blur), Q-0590 (a),
// Q-0398, Q-0399, Q-0401 (no Binder, code or field-measure parts), Q-0203 (create failure keeps the dialog),
// Q-0214 (load error with Retry), Q-0566, Q-0568 (a foreman gets the template walls), Q-0591 (a) (empty hint),
// S03 States, 11 Accessibility and input (44 px), plan section 6 (wording).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  setPermissions,
  signedInJsContents,
  test,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);

type Obj = { id: string; type: string; data: Record<string, unknown> };
type EditorWindow = { __ezdraftEditor: { objects(): Obj[]; edit(changes: unknown[]): string[] } };

async function creator(): Promise<{ tenant: string; email: string }> {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, [
    'view_projects',
    'create_projects',
    'edit_model',
  ]);
  return { tenant, email: member.email };
}

async function foreman(): Promise<{ tenant: string; email: string }> {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'listed' });
  await setPermissions(tenant, member.membershipId, ['view_projects', 'create_projects']);
  return { tenant, email: member.email };
}

async function step1(page: Page, type = 'Kitchen') {
  await page.goto('/');
  await tid(page, 'projects-new').click();
  await expect(tid(page, 'new-project-dialog')).toBeVisible();
  await tid(page, 'new-project-type').selectOption({ label: type });
  await tid(page, 'new-project-address').fill('12 Oak Ave');
}

async function step2(page: Page) {
  await tid(page, 'new-project-next').click();
  await expect(tid(page, 'new-project-template-block')).toHaveAttribute('data-state', 'ready');
}

const tile = (page: Page, key: string) =>
  page.locator(`[data-testid="new-project-template"][data-template="${key}"]`);

async function projectId(tenant: string): Promise<string> {
  const rows = await harnessSql()<Array<{ id: string }>>`
    select id from public.project where tenant_id = ${tenant}::uuid`;
  return rows[0]!.id;
}

async function projectCount(tenant: string): Promise<number> {
  const rows =
    await harnessSql()`select count(*) as n from public.project where tenant_id = ${tenant}::uuid`;
  return Number(rows[0]!.n);
}

async function typeCounts(tenant: string): Promise<Record<string, number>> {
  const rows = await harnessSql()<Array<{ type: string; n: string }>>`
    select type, count(*) as n from public.model_object
    where tenant_id = ${tenant}::uuid and deleted = false group by type`;
  return Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]));
}

const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as EditorWindow).__ezdraftEditor.objects());

async function expectReady(page: Page) {
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
}

const HINT = 'Draw walls with Wall (W) or Room rectangle (R).';

test.describe('EZD-221b New project wizard: template step', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(`EZD-221b B1 step 2 shows: recap, Blank source, five tiles with Empty selected, units and Create will (AC-EZD-221-1)`, async ({
    page,
    signInAs,
  }) => {
    const { email } = await creator();
    await signInAs(email);
    await step1(page, 'Bath');
    await expect(tid(page, 'new-project-step')).toHaveText('Step 1 of 2');
    await expect(tid(page, 'new-project-next')).toBeVisible();
    await expect(tid(page, 'new-project-create')).toHaveCount(0);

    await step2(page);
    await expect(tid(page, 'new-project-dialog')).toHaveAttribute('data-step', '2');
    await expect(tid(page, 'new-project-steps')).toContainText('Project details');
    await expect(tid(page, 'new-project-steps')).toContainText('Input source + settings');
    await expect(tid(page, 'new-project-step')).toHaveText('Step 2 of 2');
    const recap = tid(page, 'new-project-recap');
    for (const text of ['Bath remodel', 'Bath', '12 Oak Ave', 'No customer'])
      await expect(recap).toContainText(text);
    await expect(tid(page, 'new-project-source-blank')).toContainText('Blank (template)');

    const tiles = tid(page, 'new-project-template');
    await expect(tiles).toHaveCount(5);
    expect(
      await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('data-template'))),
    ).toEqual(['empty', 'galley_kitchen', 'l_kitchen', 'bath_5x8', 'primary_bath']);
    const names = ['Empty', 'Galley kitchen', 'L-kitchen', '5x8 bath', 'Primary bath'];
    const sizes = [
      'No walls',
      `8' 0" x 14' 0"`,
      `11' 9 1/2" x 14' 0"`,
      `5' 0" x 8' 0"`,
      `10' 0" x 12' 0"`,
    ];
    for (let i = 0; i < 5; i++) {
      await expect(tiles.nth(i)).toContainText(names[i]!);
      await expect(tiles.nth(i)).toContainText(sizes[i]!);
    }
    expect(
      await tiles.evaluateAll((els) => els.map((e) => e.getAttribute('data-selected'))),
    ).toEqual(['true', 'false', 'false', 'false', 'false']);
    await expect(tid(page, 'new-project-template-width')).toHaveCount(0);
    await expect(tid(page, 'new-project-units')).toContainText('Imperial');
    const will = tid(page, 'new-project-create-will');
    await expect(will).toContainText('Make "Bath remodel" as Draft');
    await expect(will).toContainText('Open an empty Plan editor');
    const text = await tid(page, 'new-project-dialog').innerText();
    for (const word of [
      'EZ Binder',
      'Code edition',
      'Submittal profile',
      'Property appraiser',
      'Polycam',
      'Field measure',
    ]) {
      expect(text, word).not.toContain(word);
    }

    await tid(page, 'new-project-back').click();
    await expect(tid(page, 'new-project-dialog')).toHaveAttribute('data-step', '1');
    await expect(tid(page, 'new-project-name')).toHaveValue('Bath remodel');
    await step2(page);
    await expect(tile(page, 'empty')).toHaveAttribute('data-selected', 'true');
  });

  test(`EZD-221b B2 sizes: the template sets Width, Length and Ceiling, Area is live, and a bad size shows its error after the field is left (AC-EZD-221-2, -7)`, async ({
    page,
    signInAs,
  }) => {
    const { email } = await creator();
    await signInAs(email);
    await step1(page);
    await step2(page);
    const width = tid(page, 'new-project-template-width');
    const area = tid(page, 'new-project-template-area');
    await tile(page, 'l_kitchen').click();
    await expect(width).toHaveValue(`11' 9 1/2"`);
    await expect(tid(page, 'new-project-template-length')).toHaveValue(`14' 0"`);
    await expect(tid(page, 'new-project-template-ceiling')).toHaveValue(`8' 0"`);
    await expect(area).toHaveText('165 SF');
    await expect(tid(page, 'new-project-create-will')).toContainText(
      'Open the Plan editor with the L-kitchen',
    );

    await width.fill("12'");
    await expect(area).toHaveText('168 SF');

    await width.fill('12 6');
    await expect(tid(page, 'new-project-create')).toBeDisabled();
    await expect(tid(page, 'new-project-template-error')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(tid(page, 'new-project-template-error')).toHaveText(
      `Use 12'6", 12' 6 1/2", 150" or 12.5'`,
    );
    await expect(width).toHaveAttribute('aria-invalid', 'true');
    await expect(area).toHaveText('—');
    await expect(tid(page, 'new-project-template-accepts')).toHaveCount(0);

    await width.fill("12'");
    await expect(tid(page, 'new-project-template-error')).toHaveCount(0);
    await expect(tid(page, 'new-project-template-accepts')).toBeVisible();
    await expect(tid(page, 'new-project-create')).toBeEnabled();

    await tile(page, 'galley_kitchen').click();
    await expect(width).toHaveValue(`8' 0"`);
    await expect(tid(page, 'new-project-template-ceiling')).toHaveValue(`8' 0"`);
    await expect(area).toHaveText('112 SF');

    await tile(page, 'empty').click();
    await expect(width).toHaveCount(0);
    await expect(area).toHaveCount(0);
  });

  test(`EZD-221b B3 done when: a project from the L-kitchen template opens with its four walls and room (AC-EZD-221-3)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    await signInAs(email);
    await step1(page);
    await step2(page);
    await tile(page, 'l_kitchen').click();
    await tid(page, 'new-project-template-ceiling').fill("9'");
    await tid(page, 'new-project-create').click();
    await expect.poll(() => projectCount(tenant)).toBe(1);
    const id = await projectId(tenant);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${id}`);
    await expectReady(page);

    const list = await objects(page);
    const walls = list.filter((o) => o.type === 'wall');
    expect(walls).toHaveLength(4);
    for (const w of walls) expect((w.data.attributes as { height: number }).height).toBe(108);
    const rooms = list.filter((o) => o.type === 'room');
    expect(rooms).toHaveLength(1);
    expect((rooms[0]!.data.attributes as { name: string }).name).toBe('L-kitchen');
    const boundary = (rooms[0]!.data.geometry as { boundary: Array<{ x: number }> }).boundary;
    for (const p of boundary) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(141.5);
    }
    await expect.poll(() => typeCounts(tenant)).toEqual({ floor: 1, wall: 4, room: 1 });
    await expect(tid(page, 'plan-empty-hint')).toHaveCount(0);
  });

  test(`EZD-221b B4 empty hint: an Empty project opens with the hint, which goes when a wall is drawn (AC-EZD-221-4)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    await signInAs(email);
    await step1(page);
    await step2(page);
    await tid(page, 'new-project-create').click();
    await expect.poll(() => projectCount(tenant)).toBe(1);
    await expectReady(page);
    await expect(tid(page, 'plan-empty-hint')).toHaveText(HINT);
    const list = await objects(page);
    expect(list.filter((o) => o.type === 'wall')).toHaveLength(0);
    expect(await typeCounts(tenant)).toEqual({ floor: 1 });

    const level = list.find((o) => o.type === 'floor')!.id;
    const made = createWallData({
      start: { x: 0, y: 0 },
      end: { x: 120, y: 0 },
      level,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    const changes = [
      {
        id: crypto.randomUUID(),
        value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
      },
    ];
    await page.evaluate(
      (c) => (window as unknown as EditorWindow).__ezdraftEditor.edit(c),
      changes,
    );
    await expect(tid(page, 'plan-empty-hint')).toHaveCount(0);
  });

  test(`EZD-221b B5 create fails: the dialog stays on step 2 with the template and sizes, and the retry makes the walls (AC-EZD-221-5)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await creator();
    await signInAs(email);
    await step1(page);
    await step2(page);
    await tile(page, 'l_kitchen').click();
    await tid(page, 'new-project-template-width').fill("13'");
    await page.route(
      (url) => url.pathname === '/api/projects',
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({
                error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
              }),
            })
          : route.fallback(),
    );
    await tid(page, 'new-project-create').click();
    await expect(tid(page, 'new-project-error')).toHaveText(
      "Couldn't create the project. Try again.",
    );
    await expect(tid(page, 'new-project-dialog')).toHaveAttribute('data-step', '2');
    await expect(tile(page, 'l_kitchen')).toHaveAttribute('data-selected', 'true');
    await expect(tid(page, 'new-project-template-width')).toHaveValue("13'");
    expect(await projectCount(tenant)).toBe(0);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await tid(page, 'new-project-create').click();
    await expect.poll(() => projectCount(tenant)).toBe(1);
    await expect.poll(() => typeCounts(tenant)).toMatchObject({ wall: 4 });
  });

  test(`EZD-221b B6 foreman: a member without Edit model still gets the template walls, and sees no drawing tools or hint (AC-EZD-221-6)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await foreman();
    await signInAs(email);
    await step1(page);
    await step2(page);
    await tile(page, 'l_kitchen').click();
    await tid(page, 'new-project-create').click();
    await expect.poll(() => projectCount(tenant)).toBe(1);
    const id = await projectId(tenant);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${id}`);
    await expectReady(page);
    await expect(tid(page, 'save-state')).toHaveCount(0);
    await expect(page.locator('[data-shell-region="rail"]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveAttribute(
      'data-rail-tool',
      'select',
    );
    await expect(page.locator('[data-rail-tool="wall"]')).toHaveCount(0);
    await expect(page.locator('[data-rail-tool="room-rect"]')).toHaveCount(0);
    await expect(tid(page, 'plan-empty-hint')).toHaveCount(0);
    await expect.poll(() => typeCounts(tenant)).toEqual({ floor: 1, wall: 4, room: 1 });
  });

  test(`EZD-367 done when: a member without Edit model sees a Select-only rail with no drawing tools, no save state and no empty hint (AC-EZD-367-1, AC-EZD-221-6)`, async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await foreman();
    await signInAs(email);
    await step1(page);
    await step2(page);
    await tile(page, 'l_kitchen').click();
    await tid(page, 'new-project-create').click();
    await expect.poll(() => projectCount(tenant)).toBe(1);
    const id = await projectId(tenant);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/projects/${id}`);
    await expectReady(page);
    await expect(tid(page, 'save-state')).toHaveCount(0);
    await expect(page.locator('[data-shell-region="rail"]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveCount(1);
    await expect(page.locator('[data-shell-region="rail"] [data-rail-tool]')).toHaveAttribute(
      'data-rail-tool',
      'select',
    );
    await expect(page.locator('[data-rail-tool="wall"]')).toHaveCount(0);
    await expect(page.locator('[data-rail-tool="room-rect"]')).toHaveCount(0);
    await expect(tid(page, 'plan-empty-hint')).toHaveCount(0);
  });

  test(`EZD-221b B7 load error: the template block shows its error with Retry, then the tiles (AC-EZD-221-2)`, async ({
    page,
    signInAs,
  }) => {
    const { email } = await creator();
    await signInAs(email);
    await step1(page);
    const block = (route: { abort: () => Promise<void> }) => route.abort();
    await page.route('**/_next/static/**', block);
    await tid(page, 'new-project-next').click();
    const blockEl = tid(page, 'new-project-template-block');
    await expect(blockEl).toHaveAttribute('data-state', 'error');
    await expect(blockEl).toContainText("Couldn't load the templates.");
    await expect(tid(page, 'new-project-create')).toBeDisabled();

    await page.unroute('**/_next/static/**', block);
    await blockEl.getByRole('button', { name: 'Retry' }).click();
    await expect(blockEl).toHaveAttribute('data-state', 'ready');
    await expect(tile(page, 'empty')).toHaveAttribute('data-selected', 'true');
    await expect(tid(page, 'new-project-create')).toBeEnabled();
  });

  test(`EZD-221b B8 lazy: the first page loads no template picker and no geometry code until step 2 (AC-EZD-221-1)`, async ({
    page,
    browser,
    signInAs,
  }) => {
    test.setTimeout(120000);
    const { email } = await creator();
    await signInAs(email);
    await page.goto('/');
    const state = await page.context().storageState();
    const contents = await signedInJsContents(browser, state, '/');
    expect('error' in contents).toBe(false);
    const keys = Object.keys((contents.details as { modules: Record<string, number> }).modules);
    expect(keys.filter((k) => k.startsWith('app:lazy/template-picker/'))).toEqual([]);
    expect(keys.filter((k) => k.startsWith('geometry:'))).toEqual([]);
    expect(keys.filter((k) => k === 'pkg:@ezdraft/geometry')).toEqual([]);
    expect(keys).toContain('app:components/projects/NewProjectDialog.tsx');

    await step1(page);
    await step2(page);
  });

  test(
    `EZD-221b B9 touch targets: the step 2 dialog's thirteen controls are at least 44 px on iPad (AC-EZD-221-2)`,
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await creator();
      await signInAs(email);
      await step1(page);
      await step2(page);
      await tile(page, 'l_kitchen').click();
      expect(await expectTouchTargets(page, tid(page, 'new-project-dialog'))).toBe(13);
    },
  );
});
