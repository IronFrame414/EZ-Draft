// EZD-1980 (AC-EZD-1980-1, -2; audit/ui-live-2026-11-24/REPORT.md finding F8 and its "Touch targets" list): on the
// iPad profile (1180 x 820, touch) every control on Settings Defaults, Libraries (Notes), Sheet presets, Render
// models, Company, Title block and Code edition, on the Sheets left list and Previous / Next sheet, and in the
// Cabinets tool panel has a tap area of at least 44 x 44 px (11 Non-functional requirements: "44 px minimum on
// touch"), measured with the repo's expectTouchTargets. A page taller than the screen is checked region by region:
// each control's largest enclosing box that fits the screen is scrolled to the middle and checked while in view,
// and the regions together must hold every visible control of the screen, so none is skipped. Every test makes its
// own company (never tenant 1) and its own members. No import.meta or __dirname (lesson L-017).
import { CURRENT_SCHEMA_VERSION, createWallData, type Point } from '@ezdraft/geometry';
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { TOUCH_TARGET_SELECTOR } from '../test-harness/touch-targets';
import { seedFixtureS } from '../test-harness/projects-fixture';
import { addUser } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string): Locator => page.getByTestId(id);
const REGION_ATTR = 'data-ezd1980-region';
// A region is at most this tall, so centred on the iPad screen (820 px) it clears the headers and footers.
const REGION_MAX = 440;

type Window2 = {
  __ezdraftEditor: {
    objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
    edit(changes: unknown[]): string[];
  };
};

// Checks every visible control under `root` with expectTouchTargets, region by region; returns the count checked.
async function expectAllTouchTargets(page: Page, root: Locator): Promise<number> {
  const { total, regions } = await root.evaluate(
    (rootEl, { selector, attr, max }) => {
      const visible = (el: Element) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return !(
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          r.width <= 0 ||
          r.height <= 0
        );
      };
      const targets = Array.from(rootEl.querySelectorAll(selector)).filter(visible);
      const chosen = new Set<Element>();
      for (const t of targets) {
        let region: Element = t.parentElement ?? rootEl;
        let up = region.parentElement;
        while (up && rootEl.contains(up) && up.getBoundingClientRect().height <= max) {
          region = up;
          up = up.parentElement;
        }
        chosen.add(region);
      }
      // Keep the outermost regions only, so no control is checked twice.
      const outer = [...chosen].filter((r) => ![...chosen].some((o) => o !== r && o.contains(r)));
      document.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr));
      outer.forEach((r, i) => r.setAttribute(attr, String(i)));
      return { total: targets.length, regions: outer.length };
    },
    { selector: TOUCH_TARGET_SELECTOR, attr: REGION_ATTR, max: REGION_MAX },
  );
  expect(total, 'controls on the screen').toBeGreaterThan(0);
  let checked = 0;
  for (let i = 0; i < regions; i++) {
    const region = page.locator(`[${REGION_ATTR}="${i}"]`);
    await region.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    checked += await expectTouchTargets(page, region);
  }
  expect(checked, 'every control was checked').toBe(total);
  return checked;
}

async function owner(): Promise<{ tenant: string; email: string }> {
  const tenant = await createTenant();
  const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
  return { tenant, email: v.email };
}

const settingsPage = (page: Page, section: string) =>
  page.locator(`[data-settings-page="${section}"]`);

// The four walls (0,0)->(144,0)->(144,120)->(0,120)->(0,0), the 12' x 10' room the audit drew.
async function addRoom(page: Page) {
  const level = await page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
  const pt = (x: number, y: number): Point => ({ x, y });
  const pts = [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120), pt(0, 0)];
  const changes = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const made = createWallData({
      start: pts[i]!,
      end: pts[i + 1]!,
      level,
      thicknessSide: 'right',
    });
    if (!made.ok) throw new Error('wall data');
    changes.push({
      id: crypto.randomUUID(),
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
  }
  await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit(c), changes);
}

async function editorWithRoom(page: Page, signInAs: (email: string) => Promise<unknown>) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model'] as never);
  await signInAs(m.email);
  await page.goto(`/projects/${ids.P1}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
  await addRoom(page);
}

test.describe('EZD-1980 touch targets of at least 44 px on iPad', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'EZD-1980 Settings Defaults: every control is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await owner();
      await signInAs(email);
      await page.goto('/settings/defaults');
      await expect(tid(page, 'defaults-form')).toBeVisible();
      await expect(tid(page, 'shortcuts-table')).toBeVisible();
      await expectAllTouchTargets(page, settingsPage(page, 'defaults'));
    },
  );

  test(
    'EZD-1980 Settings Libraries (Notes): every control is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { tenant, email } = await owner();
      await harnessSql()`select private.seed_general_notes(${tenant}::uuid)`;
      await signInAs(email);
      await page.goto('/settings/libraries');
      await expect(tid(page, 'libraries-panel')).toBeVisible();
      await expect(tid(page, 'notes-filter').first()).toBeVisible();
      await expect(tid(page, 'library-row').first()).toBeVisible();
      await expectAllTouchTargets(page, settingsPage(page, 'libraries'));
    },
  );

  test(
    'EZD-1980 Settings Sheet presets: every control is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { tenant, email } = await owner();
      await harnessSql()`select private.seed_submittal_profile(${tenant}::uuid)`;
      await signInAs(email);
      await page.goto('/settings/sheet-presets');
      await expect(tid(page, 'sheet-presets-inspector-name')).toHaveText('Palm Beach County');
      await expect(tid(page, 'sheet-presets-file-split')).toBeVisible();
      await expect(tid(page, 'sheet-presets-token').first()).toBeVisible();
      await expectAllTouchTargets(page, settingsPage(page, 'sheet_presets'));
    },
  );

  test(
    'EZD-1980 Settings Render models: every control is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await owner();
      await signInAs(email);
      await page.goto('/settings/render-models');
      await expect(tid(page, 'render-models-form')).toBeVisible();
      await expect(tid(page, 'render-models-fast-model')).toBeVisible();
      await expectAllTouchTargets(page, settingsPage(page, 'render_models'));
    },
  );

  test(
    'EZD-1980 Settings Company: every control is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await owner();
      await signInAs(email);
      await page.goto('/settings/company');
      await expect(tid(page, 'company-form')).toBeVisible();
      await expect(tid(page, 'customers-archived-toggle')).toBeVisible();
      await expectAllTouchTargets(page, settingsPage(page, 'company'));
    },
  );

  test(
    'EZD-1980 Settings Title block: every control is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await owner();
      await signInAs(email);
      await page.goto('/settings/title-block');
      await expect(tid(page, 'title-block-form')).toBeVisible();
      await expectAllTouchTargets(page, settingsPage(page, 'title_block'));
    },
  );

  test(
    'EZD-1980 Settings Code edition: every control is at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      const { email } = await owner();
      await signInAs(email);
      await page.goto('/settings/code-edition');
      await expect(tid(page, 'code-edition-form')).toBeVisible();
      await expectAllTouchTargets(page, settingsPage(page, 'code_edition'));
    },
  );

  test(
    'EZD-1980 Sheets: the sheet list and Previous / Next sheet are at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      await editorWithRoom(page, signInAs);
      await page
        .getByRole('navigation', { name: 'Views' })
        .getByRole('button', { name: 'Sheets', exact: true })
        .click();
      await expect(tid(page, 'sheet-row-A1.0')).toBeVisible();
      await tid(page, 'sheet-row-A1.0').click();
      await expect(tid(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A1.0');
      // A0.0 to E2.0 (audit S13 row): eight sheet rows, the set selector, Add sheet and the property import button.
      expect(await expectAllTouchTargets(page, tid(page, 'sheets-panel'))).toBeGreaterThanOrEqual(
        11,
      );
      const nav = tid(page, 'sheets-previous').locator('xpath=..');
      expect(await expectTouchTargets(page, nav)).toBeGreaterThanOrEqual(2);
    },
  );

  test(
    'EZD-1980 Cabinets tool: the library panel controls are at least 44 px @ipad',
    { tag: ['@ipad'] },
    async ({ page, signInAs }) => {
      await editorWithRoom(page, signInAs);
      await page.keyboard.press('c');
      await expect(tid(page, 'cabinet-library')).toBeVisible();
      await expect(tid(page, 'cabinet-library-trim-row')).toBeVisible();
      await expect(tid(page, 'cabinet-library-line')).toBeVisible();
      await expectAllTouchTargets(page, tid(page, 'cabinet-library'));
    },
  );
});
