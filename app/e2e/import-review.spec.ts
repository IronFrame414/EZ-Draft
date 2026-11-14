// EZD-307 (AC-EZD-307-1 "Review opens when detection finishes and shows the counts"; AC-EZD-307-2 "Show 3D mesh
// toggles the mesh"; AC-EZD-303-2 is tested here by EZD-303's own text). Untagged, so desktop 1600 x 1000. The test
// makes its own company (never tenant 1); its jobs, stored objects and company are removed in afterAll.
// Expected values: the unjoined fixture's walls, door, window and room (fixtures/synthetic/room-12x10.dxf.expected
// .json `semantic`, `roomPolygon`; room-12x10-unjoined.dxf.expected.json: only the east wall changes, 118 in with
// one joined end), confidences by EZD-302's recorded scoring (east wall 95 - 25 = 70; other walls 95; door with leaf
// 90; window of three lines 90; closed room 90) and the cutoff 80 (vault/build/assumptions.md EZD-302, EZD-307):
// 7 found, 6 high confidence, 1 to check; Accepted 3 walls, 1 window, 1 door, 1 room. Labels and the status bar
// follow board S02.
import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);

function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}

const DXF = path.join(repoRoot(), 'fixtures/synthetic/room-12x10-unjoined.dxf');
const GLB = path.join(repoRoot(), 'fixtures/synthetic/room-12x10-sloped.glb');

test.describe('EZD-307 Import review', () => {
  let tenant = '';
  let projectId = '';

  test.afterAll(async () => {
    try {
      if (tenant) {
        await harnessSql()`delete from public.job where tenant_id = ${tenant}::uuid`;
        const rows = await harnessSql()<{ storage_path: string }[]>`
          select storage_path from public.source_file where tenant_id = ${tenant}::uuid`;
        if (rows.length > 0)
          await adminDb()
            .storage.from('sources')
            .remove(rows.map((r) => r.storage_path));
      }
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-307 review opens when detection finishes with the counts, and Show 3D mesh toggles the mesh (AC-1, AC-2)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    await signInAs(m.email);
    await page.goto('/');

    await tid(page, 'projects-new').click();
    await tid(page, 'projects-new-file').click();
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Review Ln');
    await tid(page, 'new-project-next').click();
    await tid(page, 'upload-input').setInputFiles([DXF, GLB]);
    await expect(tid(page, 'upload-file')).toHaveCount(2);
    await expect(tid(page, 'upload-file').nth(0)).toHaveAttribute('data-kind', 'polycam_dxf');
    await expect(tid(page, 'upload-file').nth(1)).toHaveAttribute('data-kind', 'polycam_glb');
    await tid(page, 'new-project-create').click();

    // Continue to review opens Import review for the import's detection job.
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/import\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    projectId = page.url().split('/').at(-3) as string;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/);

    // AC-EZD-307-1: the review opens by itself when detection finishes and shows the counts.
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 90_000,
    });
    await expect(tid(page, 'import-review-summary')).toHaveText(
      '7 found · 6 high confidence · 1 to check',
    );
    const accepted = tid(page, 'import-review-accepted');
    await expect(accepted.locator('[data-count=walls]')).toHaveText('3');
    await expect(accepted.locator('[data-count=windows]')).toHaveText('1');
    await expect(accepted.locator('[data-count=doors]')).toHaveText('1');
    await expect(accepted.locator('[data-count=rooms]')).toHaveText('1');
    await expect(accepted.locator('[data-count=fixtures]')).toHaveText('0');
    await expect(tid(page, 'import-review-row')).toHaveCount(1);
    await expect(tid(page, 'import-review-row')).toHaveText('East wall70%');
    await expect(tid(page, 'import-review-inspector')).toContainText(
      'Wall · existing · 70% confidence',
    );
    await expect(tid(page, 'import-review-scan')).toHaveText(`9' 10"`);
    await expect(tid(page, 'review-item')).toHaveCount(7);
    await expect(page.locator('[data-testid=review-item][data-state=to_check]')).toHaveCount(0);
    await expect(page.locator('[data-testid=review-item][data-state=selected]')).toHaveCount(1);
    await expect(page.locator('[data-testid=review-item][data-state=accepted]')).toHaveCount(6);
    await expect(tid(page, 'import-review-project')).not.toHaveText('');
    await expect(tid(page, 'import-review-subtitle')).toHaveText(
      'Importing Polycam scan · room-12x10-unjoined.dxf + room-12x10-sloped.glb',
    );
    await expect(page.getByText('Polycam Space · DXF + GLB')).toBeVisible();
    await expect(tid(page, 'import-review-finish')).toBeDisabled();

    // Zoom stack: step zoom shows in the status bar.
    await expect(tid(page, 'import-review-zoom')).toHaveText('100%');
    await tid(page, 'review-zoom-stack').getByRole('button', { name: 'Zoom in' }).click();
    await expect(tid(page, 'import-review-zoom')).toHaveText('125%');
    await tid(page, 'review-zoom-stack').getByRole('button', { name: 'Zoom out' }).click();
    await expect(tid(page, 'import-review-zoom')).toHaveText('100%');

    // AC-EZD-307-2: Show 3D mesh turns the GLB mesh on, off and on again.
    const toggle = tid(page, 'review-mesh-toggle');
    const mesh = tid(page, 'review-mesh');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(mesh).toHaveAttribute('data-mesh', 'off');
    await expect(mesh).toBeHidden();
    await toggle.click();
    await expect(mesh).toHaveAttribute('data-mesh', 'shown', { timeout: 30_000 });
    await expect(mesh).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(mesh).toHaveAttribute('data-mesh', 'hidden');
    await expect(mesh).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(mesh).toHaveAttribute('data-mesh', 'shown');
    await expect(mesh).toBeVisible();
  });
});
