// EZD-307 (AC-EZD-307-1 "Review opens when detection finishes and shows the counts"; AC-EZD-307-2 "Show 3D mesh
// toggles the mesh"; AC-EZD-303-2 is tested here by EZD-303's own text). Untagged, so desktop 1600 x 1000. The test
// makes its own company (never tenant 1); its jobs, stored objects and company are removed in afterAll.
// Expected values: the unjoined fixture's walls, door, window and room (fixtures/synthetic/room-12x10.dxf.expected
// .json `semantic`, `roomPolygon`; room-12x10-unjoined.dxf.expected.json: only the east wall changes, 118 in with
// one joined end), confidences by EZD-302's recorded scoring (east wall 95 - 25 = 70; other walls 95; door with leaf
// 90; window of three lines 90; closed room 90) and the cutoff 80 (vault/build/assumptions.md EZD-302, EZD-307):
// 7 found, 6 high confidence, 1 to check; Accepted 0 of each until Accept N (EZD-308 counts decisions). Labels and
// the status bar follow board S02.
// EZD-308 (AC-EZD-308-1 "Accept N accepts only items above the cutoff"): the company's Defaults cutoff is then set
// to 91, so only the three 95 walls are high confidence: Accept 3 accepts exactly them; the 90 door, window and
// room and the 70 east wall stay To check.
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
    for (const kind of ['walls', 'windows', 'doors', 'rooms', 'fixtures']) {
      await expect(accepted.locator(`[data-count=${kind}]`)).toHaveText('0');
    }
    await expect(tid(page, 'import-review-accept-n')).toHaveText('Accept 6');
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

    // EZD-308 AC-EZD-308-1: with the company cutoff at 91, Accept N accepts only the three 95 walls.
    await harnessSql()`update public.tenant set defaults = defaults || '{"high_confidence_cutoff": 91}'::jsonb
      where id = ${tenant}::uuid`;
    await page.reload();
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
    await expect(tid(page, 'import-review-summary')).toHaveText(
      '7 found · 3 high confidence · 4 to check',
    );
    const acceptN = tid(page, 'import-review-accept-n');
    await expect(acceptN).toHaveText('Accept 3');
    await acceptN.click();
    await expect(accepted.locator('[data-count=walls]')).toHaveText('3');
    for (const kind of ['windows', 'doors', 'rooms', 'fixtures']) {
      await expect(accepted.locator(`[data-count=${kind}]`)).toHaveText('0');
    }
    await expect(acceptN).toHaveText('Accept 0');
    await expect(acceptN).toBeDisabled();
    await expect(page.locator('[data-testid=review-item][data-decision=accepted]')).toHaveCount(3);
    // The accepted three are walls (lines), and the door, window, room and east wall are still To check.
    await expect(page.locator('line[data-testid=review-item][data-decision=accepted]')).toHaveCount(3);
    await expect(tid(page, 'import-review-row')).toHaveCount(4);
    for (const label of ['Door D1', 'Window W1', 'Room 1', 'East wall']) {
      await expect(tid(page, 'import-review-row').filter({ hasText: label })).toHaveCount(1);
    }
    await expect(tid(page, 'import-review-summary')).toHaveText(
      '7 found · 3 high confidence · 4 to check',
    );

    // One by one: every item in detection order, starting at the first unresolved one (the east wall, the only
    // unresolved wall); Reject removes the item and moves to the next; Previous goes back.
    await page.locator('[data-testid=import-review-mode][data-mode=one_by_one]').click();
    await expect(tid(page, 'import-review-row')).toHaveCount(7);
    const position = tid(page, 'import-review-position');
    await expect(tid(page, 'import-review-inspector')).toContainText('East wall');
    const start = Number(((await position.textContent()) ?? '').split(' ')[0]);
    expect(start).toBeGreaterThanOrEqual(1);
    expect(start).toBeLessThan(7);
    await expect(position).toHaveText(`${start} of 7`);
    await tid(page, 'import-review-reject').click();
    await expect(position).toHaveText(`${start + 1} of 7`);
    await tid(page, 'import-review-previous').click();
    await expect(position).toHaveText(`${start} of 7`);
    await expect(tid(page, 'import-review-inspector')).toContainText('Rejected');
    await tid(page, 'import-review-next').click();
    await expect(position).toHaveText(`${start + 1} of 7`);
    await expect(tid(page, 'review-item')).toHaveCount(6);
    await expect(tid(page, 'import-review-summary')).toHaveText(
      '7 found · 3 high confidence · 3 to check',
    );

    // By room: the room's items under Room 1; nothing high confidence is left for Accept room.
    await page.locator('[data-testid=import-review-mode][data-mode=by_room]').click();
    await expect(tid(page, 'import-review-room')).toHaveCount(1);
    await expect(tid(page, 'import-review-room')).toContainText('Room 1');
    await expect(tid(page, 'import-review-accept-room')).toBeDisabled();
  });
});

// EZD-306 (AC-EZD-306-1 "Choosing two layers writes import review items only from those layers"; S01 DXF:
// conversion choice; S02 Decisions "lists only items from the layers chosen for conversion"). The synthetic room as
// an architect DXF (tag DXF drawing): after upload the conversion choice lists its four entity layers (expected.json
// `entitiesByLayer`); Convert some layers with only WALLS and DOORS checked gives a review of the walls and the one
// door: the fixture's 4 walls plus 1, since without WINDOWS the south wall's 36" window gap is not bridged (see
// import.db.test.ts), and 1 door; no window and no room.
test.describe('EZD-306 DXF conversion choice', () => {
  const CLEAN = path.join(repoRoot(), 'fixtures/synthetic/room-12x10.dxf');
  let tenant = '';

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

  test('EZD-306 choosing two layers gives review items only from those layers (AC-1)', async ({
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
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('14 Layer Ln');
    await tid(page, 'new-project-next').click();
    await tid(page, 'upload-input').setInputFiles([CLEAN]);
    await tid(page, 'upload-file-tag').selectOption('dxf');
    await expect(tid(page, 'upload-file')).toHaveAttribute('data-kind', 'dxf');
    await tid(page, 'new-project-create').click();

    const dialog = tid(page, 'dxf-conversion');
    await expect(dialog).toBeVisible({ timeout: 60_000 });
    await expect(dialog).toContainText('Convert room-12x10.dxf');
    const layers = tid(page, 'dxf-layer');
    await expect(layers).toHaveCount(4);
    expect(await layers.evaluateAll((els) => els.map((e) => e.getAttribute('data-layer')))).toEqual([
      'DOORS',
      'ROOMS',
      'WALLS',
      'WINDOWS',
    ]);
    await tid(page, 'dxf-conversion-some').check();
    for (const name of ['ROOMS', 'WINDOWS']) {
      await page.locator(`[data-testid=dxf-layer][data-layer=${name}] [data-testid=dxf-layer-check]`).uncheck();
    }
    await tid(page, 'dxf-conversion-continue').click();

    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/import\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 90_000,
    });
    await expect(tid(page, 'review-item')).toHaveCount(6);
    type Item = { type: string; kind?: string; layer: string };
    const rows = await harnessSql()<{ items: Item[] }[]>`
      select items from public.import_session where tenant_id = ${tenant}::uuid`;
    expect(rows).toHaveLength(1);
    const items = rows[0].items;
    expect(new Set(items.map((i) => i.layer))).toEqual(new Set(['WALLS', 'DOORS']));
    expect(items.filter((i) => i.type === 'wall')).toHaveLength(5);
    expect(items.filter((i) => i.type === 'opening').map((i) => i.kind)).toEqual(['door']);
    expect(items.filter((i) => i.type === 'room')).toHaveLength(0);
  });
});
