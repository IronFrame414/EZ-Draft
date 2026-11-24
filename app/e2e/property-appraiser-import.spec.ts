// EZD-711 (AC-EZD-711-1 "Confirmed fields fill the title block"; AC-EZD-711-2 "year built 1975 sets the lead flag";
// S01 Property appraiser link; S13 Controls "Property appraiser import ... Edit model"; board S01bWizard). Desktop
// 1600 x 1000, untagged. Each test makes its own company. The server's page read answers with the recorded page
// (server/property-record/fixtures/pbc-page.ts, AI_MODE=stub) and Claude with the built-in stub reply
// (server/jobs/ai-purposes/property-appraiser-recording.ts), so no live site or model is called (CLAUDE.md rule 5).
import type { Locator, Page } from '@playwright/test';
import {
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

const tid = (page: Page, id: string): Locator => page.getByTestId(id);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });
const field = (page: Page, f: string) =>
  page.locator(`[data-testid="sheet-preview"] [data-testid="title-block"] [data-field="${f}"]`);

const LINK = 'https://pbcpao.gov/Property/Details?parcelId=00434421010000010';

async function editor(): Promise<{ tenant: string; email: string }> {
  const tenant = await createTenant();
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['view_projects', 'create_projects', 'edit_model']);
  return { tenant, email: member.email };
}

test.describe('EZD-711 Property appraiser import', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-711 AC-1 the wizard reads the link and the ticked owner and PCN fill the title block', async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await editor();
    await signInAs(email);
    await page.goto('/');
    await tid(page, 'projects-new').click();
    await expect(tid(page, 'projects-new-menu').or(tid(page, 'new-project-dialog'))).toBeVisible();
    if (await tid(page, 'projects-new-menu').isVisible()) await tid(page, 'projects-new-standalone').click();
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('336 Golfview Rd');

    await tid(page, 'property-record-url').fill(LINK);
    await tid(page, 'property-record-read').click();
    await expect(tid(page, 'property-record-count')).toHaveText('0 of 5 confirmed', { timeout: 30000 });
    await expect(tid(page, 'property-record-value-parcelNo')).toHaveText('00-43-44-21-01-000-0010');
    await expect(tid(page, 'property-record-value-owner')).toHaveText('HENDRICKS FAMILY TRUST');
    await expect(tid(page, 'property-record-value-livingArea')).toHaveText('2,140 SF');
    await expect(tid(page, 'property-record-lead')).toHaveText('· lead flag (pre-1978)');

    await tid(page, 'property-record-tick-parcelNo').check();
    await tid(page, 'property-record-tick-owner').check();
    await tid(page, 'property-record-tick-yearBuilt').check();
    await expect(tid(page, 'property-record-count')).toHaveText('3 of 5 confirmed');

    await tid(page, 'new-project-next').click();
    await expect(tid(page, 'new-project-template-block')).toHaveAttribute('data-state', 'ready');
    // EZD-1964: the create saves the record after the project row is committed (api/projects/route.ts), so the
    // project can exist before its record is linked. Wait for the create's answer before reading the record.
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/projects',
    );
    await tid(page, 'new-project-create').click();
    await created;
    await expect
      .poll(async () => {
        const rows = await harnessSql()<Array<{ id: string }>>`
          select id from public.project where tenant_id = ${tenant}::uuid`;
        return rows.length;
      })
      .toBe(1);
    const rows = await harnessSql()<
      Array<{ owner: string | null; parcel_no: string | null; legal_description: string | null; year_built: number | null }>
    >`
      select r.owner, r.parcel_no, r.legal_description, r.year_built
      from public.project p join public.property_record r on r.id = p.property_record_id
      where p.tenant_id = ${tenant}::uuid`;
    expect(rows).toEqual([
      { owner: 'HENDRICKS FAMILY TRUST', parcel_no: '00-43-44-21-01-000-0010', legal_description: null, year_built: 1975 },
    ]);

    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await tab(page, 'Sheets').click();
    await expect(tid(page, 'sheet-preview')).toHaveAttribute('data-sheet', /.+/);
    await expect(field(page, 'owner')).toHaveText('HENDRICKS FAMILY TRUST');
    await expect(field(page, 'parcel')).toHaveText('00-43-44-21-01-000-0010');
  });

  test('EZD-711 AC-2 Sheets: another site offers paste, the pasted text reads year built 1975 and sets the lead flag', async ({
    page,
    signInAs,
  }) => {
    const { tenant, email } = await editor();
    const [project] = await createProjects(tenant, 1);
    await signInAs(email);
    await page.goto(`/projects/${project}`);
    await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await tab(page, 'Sheets').click();
    await tid(page, 'sheets-property-import').click();
    const dialog = tid(page, 'property-record-dialog');
    await expect(dialog).toBeVisible();

    await tid(page, 'property-record-url').fill('https://example.com/parcel/1');
    await tid(page, 'property-record-read').click();
    await expect(tid(page, 'property-record-failed')).toHaveText(
      "Couldn't read this page. Paste the page text or a screenshot.",
    );
    await tid(page, 'property-record-paste').fill(
      'Parcel Control Number 00-43-44-21-01-000-0010 Owner(s) HENDRICKS FAMILY TRUST Year Built 1975',
    );
    await tid(page, 'property-record-read-text').click();
    await expect(tid(page, 'property-record-lead')).toHaveText('· lead flag (pre-1978)', { timeout: 30000 });
    await tid(page, 'property-record-tick-yearBuilt').check();
    await tid(page, 'property-record-tick-owner').check();
    await tid(page, 'property-record-save').click();
    await expect(dialog).toHaveCount(0);
    await expect(field(page, 'owner')).toHaveText('HENDRICKS FAMILY TRUST');

    const res = await page.request.get(`/api/projects/${project}/property-record`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { record: { leadFlag: boolean; fields: { yearBuilt: number | null } } };
    expect(body.record.fields.yearBuilt).toBe(1975);
    expect(body.record.leadFlag).toBe(true);
  });
});
