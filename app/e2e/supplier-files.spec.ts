// EZD-914 (AC-EZD-914-1 "A proprietary 2020 file shows the prompt for DXF, 3D export and order report"; S12 Layout;
// Upload; File row; Source note; Permissions). Untagged, so desktop 1600 x
// 1000. The test makes its own company (never tenant 1); its stored objects and company are removed in afterAll.
// Expected values: the S12 prompt names DXF, 3D export and order report (wording for Josh, vault/build/assumptions.md
// EZD-914); the board's panel title "Supplier files" and source note text; the board's date form 10/08/26.
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
import { seedFixtureS } from '../test-harness/projects-fixture';

const tid = (page: Page, id: string) => page.getByTestId(id);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(92).fill(0)]);

test.describe('EZD-914 Supplier files panel', () => {
  let tenant = '';

  test.afterAll(async () => {
    try {
      if (tenant) {
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

  test('AC-EZD-914-1: on Supplier markup, a 2020 file shows the prompt for DXF, 3D export and order report; a rendering uploads and lists', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'upload_references',
      'see_company_costs',
    ]);
    await signInAs(m.email);

    // The screen's own rail shows Supplier markup on (S12 Layout); the plan rail button waits for editor budget room
    // (vault/build/assumptions.md EZD-914).
    await page.goto(`/projects/${ids.P1}/supplier`);
    await expect(page.locator('[data-rail-tool="supplier-markup"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-shell-region="left-panel"]')).toContainText('Supplier files');
    await expect(tid(page, 'supplier-files-empty')).toBeVisible();

    // AC-EZD-914-1: a proprietary 2020 file is refused with the prompt, and nothing is sent.
    await tid(page, 'supplier-upload-input').setInputFiles({
      name: 'Hendricks kitchen.kit',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('2020 design project'),
    });
    const prompt = tid(page, 'supplier-refused-message');
    await expect(prompt).toHaveCount(1);
    await expect(prompt).toContainText('2020');
    await expect(prompt).toContainText('DXF');
    await expect(prompt).toContainText('3D export');
    await expect(prompt).toContainText('order report');
    await expect(tid(page, 'supplier-staged')).toHaveCount(0);

    // A DWG gets the DXF prompt (S12 Upload "DWG prompts for DXF").
    await tid(page, 'supplier-upload-input').setInputFiles({
      name: 'plan.dwg',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('dwg'),
    });
    await expect(prompt).toHaveText('Save this drawing as DXF and upload the DXF');

    // A rendering needs the supplier name, then uploads and shows as a file row with the source note.
    await tid(page, 'supplier-upload-input').setInputFiles({
      name: '2020_persp_02.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(tid(page, 'supplier-staged-file')).toHaveCount(1);
    await expect(tid(page, 'supplier-staged-kind')).toHaveValue('image');
    await tid(page, 'supplier-send').click();
    await expect(tid(page, 'supplier-field-error')).toHaveText(
      'Enter the supplier name before uploading.',
    );
    await tid(page, 'supplier-name').fill('Cabinet Co');
    await tid(page, 'supplier-email').fill('orders@cabinet.example');
    await tid(page, 'supplier-send').click();

    const row = tid(page, 'supplier-file');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('2020_persp_02.png');
    await expect(tid(page, 'supplier-file-summary')).toHaveText('Rendering · 0.0 MB');
    await expect(row).toHaveAttribute('aria-current', 'true');
    const stored = await harnessSql()<{ supplier_name: string; supplier_contact_email: string; kind: string }[]>`
      select supplier_name, supplier_contact_email, kind from public.source_file
      where tenant_id = ${tenant}::uuid and uploaded_at is not null`;
    expect(stored).toEqual([
      { supplier_name: 'Cabinet Co', supplier_contact_email: 'orders@cabinet.example', kind: 'image' },
    ]);
    const today = new Date().toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });
    await expect(tid(page, 'supplier-source-note')).toHaveText(
      `Cabinet Co · received ${today}. Codes read from the order report, positions from the rendering.`,
    );
  });

  test('EZD-914 a member without Upload references sees the files without Upload; without See company costs, none', async ({
    page,
    signInAs,
  }) => {
    const t2 = await createTenant();
    const ids = await seedFixtureS(t2);
    const viewer = await createMember({ tenantId: t2, scope: 'all' });
    await setPermissions(t2, viewer.membershipId, ['view_projects', 'see_company_costs']);
    await signInAs(viewer.email);
    await page.goto(`/projects/${ids.P1}/supplier`);
    await expect(tid(page, 'supplier-files-empty')).toBeVisible();
    await expect(tid(page, 'supplier-upload')).toHaveCount(0);

    await setPermissions(t2, viewer.membershipId, ['view_projects']);
    await page.reload();
    await expect(tid(page, 'supplier-files-no-costs')).toHaveText(
      'Supplier files need the See company costs permission.',
    );
  });
});
