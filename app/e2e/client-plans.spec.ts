// EZD-2032 (AC-EZD-2032-2; S18 Page tab: Plans "Read-only viewer of the sheets the contractor shared in this send;
// pinch zoom"; wording "Plans" and "Preparing sheets…" approved on the S18 rows of vault/build/assumptions/EZD-1202.md).
// The signed-out client link at the board's phone size (390 x 844). Each test makes its own company and a client send
// of the permit set written through the service-role harness, with its client_sheet_images job: queued for later
// (the images do not exist yet) or done, with two sheet images in Storage. No live service.
import sharp from 'sharp';
import { newClientToken } from '../src/server/sends/token';
import {
  adminDb,
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';

const SHEETS = [
  { number: 'A0.0', title: 'Cover', width: 2400, height: 1600, thumbWidth: 400, thumbHeight: 267 },
  { number: 'A1.0', title: 'Existing', width: 2400, height: 1600, thumbWidth: 400, thumbHeight: 267 },
];
const made: { tenant: string; project: string }[] = [];

async function webp(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).webp().toBuffer();
}

async function sheetSend(opts: { images: 'ready' | 'preparing' | 'no_job' | 'no_set' }): Promise<string> {
  const tenant = await createTenant();
  const [project] = await createProjects(tenant, 1);
  made.push({ tenant, project: project! });
  const sql = harnessSql();
  await sql`update public.tenant set name = 'Worth Properties' where id = ${tenant}::uuid`;
  await sql`update public.project set name = 'Hendricks kitchen' where id = ${project}::uuid`;
  const [v] = await sql<{ id: string }[]>`
    insert into public.model_version (project_id, tenant_id, model_json, schema_version, is_sent, version_no, sent_at)
    values (${project}::uuid, ${tenant}::uuid, '{}'::jsonb, 1, true, 1, now()) returning id`;
  const { token, hash } = newClientToken();
  const kind = opts.images === 'no_set' ? null : 'permit';
  const [pkg] = await sql<{ id: string }[]>`
    insert into public.sent_package
      (tenant_id, project_id, model_version_id, kind, recipients, token_hash, expires_at, sheet_set_kind)
    values (${tenant}::uuid, ${project}::uuid, ${v!.id}::uuid, 'client', '["client@example.test"]'::jsonb, ${hash},
      now() + interval '30 days', ${kind}) returning id`;
  if (opts.images === 'preparing') {
    // Queued far ahead, so no runner takes it during the test.
    await sql`insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, run_after)
      values (${tenant}::uuid, ${project}::uuid, 'client_sheet_images', ${sql.json({ sentPackageId: pkg!.id })},
        'queued', 5, now() + interval '1 day')`;
  }
  if (opts.images === 'ready') {
    const dir = `${tenant}/${project}/client-sheets/${pkg!.id}`;
    for (let i = 0; i < SHEETS.length; i++) {
      const nn = String(i + 1).padStart(2, '0');
      for (const [name, w, h] of [
        [`${nn}.webp`, 2400, 1600],
        [`${nn}-thumb.webp`, 400, 267],
      ] as const) {
        const up = await adminDb()
          .storage.from('exports')
          .upload(`${dir}/${name}`, await webp(w, h), { contentType: 'image/webp', upsert: true });
        if (up.error) throw up.error;
      }
    }
    await sql`insert into public.job (tenant_id, project_id, kind, payload, status, max_attempts, progress, result)
      values (${tenant}::uuid, ${project}::uuid, 'client_sheet_images', ${sql.json({ sentPackageId: pkg!.id })},
        'done', 5, 100, ${sql.json({ dir, sheets: SHEETS })})`;
  }
  return token;
}

test.describe('EZD-2032 client Plans tab', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.afterAll(async () => {
    try {
      for (const m of made) {
        const rows = await harnessSql()<{ name: string }[]>`
          select name from storage.objects where bucket_id = 'exports' and name like ${`${m.tenant}/${m.project}/%`}`;
        if (rows.length > 0) await adminDb().storage.from('exports').remove(rows.map((r) => r.name));
      }
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-2032-2 @smoke the Plans tab lists the set\'s sheets in set order; tapping one opens it with pinch zoom and pan', async ({
    page,
  }) => {
    const token = await sheetSend({ images: 'ready' });
    await page.goto(`/c/${token}`);
    await page.getByRole('tab', { name: 'Plans' }).click();
    await expect(page.getByRole('tab', { name: 'Plans' })).toHaveAttribute('aria-selected', 'true');
    const list = page.getByTestId('client-plans');
    const buttons = list.getByRole('button');
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).toHaveAccessibleName('Open sheet A0.0 Cover');
    await expect(buttons.nth(1)).toHaveAccessibleName('Open sheet A1.0 Existing');
    await buttons.nth(1).click();
    const viewer = page.getByTestId('client-sheet-viewer');
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('img', { name: 'A1.0 Existing' })).toBeVisible();

    // Pinch: two touch points move apart, so the sheet zooms in.
    const stage = page.getByTestId('client-sheet-stage');
    await expect(stage).toHaveAttribute('data-zoom', '1.00');
    const box = (await stage.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await stage.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: cx - 20, clientY: cy, isPrimary: true });
    await stage.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: cx + 20, clientY: cy });
    await stage.dispatchEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: cx + 60, clientY: cy });
    await stage.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch', clientX: cx + 60, clientY: cy });
    // 40 px apart to 80 px apart: twice the size.
    await expect(stage).toHaveAttribute('data-zoom', '2.00');
    // Pan: one finger drags the zoomed sheet.
    const zoom = stage.locator('div').first();
    const before = await zoom.evaluate((el) => (el as HTMLElement).style.transform);
    await stage.dispatchEvent('pointermove', { pointerId: 1, pointerType: 'touch', clientX: cx + 10, clientY: cy + 30 });
    await stage.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', clientX: cx + 10, clientY: cy + 30 });
    expect(await zoom.evaluate((el) => (el as HTMLElement).style.transform)).not.toBe(before);

    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer).toHaveCount(0);
  });

  test('AC-EZD-2032-2 until the images exist the tab shows "Preparing sheets…"', async ({ page }) => {
    const token = await sheetSend({ images: 'preparing' });
    await page.goto(`/c/${token}`);
    await page.getByRole('tab', { name: 'Plans' }).click();
    await expect(page.getByText('Preparing sheets…')).toBeVisible();
  });

  test('AC-EZD-2032-2 a Share from another tab, and a send made before EZD-2032, have no Plans tab', async ({ page }) => {
    for (const images of ['no_set', 'no_job'] as const) {
      const token = await sheetSend({ images });
      await page.goto(`/c/${token}`);
      await expect(page.locator('[data-client-state="active"]')).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Design' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Plans' })).toHaveCount(0);
    }
  });
});
