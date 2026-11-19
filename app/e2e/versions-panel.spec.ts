// EZD-122 V1-V2 (AC-EZD-122-2 to -10). Desktop 1600 x 1000, untagged. Each test makes its own company with fixture S
// (app/test-harness/projects-fixture.ts, P1 "bravo") and its own member, as left-panel.spec.ts. Checkpoints are
// written through private.make_checkpoint, as Stop editing writes them. Expected values: board S20 (groups, "Stop
// editing" cause, "Viewing <label> · read-only", "Sent N · Snapshots N · Working N", "Revert to this"); S20 Entry
// points (the header version text opens the tab); S20 Permissions (controls the user lacks are hidden); Q-0700 03
// "Revert" (the editor reloads on the chosen version; a new working row "Revert from <label>"); EZD-225 read-only
// state (the drawing tools paused).
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
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

type Obj = { id: string; type: string; data: Record<string, unknown> };
type Window2 = {
  __ezdraftEditor: {
    objects(): Obj[];
    edit(changes: Array<{ id: string; value: unknown }>): string[];
  };
};

const id = (page: Page, testId: string) => page.getByTestId(testId);
const objects = (page: Page): Promise<Obj[]> =>
  page.evaluate(() => (window as unknown as Window2).__ezdraftEditor.objects());

async function openReady(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await expect(id(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready');
}

async function checkpoint(projectId: string, appUserId: string): Promise<string> {
  const [row] = await harnessSql()<{ id: string }[]>`
    select private.make_checkpoint(${projectId}::uuid, ${appUserId}::uuid, 'stop_editing') as id`;
  return row.id;
}

test.describe('EZD-122 Versions panel', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-122 V1 @smoke the header opens Versions; a row opens read-only; Name snapshot; Revert reloads the chosen version', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects', 'edit_model'] as never);
    await harnessSql()`update public.app_user set name = 'Dana Ruiz' where id = ${user.appUserId}::uuid`;
    await signInAs(user.email);

    await openReady(page, ids.P1);
    // AC-9: no checkpoint yet, only the Working copy row.
    await id(page, 'editor-version').click();
    await expect(id(page, 'left-panel-tab-versions')).toHaveAttribute('aria-selected', 'true');
    await expect(id(page, 'version-working-copy')).toHaveText('Working copy');
    await expect(id(page, 'version-row')).toHaveCount(0);
    await expect(id(page, 'versions-counts')).toHaveText('Sent 0 · Snapshots 0 · Working 0');

    // A checkpoint of the model as it is, then one more wall in the working copy.
    await checkpoint(ids.P1, user.appUserId);
    const before = (await objects(page)).length;
    const floor = (await objects(page)).find((o) => o.type === 'floor')!.id;
    const made = createWallData({
      start: { x: 0, y: 0 },
      end: { x: 144, y: 0 },
      level: floor,
      thicknessSide: 'right',
      status: 'new',
    });
    if (!made.ok) throw new Error('wall data');
    const wallId = crypto.randomUUID();
    await page.evaluate((c) => (window as unknown as Window2).__ezdraftEditor.edit([c]), {
      id: wallId,
      value: { type: 'wall', schemaVersion: CURRENT_SCHEMA_VERSION, data: made.data },
    });
    await expect(id(page, 'save-state')).toHaveText('Saved just now', { timeout: 15_000 });
    expect((await objects(page)).length).toBe(before + 1);

    // AC-2: the list is read again when the tab opens.
    await id(page, 'left-panel-tab-layers').click();
    await id(page, 'left-panel-tab-versions').click();
    await expect(id(page, 'versions-group-working')).toHaveText('Working versions');
    await expect(id(page, 'version-row')).toHaveCount(1);
    await expect(id(page, 'version-row')).toContainText('Stop editing · Dana Ruiz');
    await expect(id(page, 'versions-counts')).toHaveText('Sent 0 · Snapshots 0 · Working 1');

    // AC-3, -10: read-only on the canvas, with the drawing tools paused; Back returns.
    await id(page, 'version-row').click();
    await expect(id(page, 'versions-viewing')).toHaveText(/^Viewing .+ · read-only$/);
    await expect(id(page, 'version-inspector')).toBeVisible();
    await expect(page.locator('[data-rail-tool="wall"]')).toBeDisabled();
    await id(page, 'versions-back').click();
    await expect(id(page, 'versions-viewing')).toHaveCount(0);
    await expect(page.locator('[data-rail-tool="wall"]')).toBeEnabled();

    // AC-4: Name snapshot; the row moves to Named snapshots.
    await id(page, 'version-row').click();
    await expect(id(page, 'version-name-snapshot')).toBeDisabled();
    await id(page, 'version-snapshot-name').fill('Before the new wall');
    await id(page, 'version-name-snapshot').click();
    await expect(id(page, 'version-row')).toContainText('Before the new wall');
    await expect(id(page, 'versions-counts')).toHaveText('Sent 0 · Snapshots 1 · Working 0');
    await expect(id(page, 'version-name-snapshot')).toHaveCount(0);

    // AC-5: Revert reloads the editor on the chosen version: the new wall is gone.
    await id(page, 'version-revert').click();
    // The editor reopens: the test hook is gone while it loads, then the reopened model has no new wall.
    await expect
      .poll(() =>
        page.evaluate(
          (w) =>
            (window as unknown as Partial<Window2>).__ezdraftEditor
              ?.objects()
              .some((o) => o.id === w) ?? null,
          wallId,
        ),
      )
      .toBe(false);
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    expect((await objects(page)).length).toBe(before);
    await expect(id(page, 'versions-counts')).toHaveText('Sent 0 · Snapshots 1 · Working 2');
    await expect(
      id(page, 'version-row').filter({ hasText: 'Revert from Before the new wall' }),
    ).toHaveCount(1);
  });

  test('EZD-122 V2 without Edit model a version opens read-only with no Name snapshot and no Revert (AC-EZD-122-6)', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects'] as never);
    await checkpoint(ids.P1, user.appUserId);
    await signInAs(user.email);

    await openReady(page, ids.P1);
    await id(page, 'editor-version').click();
    await id(page, 'version-row').click();
    await expect(id(page, 'versions-viewing')).toHaveText(/^Viewing .+ · read-only$/);
    await expect(id(page, 'version-inspector')).toBeVisible();
    await expect(id(page, 'version-name-snapshot')).toHaveCount(0);
    await expect(id(page, 'version-revert')).toHaveCount(0);
  });
});
