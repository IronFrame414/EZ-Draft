// EZD-304 (AC-EZD-304-1 "A calibrated PDF measures a known length correctly"; S01 PDF: scale calibration "After
// upload, PDF only | Click two points on the page, type the real distance | Required before tracing. Stored in
// source_file.scale_calibration"; W2 step 1; Q-0203 never blocks, the scale can be added later). Untagged, so desktop
// 1600 x 1000. The test makes its own company (never tenant 1). Expected values come from
// fixtures/synthetic/room-12x10-vector.pdf.expected.json, written from the spec (1/4" = 1'-0", 1.5 pt per inch): the
// south interior face (504, 300)-(720, 300) is 12' 0", the west interior face (504, 300)-(504, 480) is 10' 0" = 120 in,
// and the 1224 x 792 pt sheet is 816 x 528 in. A click lands on a whole screen pixel, so each point may be off by
// half a pixel; the tolerance is that, in page points, carried through the 216 pt calibration.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);
const FIXTURE = path.resolve(__dirname, '../../fixtures/synthetic/room-12x10-vector.pdf');
type Expected = {
  view: [number, number, number, number];
  mapping: { ptPerIn: number };
  calibration: {
    from: [number, number];
    to: [number, number];
    lengthPt: number;
    lengthIn: number;
  }[];
};
const expected = JSON.parse(readFileSync(`${FIXTURE}.expected.json`, 'utf8')) as Expected;
const [south, west] = expected.calibration;
const [, , W, H] = expected.view;

type Corner = { x: number; y: number };
type Cal = { page: number; a: [number, number]; b: [number, number]; lengthIn: number };
const dist = (p: readonly number[], q: readonly number[]) => Math.hypot(q[0] - p[0], q[1] - p[1]);
// S01: the real length between two page points is their distance times the typed length over the clicked distance.
const measureIn = (cal: Cal, p: [number, number], q: [number, number]) =>
  (dist(p, q) * cal.lengthIn) / dist(cal.a, cal.b);
const readCalibration = (v: unknown): Cal | null =>
  v !== null && typeof v === 'object' && 'lengthIn' in v ? (v as Cal) : null;
type Window2 = { __ezdraftPlan?: { underlay(): Corner[] | null } };

// A page point on the drawn page (rotation 0, box from 0): x across, y up from the bottom.
// Returns half a screen pixel in page points, the most a click can be off by in each direction.
async function clickPagePoint(canvas: Locator, page: Page, p: [number, number]): Promise<number> {
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('page not drawn');
  await page.mouse.click(box.x + (p[0] / W) * box.width, box.y + ((H - p[1]) / H) * box.height);
  return Math.max(W / box.width, H / box.height) / 2;
}

test.describe('EZD-304 PDF underlay and scale', () => {
  const paths: string[] = [];

  test.afterAll(async () => {
    try {
      if (paths.length > 0) await adminDb().storage.from('sources').remove(paths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-304-1 a PDF calibrated on a 12\' 0" face measures the 10\' 0" face, and lies under the plan at scale', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    const [project] = await createProjects(tenant, 1);
    await signInAs(m.email);

    await page.goto(`/projects/${project}`);
    await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready', {
      timeout: 60_000,
    });
    await tid(page, 'editor-upload-files').click();
    await expect(tid(page, 'upload-files-dialog')).toBeVisible();
    await tid(page, 'upload-input').setInputFiles({
      name: 'existing-plan.pdf',
      mimeType: 'application/pdf',
      buffer: readFileSync(FIXTURE),
    });
    await expect(tid(page, 'upload-file')).toHaveAttribute('data-kind', 'pdf');
    await tid(page, 'upload-files-continue').click();

    // The set-scale step, after the upload.
    await expect(tid(page, 'pdf-scale')).toBeVisible({ timeout: 60_000 });
    await expect(tid(page, 'pdf-scale')).toContainText('Set the scale of existing-plan.pdf');
    const canvas = tid(page, 'pdf-scale-page');
    await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(tid(page, 'pdf-scale-hint')).toHaveText('Click the first point.');
    await expect(tid(page, 'pdf-scale-save')).toBeDisabled();
    const halfPx = await clickPagePoint(canvas, page, south.from);
    await expect(tid(page, 'pdf-scale-hint')).toHaveText('Click the second point.');
    await clickPagePoint(canvas, page, south.to);
    await expect(tid(page, 'pdf-scale-point')).toHaveCount(2);
    await expect(tid(page, 'pdf-scale-hint')).toHaveText(
      'Both points set. Click again to start over.',
    );
    await tid(page, 'pdf-scale-distance').fill(`12' 0"`);
    await tid(page, 'pdf-scale-save').click();
    await expect(tid(page, 'pdf-scale')).toHaveCount(0, { timeout: 30_000 });
    await expect(tid(page, 'upload-files-dialog')).toHaveCount(0, { timeout: 60_000 });

    const rows = await harnessSql()<
      { id: string; kind: string; storage_path: string; scale_calibration: unknown }[]
    >`select id, kind, storage_path, scale_calibration from public.source_file
      where project_id = ${project}::uuid`;
    for (const r of rows) paths.push(r.storage_path);
    expect(rows.map((r) => r.kind)).toEqual(['pdf']);
    const cal = readCalibration(rows[0].scale_calibration);
    expect(cal).not.toBeNull();
    if (cal === null) return;
    expect(cal.lengthIn).toBe(south.lengthIn);

    // Half a screen pixel at each end of the 216 pt calibration line.
    const relTol = (2 * halfPx) / (south.lengthPt - 2 * halfPx);
    const measured = measureIn(cal, west.from, west.to);
    expect(Math.abs(measured - west.lengthIn)).toBeLessThanOrEqual(west.lengthIn * relTol);

    // Required before tracing: the calibrated page lies under the plan at that scale.
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as Window2).__ezdraftPlan?.underlay() ?? null),
        {
          timeout: 60_000,
        },
      )
      .not.toBeNull();
    const corners = (await page.evaluate(
      () => (window as unknown as Window2).__ezdraftPlan?.underlay() ?? null,
    )) as Corner[];
    const widthIn = corners[1].x - corners[0].x;
    const heightIn = corners[0].y - corners[3].y;
    expect(Math.abs(widthIn - W / expected.mapping.ptPerIn)).toBeLessThanOrEqual(816 * relTol);
    expect(Math.abs(heightIn - H / expected.mapping.ptPerIn)).toBeLessThanOrEqual(528 * relTol);
    // No banner once the scale is set.
    await expect(tid(page, 'pdf-scale-banner')).toHaveCount(0);
  });

  test('Q-0203 a skipped PDF shows the banner; Set scale from the plan stores the scale', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    const [project] = await createProjects(tenant, 1);
    await signInAs(m.email);

    await page.goto(`/projects/${project}`);
    await expect(tid(page, 'plan-canvas')).toHaveAttribute('data-plan-state', 'ready', {
      timeout: 60_000,
    });
    await tid(page, 'editor-upload-files').click();
    await tid(page, 'upload-input').setInputFiles({
      name: 'later.pdf',
      mimeType: 'application/pdf',
      buffer: readFileSync(FIXTURE),
    });
    await tid(page, 'upload-files-continue').click();
    await expect(tid(page, 'pdf-scale')).toBeVisible({ timeout: 60_000 });
    await tid(page, 'pdf-scale-skip').click();
    await expect(tid(page, 'upload-files-dialog')).toHaveCount(0, { timeout: 60_000 });

    await expect(tid(page, 'pdf-scale-banner')).toContainText(
      'later.pdf has no scale yet. Set it to trace over the PDF.',
      { timeout: 30_000 },
    );
    const before = await harnessSql()<{ storage_path: string; scale_calibration: unknown }[]>`
      select storage_path, scale_calibration from public.source_file where project_id = ${project}::uuid`;
    paths.push(before[0].storage_path);
    expect(before[0].scale_calibration).toBeNull();
    expect(
      await page.evaluate(() => (window as unknown as Window2).__ezdraftPlan?.underlay() ?? null),
    ).toBeNull();

    await tid(page, 'pdf-scale-banner-set').click();
    const canvas = tid(page, 'pdf-scale-page');
    await expect(canvas).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    const halfPx = await clickPagePoint(canvas, page, west.from);
    await clickPagePoint(canvas, page, west.to);
    await tid(page, 'pdf-scale-distance').fill(`10' 0"`);
    await tid(page, 'pdf-scale-save').click();
    await expect(tid(page, 'pdf-scale')).toHaveCount(0, { timeout: 30_000 });
    await expect(tid(page, 'pdf-scale-banner')).toHaveCount(0);
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as Window2).__ezdraftPlan?.underlay() ?? null),
        {
          timeout: 60_000,
        },
      )
      .not.toBeNull();
    const after = await harnessSql()<{ scale_calibration: unknown }[]>`
      select scale_calibration from public.source_file where project_id = ${project}::uuid`;
    const cal = readCalibration(after[0].scale_calibration);
    expect(cal?.lengthIn).toBe(west.lengthIn);
    // Calibrated on the west face, the south face measures 12' 0" (180 pt calibration).
    const relTol = (2 * halfPx) / (west.lengthPt - 2 * halfPx);
    if (cal === null) return;
    expect(Math.abs(measureIn(cal, south.from, south.to) - south.lengthIn)).toBeLessThanOrEqual(
      south.lengthIn * relTol,
    );
  });
});
