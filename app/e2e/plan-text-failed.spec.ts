// Copies of plan-zoom-hover-text.spec.ts helpers (EZD-207b).
// EZD-376 B1, B2 (vault/plans/EZD-376.md section 4; AC-EZD-376-1, -2). Untagged (project desktop). Every test makes its
// own company (never tenant 1) with fixture S and its own member.
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
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

const EDITOR = ['view_projects', 'edit_model'];
const TEXT =
  "Couldn't show the room names and measurements on the plan. Reload the page to try again.";

async function fixtureS(permissions: string[] = EDITOR) {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { tenant, ids, user: m };
}

type PlanHook = {
  stats(): { glyphs: number };
};
type EditorHook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edit(changes: unknown[]): string[];
};
type Window2 = {
  __ezdraftPlan: PlanHook;
  __ezdraftEditor: EditorHook;
};

const editorState = (page: Page) => page.getByTestId('editor-state');
const planCanvas = (page: Page) => page.getByTestId('plan-canvas');
const stack = (page: Page) => page.getByTestId('zoom-stack');

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(editorState(page)).toHaveAttribute('data-editor-state', 'ready');
  await expect(planCanvas(page)).toHaveAttribute('data-plan-state', 'ready');
}

const stat = (page: Page, name: 'glyphs') =>
  page.evaluate((n) => (window as unknown as Window2).__ezdraftPlan.stats()[n], name);

async function floorId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const floor = (window as unknown as Window2).__ezdraftEditor
      .objects()
      .find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return floor.id;
  });
}

async function addR1(page: Page): Promise<void> {
  const level = await floorId(page);
  await page.evaluate(
    (c) => (window as unknown as Window2).__ezdraftEditor.edit(c),
    [
      {
        id: crypto.randomUUID(),
        value: {
          type: 'room',
          schemaVersion: CURRENT_SCHEMA_VERSION,
          data: {
            geometry: {
              boundary: [
                { x: 0, y: 0 },
                { x: 141.5, y: 0 },
                { x: 141.5, y: 168 },
                { x: 0, y: 168 },
              ],
            },
            status: 'existing',
            level,
            attributes: { name: 'Kitchen' },
            closureOverride: null,
          },
        },
      },
    ],
  );
}

test.describe('EZD-376 plan text failed message', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-376 B1 when the plan cannot draw its text, one message shows over the plan and the plan stays', async ({
    page,
    signInAs,
  }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await page.addInitScript(() => {
      FontFaceSet.prototype.load = function () {
        return Promise.reject(new Error('EZD-376 stub: font load refused'));
      };
    });
    await openReady(page, ids.P1);
    const banner = editorState(page).getByTestId('plan-text-failed-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByTestId('plan-text-failed-banner')).toHaveCount(1);
    await expect(banner.locator('[role="alert"][data-state="error"]')).toHaveText(TEXT);
    await expect(banner.getByRole('button')).toHaveCount(0);
    await expect(planCanvas(page)).toHaveAttribute('data-plan-state', 'ready');
    await expect(stack(page)).toBeVisible();
    expect(await stat(page, 'glyphs')).toBe(0);
  });

  test('EZD-376 B2 when the atlas loads, no message shows', async ({ page, signInAs }) => {
    const { ids, user } = await fixtureS();
    await signInAs(user.email);
    await openReady(page, ids.P1);
    await addR1(page);
    await expect.poll(() => stat(page, 'glyphs')).toBe(13);
    await expect(page.getByTestId('plan-text-failed-banner')).toHaveCount(0);
  });
});
