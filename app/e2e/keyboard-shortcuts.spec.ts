// EZD-222 (AC-EZD-222-1 "Rebinding the Wall key changes the tool shortcut and tooltip"; S15d Keyboard shortcuts
// "Click a key cell, press the new key", collisions per view; phase-02.md EZD-222 "Already used by check, browser
// keys refused; rail and tooltips read bindings; Help lists shortcuts"; 04 Tool rail "Help | ?"). Desktop
// 1600 x 1000. Each test makes its own company (never tenant 1) with fixture S and its own member; nothing seeded
// is touched. Expected keys: the 04 Tool rail table (W Wall, R Room rectangle, ? Help).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const PERMISSIONS = ['settings_defaults', 'view_projects', 'edit_model'];

const tid = (page: Page, id: string) => page.getByTestId(id);
const tool = (page: Page, which: string) => page.locator(`[data-rail-tool="${which}"]`);
const tooltip = (page: Page, which: string) =>
  page.locator(`[data-rail-tool="${which}"] + [data-rail-tooltip]`);

async function stored(tenant: string): Promise<Record<string, unknown>> {
  return (await harnessSql()`select defaults from public.tenant where id = ${tenant}::uuid`)[0]
    .defaults as Record<string, unknown>;
}

async function openEditor(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

test.describe('EZD-222 Keyboard shortcuts and Help', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-222-1: rebinding Wall to B changes its key and tooltip; R is refused as Room rectangle\'s', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, member.membershipId, PERMISSIONS as never);
    await signInAs(member.email);

    // Before: the default key W.
    await openEditor(page, ids.P1);
    await expect(tool(page, 'wall')).toHaveAttribute('aria-keyshortcuts', 'W');

    await page.goto('/settings/defaults');
    await expect(tid(page, 'shortcuts-table')).toBeVisible();
    const wallKey = tid(page, 'shortcut-key-wall');
    await expect(wallKey).toHaveText('W');
    await wallKey.click();
    await expect(wallKey).toHaveText('Press a key');
    await page.keyboard.press('r');
    await expect(page.locator('[data-testid="shortcut-refusal"][data-command="wall"]')).toHaveText(
      'Already used by Room rectangle in Plan · not saved',
    );
    await expect(wallKey).toHaveText('Press a key');
    await page.keyboard.press('b');
    await expect(wallKey).toHaveText('B');
    await tid(page, 'defaults-save').click();
    await expect.poll(async () => (await stored(tenant)).keyboard_shortcuts).toEqual({ wall: 'B' });

    // After: the rail and its tooltip show B; W does nothing, B turns Wall on.
    await openEditor(page, ids.P1);
    await expect(tool(page, 'wall')).toHaveAttribute('aria-keyshortcuts', 'B');
    await expect(tooltip(page, 'wall')).toHaveText('WallB');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('w');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('b');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');

    // On the Ceiling view the company's Wall key is swallowed like any floor tool key (S05 Layout "Tool rail is
    // the ceiling rail"): B turns no floor tool on, there and after going back to Floor.
    await tool(page, 'ceiling').click();
    await expect(tool(page, 'beam')).toBeVisible();
    await page.keyboard.press('b');
    await expect(tid(page, 'typed-bar')).toHaveCount(0);
    await tid(page, 'surface-floor').click();
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');

    // Help (?) lists the shortcuts with the company's key.
    await page.keyboard.press('Shift+Slash');
    await expect(tid(page, 'help-panel')).toBeVisible();
    await expect(page.locator('[data-testid="help-shortcut"][data-command="wall"] dd')).toHaveText('B');
    await expect(page.locator('[data-testid="help-shortcut"][data-command="help"] dd')).toHaveText('?');
    await page.keyboard.press('Escape');
    await expect(tid(page, 'help-panel')).toHaveCount(0);
    await tool(page, 'help').click();
    await expect(tid(page, 'help-panel')).toBeVisible();
    await tid(page, 'help-close').click();
    await expect(tid(page, 'help-panel')).toHaveCount(0);
  });

  test('Reset shortcut clears a row; Reset to default map fills it again', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_defaults'] as never);
    await signInAs(member.email);
    await page.goto('/settings/defaults');
    // Board S15dDefaults: the view filter. Sketch is a Plan tool (04 "Shown on"); Select is on every tab.
    // EZD-230: the full key map (04 rail tools, Pan, Look up, tabs 1 to 4, Undo, Redo, Copy, Paste, Save).
    await expect(page.locator('[data-testid="shortcut-row"]')).toHaveCount(34);
    await tid(page, 'shortcuts-filter-sheets').click();
    await expect(page.locator('[data-testid="shortcut-row"][data-command="sketch"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="shortcut-row"][data-command="wall"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="shortcut-row"][data-command="select"]')).toHaveCount(1);
    await tid(page, 'shortcuts-filter-plan').click();
    await expect(page.locator('[data-testid="shortcut-row"][data-command="sketch"]')).toHaveCount(1);
    await tid(page, 'shortcuts-filter-all').click();
    await tid(page, 'shortcut-reset-door').click();
    await expect(tid(page, 'shortcut-key-door')).toHaveText('Not set');
    await tid(page, 'defaults-save').click();
    await expect.poll(async () => (await stored(tenant)).keyboard_shortcuts).toEqual({ door: '' });
    await tid(page, 'shortcuts-reset-map').click();
    await expect(tid(page, 'shortcut-key-door')).toHaveText('D');
    await tid(page, 'defaults-save').click();
    await expect.poll(async () => (await stored(tenant)).keyboard_shortcuts).toBeUndefined();
  });
});

// EZD-230 (AC-EZD-230-1, -2, -3; 04 Tool rail table, written out here; S15d "Keys are checked for collisions within
// the same view"; 04 Measurement entry "typing a number opens an inline length box"; Q-0038 per-user tool order).
const SPEC_KEYS: Record<string, string> = {
  select: 'V', move: 'M', wall: 'W', 'room-rect': 'R', door: 'D', window: 'N', cabinets: 'C', countertops: 'K',
  fixtures: 'F', electrical: 'E', ceiling: 'G', catalog: 'P', dimension: 'L', text: 'T', sketch: 'S',
  'detail-callout': 'X', 'revision-cloud': 'Q', reference: 'Shift+R', markup: 'Shift+M',
  'supplier-markup': 'Shift+S', measure: 'Shift+L', check: 'Shift+C', help: '?',
};
const NAMES: Record<string, string> = {
  select: 'Select', move: 'Move', wall: 'Wall', 'room-rect': 'Room rectangle', door: 'Door', window: 'Window',
  cabinets: 'Cabinets', countertops: 'Countertops', fixtures: 'Fixtures', electrical: 'Electrical', ceiling: 'Ceiling',
  sketch: 'Sketch', measure: 'Measure', help: 'Help',
};

async function railOrderOf(appUserId: string): Promise<string[]> {
  return ((await harnessSql()`select rail_order from public.app_user where id = ${appUserId}::uuid`)[0] as {
    rail_order: string[];
  }).rail_order;
}

const topIds = (page: Page) =>
  page.locator('[data-rail="top"] [data-rail-tool]').evaluateAll((els) => els.map((e) => e.getAttribute('data-rail-tool')));

test.describe('EZD-230 Default key map and full rail', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-230-1: every rail tool shown shows its default key in its tooltip; G opens Ceiling', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, member.membershipId, PERMISSIONS as never);
    await signInAs(member.email);
    await openEditor(page, ids.P1);

    const shown = (await page
      .locator('[data-rail-tool]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-rail-tool')))) as string[];
    expect(shown).toContain('ceiling');
    expect(shown).toContain('help');
    // Assistant has no default key in the 04 table (vault/build/assumptions.md EZD-230).
    for (const which of shown.filter((x) => x !== 'assistant')) {
      const key = SPEC_KEYS[which];
      expect(key, which).toBeDefined();
      await expect(tool(page, which)).toHaveAttribute('aria-keyshortcuts', key!);
      if (NAMES[which]) await expect(tooltip(page, which)).toHaveText(`${NAMES[which]}${key}`);
    }

    // G does what the Ceiling button does.
    await page.keyboard.press('g');
    await expect(tool(page, 'beam')).toBeVisible();
    await tid(page, 'surface-floor').click();
    await expect(tool(page, 'wall')).toBeVisible();
  });

  test('AC-EZD-230-2: assigning R to a second Plan command is refused', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_defaults'] as never);
    await signInAs(member.email);
    await page.goto('/settings/defaults');
    for (const which of ['text', 'reference']) {
      const cell = tid(page, `shortcut-key-${which}`);
      await expect(cell).toHaveText(SPEC_KEYS[which]!);
      await cell.click();
      await expect(cell).toHaveText('Press a key');
      await page.keyboard.press('r');
      await expect(page.locator(`[data-testid="shortcut-refusal"][data-command="${which}"]`)).toHaveText(
        'Already used by Room rectangle in Plan · not saved',
      );
      await page.keyboard.press('Escape');
      await expect(cell).toHaveText(SPEC_KEYS[which]!);
    }
    await expect(tid(page, 'defaults-save')).toBeDisabled();
    expect((await stored(tenant)).keyboard_shortcuts).toBeUndefined();
  });

  test('AC-EZD-230-3: with the Wall tool on, typing 12\'6" stays on the Plan tab and fills the length box', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, member.membershipId, PERMISSIONS as never);
    await signInAs(member.email);
    await openEditor(page, ids.P1);
    const url = page.url();
    await page.keyboard.press('w');
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'typed-bar-label')).toHaveText('Length');
    // 1 and 2 are also the Plan and 3D tab keys (S15d default map); the typed box takes them.
    await page.keyboard.type('12\'6"');
    await expect(tid(page, 'typed-box-input')).toHaveValue('12\'6"');
    await expect(page.getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(tid(page, 'plan-canvas')).toBeVisible();
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    expect(page.url()).toBe(url);
  });

  test('Q-0038: a user drags a tool to a new place on the rail; it is saved for them and kept after a reload', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, member.membershipId, PERMISSIONS as never);
    await signInAs(member.email);
    await openEditor(page, ids.P1);
    const before = (await topIds(page)) as string[];
    expect(before.slice(0, 3)).toEqual(['select', 'move', 'wall']);

    // Drag Wall onto Select's place.
    const from = (await tool(page, 'wall').boundingBox())!;
    const to = (await tool(page, 'select').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    // The drag does not also turn Wall on.
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await topIds(page)).slice(0, 3)).toEqual(['wall', 'select', 'move']);
    await expect.poll(async () => (await railOrderOf(member.appUserId)).slice(0, 3)).toEqual(['wall', 'select', 'move']);

    // Alt+Down moves the focused tool one place down.
    await tool(page, 'wall').focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(async () => (await topIds(page)).slice(0, 3)).toEqual(['select', 'wall', 'move']);
    await expect.poll(async () => (await railOrderOf(member.appUserId)).slice(0, 3)).toEqual(['select', 'wall', 'move']);

    await openEditor(page, ids.P1);
    await expect.poll(async () => (await topIds(page)).slice(0, 3)).toEqual(['select', 'wall', 'move']);
    // A click still turns the tool on.
    await tool(page, 'wall').click();
    await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Q-0038 (b): on a short window the tools that do not fit open from More tools', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, member.membershipId, PERMISSIONS as never);
    await signInAs(member.email);
    await openEditor(page, ids.P1);
    await expect(tool(page, 'more-tools')).toHaveCount(0);

    await page.setViewportSize({ width: 1600, height: 560 });
    await expect(tool(page, 'more-tools')).toBeVisible();
    // Ceiling is last on the standard rail, so it is in the flyout, with its key.
    await expect(page.locator('[data-rail="top"] > [data-rail-slot] [data-rail-tool="ceiling"]')).toHaveCount(0);
    await tool(page, 'more-tools').click();
    const flyout = page.locator('[data-rail-more]');
    await expect(flyout).toBeVisible();
    await expect(flyout.locator('[data-rail-tool="ceiling"]')).toHaveText('CeilingG');
    await page.keyboard.press('Escape');
    await expect(flyout).toHaveCount(0);
    await tool(page, 'more-tools').click();
    await flyout.locator('[data-rail-tool="ceiling"]').click();
    await expect(flyout).toHaveCount(0);
    await expect(tool(page, 'beam')).toHaveCount(1);
  });

  // Q-0630 tablet rule: the order can be set by touch alone. A real touch sequence (CDP), so a browser pan would
  // cancel the pointer if the tool did not take the drag itself (touch-action: none).
  test(
    'Q-0038 touch: a finger drags a tool to a new place on the rail and it is saved',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      const ids = await seedFixtureS(tenant);
      const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, member.membershipId, PERMISSIONS as never);
      await signInAs(member.email);
      await openEditor(page, ids.P1);
      expect(((await topIds(page)) as string[]).slice(0, 3)).toEqual(['select', 'move', 'wall']);
      await expect(tool(page, 'wall')).toHaveCSS('touch-action', 'none');
      // Help is not movable and keeps the default.
      await expect(tool(page, 'help')).not.toHaveCSS('touch-action', 'none');

      const from = (await tool(page, 'wall').boundingBox())!;
      const to = (await tool(page, 'select').boundingBox())!;
      const x = Math.round(from.x + from.width / 2);
      const y0 = from.y + from.height / 2;
      const y1 = to.y + to.height / 2;
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: string, y?: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type: type as 'touchStart',
          touchPoints: y === undefined ? [] : [{ x, y: Math.round(y) }],
        });
      await touch('touchStart', y0);
      for (let i = 1; i <= 8; i++) await touch('touchMove', y0 + ((y1 - y0) * i) / 8);
      await touch('touchEnd');

      await expect.poll(async () => (await topIds(page)).slice(0, 3)).toEqual(['wall', 'select', 'move']);
      await expect
        .poll(async () => (await railOrderOf(member.appUserId)).slice(0, 3))
        .toEqual(['wall', 'select', 'move']);
      // The drag did not also turn Wall on; a tap still does.
      await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'false');
      await tool(page, 'wall').tap();
      await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
    },
  );

  // EZD-1973 (AC-EZD-1973-1, AC-EZD-1973-3): Chrome on Linux, Windows and Android sends no click for a tap that starts
  // just after a touch drag ended with the finger still moving, so the rail takes a finger tap at pointer up. The tap
  // here follows the drag at once, with nothing between them.
  test(
    'EZD-1973: a tap straight after a touch drag on the rail turns the tool on',
    { tag: ['@surface'] },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      const ids = await seedFixtureS(tenant);
      const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, member.membershipId, PERMISSIONS as never);
      await signInAs(member.email);
      await openEditor(page, ids.P1);
      expect(((await topIds(page)) as string[]).slice(0, 3)).toEqual(['select', 'move', 'wall']);

      const from = (await tool(page, 'wall').boundingBox())!;
      const to = (await tool(page, 'select').boundingBox())!;
      const x = Math.round(from.x + from.width / 2);
      const y0 = from.y + from.height / 2;
      const y1 = to.y + to.height / 2;
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: string, y?: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type: type as 'touchStart',
          touchPoints: y === undefined ? [] : [{ x, y: Math.round(y) }],
        });
      await touch('touchStart', y0);
      for (let i = 1; i <= 8; i++) await touch('touchMove', y0 + ((y1 - y0) * i) / 8);
      await touch('touchEnd');
      // Wall is now in the first place, under the finger: tap it there.
      await touch('touchStart', y1);
      await touch('touchEnd');

      await expect(tool(page, 'wall')).toHaveAttribute('aria-pressed', 'true');
      expect(((await topIds(page)) as string[]).slice(0, 3)).toEqual(['wall', 'select', 'move']);
    },
  );
});
