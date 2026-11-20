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
    await expect(page.locator('[data-testid="shortcut-row"]')).toHaveCount(17);
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
