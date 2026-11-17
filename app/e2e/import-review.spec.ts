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
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
    ]);
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
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });
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
    await expect(page.locator('line[data-testid=review-item][data-decision=accepted]')).toHaveCount(
      3,
    );
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
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
    ]);
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
    expect(await layers.evaluateAll((els) => els.map((e) => e.getAttribute('data-layer')))).toEqual(
      ['DOORS', 'ROOMS', 'WALLS', 'WINDOWS'],
    );
    await tid(page, 'dxf-conversion-some').check();
    for (const name of ['ROOMS', 'WINDOWS']) {
      await page
        .locator(`[data-testid=dxf-layer][data-layer=${name}] [data-testid=dxf-layer-check]`)
        .uncheck();
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

// EZD-309 (AC-EZD-309-1 "A fixed wall is written in its fixed position on Finish"; AC-EZD-309-2 "reloading
// mid-review restores accepted and fixed items"; S02 Controls Fix selected, Drag endpoint, Delete, Click item on
// canvas, Hover item, Esc, Ctrl/Cmd+Z). The unjoined fixture's east wall runs from (144, 0) to (144, 118), 2 in short
// of the north-east corner (room-12x10-unjoined.dxf.expected.json `change`); Fix selected and a drag of its north
// end to the corner make it 120 in, 10' 0" (the scan read stays 9' 10"). The door is deleted, undone and redone.
// After the 2-second save reaches the database, a reload shows the fix, the decisions and the mode again, and the
// saved rows are what Finish import (EZD-313) writes: the east wall at (144, 120).
test.describe('EZD-309 Fix and delete', () => {
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

  test('EZD-309 a fixed wall and a deleted door survive a reload (AC-1, AC-2)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
    ]);
    await signInAs(m.email);
    await page.goto('/');

    await tid(page, 'projects-new').click();
    await tid(page, 'projects-new-file').click();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('16 Fix Ln');
    await tid(page, 'new-project-next').click();
    await tid(page, 'upload-input').setInputFiles([DXF]);
    await expect(tid(page, 'upload-file')).toHaveAttribute('data-kind', 'polycam_dxf');
    await tid(page, 'new-project-create').click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/import\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const jobId = page.url().split('/').at(-1) as string;
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 90_000,
    });

    // The east wall is the one item to check, selected at first.
    await expect(tid(page, 'import-review-row')).toHaveText('East wall70%');
    const eastId = (await tid(page, 'import-review-row').getAttribute('data-id')) as string;
    const eastLine = page.locator(`line[data-testid=review-item][data-id="${eastId}"]`);

    // Fix selected shows the wall's two end handles; Esc leaves Fix mode.
    const fix = tid(page, 'import-review-fix');
    await fix.click();
    await expect(fix).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'review-handle')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(fix).toHaveAttribute('aria-pressed', 'false');
    await expect(tid(page, 'review-handle')).toHaveCount(0);

    // Drag the north end (the upper handle on screen) 2 in up, onto the corner; the live length reads 10' 0".
    await fix.click();
    const boxes = await Promise.all(
      [0, 1].map(async (i) => (await tid(page, 'review-handle').nth(i).boundingBox())!),
    );
    const [top, bottom] = [...boxes].sort((a, b) => a.y - b.y);
    const ppi = (bottom.y - top.y) / 118;
    const x = top.x + top.width / 2;
    const y = top.y + top.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - ppi, { steps: 3 });
    await page.mouse.move(x, y - 2 * ppi, { steps: 3 });
    await expect(tid(page, 'review-live-dimension')).toHaveText(`10' 0"`);
    await page.mouse.up();
    await expect(tid(page, 'review-live-dimension')).toHaveCount(0);
    await expect(tid(page, 'import-review-summary')).toHaveText(
      '7 found · 6 high confidence · 0 to check',
    );
    const ends = async () =>
      [await eastLine.getAttribute('y1'), await eastLine.getAttribute('y2')]
        .map(Number)
        .sort((a, b) => a - b);
    expect(await ends()).toEqual([0, 120]);

    // One by one: every item listed; the east wall reads Fixed with the scan's 9' 10".
    await page.locator('[data-testid=import-review-mode][data-mode=one_by_one]').click();
    await page.locator(`[data-testid=import-review-row][data-id="${eastId}"]`).click();
    await expect(tid(page, 'import-review-decision')).toHaveText('Fixed');
    await expect(tid(page, 'import-review-scan')).toHaveText(`9' 10"`);

    // Click on the canvas selects: the west wall; hover shows its name and confidence.
    const westId = (await tid(page, 'import-review-row')
      .filter({ hasText: 'West wall' })
      .getAttribute('data-id')) as string;
    // A vertical line's box has no width, so Playwright calls it hidden; the mouse goes to its midpoint instead.
    const westBox = (await page
      .locator(`[data-testid=review-hit][data-id="${westId}"]`)
      .boundingBox())!;
    const wx = westBox.x + westBox.width / 2;
    const wy = westBox.y + westBox.height / 2;
    await page.mouse.move(wx, wy);
    await expect(tid(page, 'review-hover')).toHaveText('West wall · 95%');
    await page.mouse.click(wx, wy);
    await expect(tid(page, 'import-review-inspector')).toContainText('West wall');

    // Delete the door; undo brings it back, redo deletes it again.
    const doorRow = tid(page, 'import-review-row').filter({ hasText: 'Door D1' });
    const doorId = (await doorRow.getAttribute('data-id')) as string;
    await doorRow.click();
    await tid(page, 'import-review-delete').click();
    await expect(doorRow).toHaveAttribute('data-decision', 'rejected');
    await expect(page.locator(`[data-testid=review-item][data-id="${doorId}"]`)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(doorRow).toHaveAttribute('data-decision', 'none');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(doorRow).toHaveAttribute('data-decision', 'rejected');

    // The saver sends within 2 s; wait until the database holds the review as it stands.
    const saved = async () =>
      (
        await harnessSql()<{ item_id: string; decision: string | null; fix: unknown }[]>`
          select r.item_id, r.decision, r.fix from public.import_review_item r
          where r.job_id = ${jobId}::uuid order by r.item_id`
      ).map((r) => `${r.item_id}:${r.decision}:${r.fix ? 'fix' : '-'}`);
    await expect
      .poll(saved, { timeout: 15_000 })
      .toEqual([`${doorId}:rejected:-`, `${eastId}:accepted:fix`].sort());
    await expect
      .poll(
        async () =>
          (
            await harnessSql()<{ mode: string }[]>`
              select mode from public.import_session where job_id = ${jobId}::uuid`
          )[0]?.mode,
        { timeout: 15_000 },
      )
      .toBe('one_by_one');

    // AC-EZD-309-2: a reload restores the mode, the fixed wall where it was fixed and the deleted door.
    await page.reload();
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });
    await expect(tid(page, 'import-review-modes')).toHaveAttribute('data-mode', 'one_by_one');
    expect(await ends()).toEqual([0, 120]);
    await expect(
      page.locator(`[data-testid=import-review-row][data-id="${eastId}"]`),
    ).toHaveAttribute('data-decision', 'accepted');
    await expect(
      page.locator(`[data-testid=import-review-row][data-id="${doorId}"]`),
    ).toHaveAttribute('data-decision', 'rejected');
    await expect(page.locator(`[data-testid=review-item][data-id="${doorId}"]`)).toHaveCount(0);
    await page.locator(`[data-testid=import-review-row][data-id="${eastId}"]`).click();
    await expect(tid(page, 'import-review-decision')).toHaveText('Fixed');

    // AC-EZD-309-1: the saved fix is the wall's fixed position, the geometry Finish import writes.
    const [row] = await harnessSql()<
      { fix: { geometry: { start: { x: number; y: number }; end: { x: number; y: number } } } }[]
    >`
      select fix from public.import_review_item where job_id = ${jobId}::uuid and item_id = ${eastId}`;
    const pts = [row.fix.geometry.start, row.fix.geometry.end].sort((a, b) => a.y - b.y);
    expect(pts).toEqual([
      { x: 144, y: 0 },
      { x: 144, y: 120 },
    ]);
  });
});

// EZD-310 (AC-EZD-310-1 "A typed value beyond tolerance lists every conflict it creates"; S02 Typed or laser
// input, Conflict list "Click a line to zoom to it"). Expected values by hand from the fixture: the room's corners
// run (0,0), (144,0), (144,120), (0,120) (room-12x10.dxf.expected.json roomPolygon), so the walk goes south, east,
// north, west from the southwest corner; the east wall scans 118 in (room-12x10-unjoined.dxf.expected.json). Typed
// 10' (120 in, 2 in over, beyond the 1/2" fallback tolerance): the walk ends 2" short of the southwest corner. The
// door and window are on the south wall, before the east wall in the walk, so nothing else is listed.
test.describe('EZD-310 Typed vs scan conflicts', () => {
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

  test('EZD-310 a typed east wall lists the gap it creates, zooms to it and survives a reload (AC-1)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
    ]);
    await signInAs(m.email);
    await page.goto('/');

    await tid(page, 'projects-new').click();
    await tid(page, 'projects-new-file').click();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('17 Typed Ln');
    await tid(page, 'new-project-next').click();
    await tid(page, 'upload-input').setInputFiles([DXF]);
    await expect(tid(page, 'upload-file')).toHaveAttribute('data-kind', 'polycam_dxf');
    await tid(page, 'new-project-create').click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/import\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const jobId = page.url().split('/').at(-1) as string;
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 90_000,
    });

    // The east wall is selected at first: no typed value, scan 9' 10", no conflict.
    await expect(tid(page, 'import-review-row')).toHaveText('East wall70%');
    const eastId = (await tid(page, 'import-review-row').getAttribute('data-id')) as string;
    const typed = tid(page, 'import-review-typed');
    await expect(typed).toHaveValue('');
    await expect(tid(page, 'import-review-scan')).toHaveText(`9' 10"`);
    await expect(tid(page, 'import-review-conflict')).toHaveCount(0);
    await expect(tid(page, 'import-review-tolerance')).toHaveText(
      'Tolerance 1/2" · shared with field measurements',
    );

    // A length outside the formats is refused with the formats message.
    await typed.fill('12 6');
    await typed.press('Enter');
    await expect(tid(page, 'import-review-typed-refused')).toHaveText(
      `Use 12'6", 12' 6 1/2", 150" or 12.5'`,
    );

    // Typed 10' (as a keyboard-mode laser would: text then Enter): typed wins and the list shows the gap only.
    await typed.fill(`10'`);
    await typed.press('Enter');
    await expect(typed).toHaveValue(`10' 0"`);
    await expect(tid(page, 'import-review-conflict-pill')).toHaveText('Conflict');
    await expect(tid(page, 'import-review-conflicts')).toContainText('Typed wins. This creates');
    await expect(tid(page, 'import-review-conflict')).toHaveText([
      'Room no longer closes: 2" gap at the southwest corner',
    ]);
    await expect(tid(page, 'import-review-conflict')).toHaveAttribute('data-severity', 'error');
    await expect(tid(page, 'review-gap')).toHaveText('2" gap');

    // Click the line: the canvas zooms to the gap.
    await expect(tid(page, 'import-review-zoom')).toHaveText('100%');
    await tid(page, 'import-review-conflict').click();
    await expect(tid(page, 'import-review-zoom')).toHaveText('400%');

    // The typed value is saved with the wall's fix and comes back on reload with its conflict.
    await expect
      .poll(
        async () =>
          (
            await harnessSql()<{ fix: { typed?: number } | null }[]>`
              select fix from public.import_review_item
              where job_id = ${jobId}::uuid and item_id = ${eastId}`
          )[0]?.fix?.typed ?? null,
        { timeout: 15_000 },
      )
      .toBe(120);
    await page.reload();
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });
    await page.locator('[data-testid=import-review-mode][data-mode=one_by_one]').click();
    await page.locator(`[data-testid=import-review-row][data-id="${eastId}"]`).click();
    await expect(typed).toHaveValue(`10' 0"`);
    await expect(tid(page, 'import-review-conflict')).toHaveText([
      'Room no longer closes: 2" gap at the southwest corner',
    ]);

    // Within the tolerance (9' 10 1/4", 1/4" over the scan) typed still wins but nothing is listed.
    await typed.fill(`9' 10 1/4"`);
    await typed.press('Enter');
    await expect(typed).toHaveValue(`9' 10 1/4"`);
    await expect(tid(page, 'import-review-conflict')).toHaveCount(0);
    await expect(tid(page, 'import-review-conflict-pill')).toHaveCount(0);
    await expect(tid(page, 'review-gap')).toHaveCount(0);
  });
});

// EZD-311 (AC-EZD-311-1 "Finish stays blocked until the gap is resolved"; S02 Controls Pick the wall that absorbs it,
// Keep the room out of square, Esc; Q-0630). The east wall typed 10' 0" (2 in over its 118 in scan) leaves the
// room 2 in open (EZD-310). Every item resolved, Finish is still blocked by the gap. Picking the west wall (scan
// 10' 0", interior length of the fixture's west wall) gives it 10' 2", which closes the room: Finish is no longer
// blocked. Undo opens the gap again; Keep the room out of square resolves it, and stays resolved after a reload.
// Finish import stays disabled until EZD-313 builds it; data-blocked carries the rule.
test.describe('EZD-311 Resolve the gap', () => {
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

  test('EZD-311 Finish stays blocked until the gap is absorbed or kept (AC-1)', async ({ page, signInAs }) => {
    test.setTimeout(180_000);
    tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
    ]);
    await signInAs(m.email);
    await page.goto('/');
    // A real click at an element's middle (a vertical line's box has no width, so Playwright calls it hidden).
    const clickAt = async (selector: string) => {
      const box = (await page.locator(selector).first().boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };

    await tid(page, 'projects-new').click();
    await tid(page, 'projects-new-file').click();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('19 Gap Ln');
    await tid(page, 'new-project-next').click();
    await tid(page, 'upload-input').setInputFiles([DXF]);
    await expect(tid(page, 'upload-file')).toHaveAttribute('data-kind', 'polycam_dxf');
    await tid(page, 'new-project-create').click();
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/import\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const jobId = page.url().split('/').at(-1) as string;
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 90_000,
    });
    const finish = tid(page, 'import-review-finish');
    await expect(finish).toHaveAttribute('data-blocked', 'true');

    // The east wall typed 10' 0" (it is accepted with its fix), then Accept 6 resolves every other item.
    const typed = tid(page, 'import-review-typed');
    await typed.fill(`10'`);
    await typed.press('Enter');
    await expect(tid(page, 'review-gap')).toHaveText('2" gap');
    await tid(page, 'import-review-accept-n').click();
    await expect(tid(page, 'import-review-summary')).toContainText('0 to check');
    // Every item is resolved, but the room does not close: Finish stays blocked.
    await expect(finish).toHaveAttribute('data-blocked', 'true');
    await expect(finish).toBeDisabled();

    // The west wall's id, from the One by one list.
    await page.locator('[data-testid=import-review-mode][data-mode=one_by_one]').click();
    const westId = (await tid(page, 'import-review-row')
      .filter({ hasText: 'West wall' })
      .getAttribute('data-id')) as string;

    // Clicking the red marker selects the room and shows Resolve the gap.
    await clickAt('[data-testid=review-gap] rect');
    await expect(tid(page, 'gap-title')).toHaveText('Resolve the gap');
    await expect(tid(page, 'gap-size')).toHaveText('2" gap');

    // Pick mode: Esc returns to the section; a wall across the gap is refused; the west wall absorbs it.
    await tid(page, 'gap-pick').click();
    await expect(tid(page, 'gap-hint')).toHaveText('Click a wall of this room, or press Esc to go back');
    await page.keyboard.press('Escape');
    await expect(tid(page, 'gap-pick')).toBeVisible();
    await tid(page, 'gap-pick').click();
    // Back leaves pick mode without a keyboard (Q-0630), then pick again.
    await tid(page, 'gap-back').click();
    await expect(tid(page, 'gap-pick')).toBeVisible();
    await tid(page, 'gap-pick').click();
    const northId = (await tid(page, 'import-review-row')
      .filter({ hasText: 'North wall' })
      .getAttribute('data-id')) as string;
    await clickAt(`[data-testid=review-hit][data-id="${northId}"]`);
    await expect(tid(page, 'gap-alert')).toHaveText(
      'That wall runs across the gap. Pick a wall that runs the same way as the gap.',
    );
    await expect(finish).toHaveAttribute('data-blocked', 'true');
    await clickAt(`[data-testid=review-hit][data-id="${westId}"]`);
    await expect(tid(page, 'review-gap')).toHaveCount(0);
    await expect(tid(page, 'inspector-gap')).toHaveCount(0);
    await expect(finish).toHaveAttribute('data-blocked', 'false');
    await page.locator(`[data-testid=import-review-row][data-id="${westId}"]`).click();
    await expect(typed).toHaveValue(`10' 2"`);

    // Undo opens the gap again; Keep the room out of square resolves it.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(tid(page, 'review-gap')).toHaveText('2" gap');
    await expect(finish).toHaveAttribute('data-blocked', 'true');
    const roomId = (await tid(page, 'review-gap').getAttribute('data-room')) as string;
    await clickAt('[data-testid=review-gap] rect');
    await tid(page, 'gap-keep').click();
    await expect(tid(page, 'review-gap')).toHaveCount(0);
    await expect(finish).toHaveAttribute('data-blocked', 'false');

    // The kept gap is saved with the room and still resolves it after a reload.
    await expect
      .poll(
        async () =>
          (
            await harnessSql()<{ fix: { keep?: { gap: { x: number; y: number } } } | null }[]>`
              select fix from public.import_review_item
              where job_id = ${jobId}::uuid and item_id = ${roomId}`
          )[0]?.fix?.keep?.gap ?? null,
        { timeout: 15_000 },
      )
      .not.toBeNull();
    await page.reload();
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 30_000,
    });
    await expect(tid(page, 'review-gap')).toHaveCount(0);
    await expect(finish).toHaveAttribute('data-blocked', 'false');
  });
});
