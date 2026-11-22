// EZD-710 (AC-EZD-710-1 "Every sheet shows a complete title block for a filled project"; S13 Data shown "Title
// block"; S13 Decisions 5, 6; S15b Decision 2). Desktop 1600 x 1000, untagged. Fixture S in its own company, filled:
// company name and license (S13 board "CGC1541042"), the project's address and scope of work, and a property record
// with owner and parcel number linked to the project (EZD-711 imports it; here written with the secret key). The v1
// code edition reads "FBC 9th ed. · NEC 2023" (S06; EZD-613). Every sheet of the permit set is opened from the strip.
import type { Locator, Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });
const field = (page: Page, f: string) =>
  page.locator(`[data-testid="sheet-preview"] [data-testid="title-block"] [data-field="${f}"]`);

test.describe('EZD-710 Title block on sheets', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-710 AC-1 every sheet shows a complete title block for a filled project', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const db = adminDb();
    const t = await db
      .from('tenant')
      .update({ name: 'Worth Properties', license_no: 'CGC1541042', title_block: { show_company: true } })
      .eq('id', tenant);
    expect(t.error).toBeNull();
    const rec = await db
      .from('property_record')
      .insert({ tenant_id: tenant, owner: 'Hendricks', parcel_no: '00-43-44-21-01-000-0010' })
      .select('id')
      .single();
    expect(rec.error).toBeNull();
    const p = await db
      .from('project')
      .update({ address: '336 Golfview Rd', scope_of_work: 'Kitchen remodel', property_record_id: rec.data!.id })
      .eq('id', ids.P1)
      .select('name')
      .single();
    expect(p.error).toBeNull();
    const projectName = p.data!.name.toUpperCase();

    const user = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, user.membershipId, ['view_projects']);
    await signInAs(user.email);
    await page.goto(`/projects/${ids.P1}`);
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', 'A0.0');

    const thumbs = id(page, 'sheets-strip').getByRole('button');
    const count = await thumbs.count();
    expect(count).toBeGreaterThanOrEqual(9);
    for (let i = 0; i < count; i++) {
      const thumb = thumbs.nth(i);
      const number = (await thumb.getAttribute('data-testid'))!.replace('sheet-thumb-', '');
      await thumb.click();
      await expect(id(page, 'sheet-preview')).toHaveAttribute('data-sheet', number);
      await expect(field(page, 'company')).toHaveText('WORTH PROPERTIES');
      await expect(field(page, 'license')).toHaveText('CGC1541042');
      await expect(field(page, 'project')).toHaveText(projectName);
      await expect(field(page, 'address')).toHaveText('336 Golfview Rd');
      await expect(field(page, 'code_edition')).toHaveText('FBC 9th ed. · NEC 2023');
      await expect(field(page, 'scope_of_work')).toHaveText('Kitchen remodel');
      await expect(field(page, 'owner')).toHaveText('Hendricks');
      await expect(field(page, 'parcel')).toHaveText('00-43-44-21-01-000-0010');
      await expect(field(page, 'drawn')).not.toHaveText('');
      await expect(field(page, 'date')).toHaveText(/^\d\d\/\d\d\/\d\d$/);
      await expect(field(page, 'scale')).not.toHaveText('');
      await expect(field(page, 'sheet_number')).toHaveText(number);
      await expect(field(page, 'sheet_title')).not.toHaveText('');
      await expect(field(page, 'revision')).toHaveText('REV 0');
      await expect(field(page, 'sheet_of')).toHaveText(`${i + 1} OF ${count}`);
      await expect(page.locator('[data-testid="title-block"] [data-part="seal"]')).toHaveCount(1);
      await expect(page.locator('[data-testid="title-block"] [data-part="stamp"]')).toHaveCount(1);
    }
  });
});
