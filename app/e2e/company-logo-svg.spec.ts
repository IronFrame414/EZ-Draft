// EZD-290 B1 (vault/plans/EZD-290.md section 4; AC-EZD-290-2). Untagged, so desktop only. `openCompany` follows
// app/e2e/company-settings.spec.ts. Expected values: F1 (width 120) is stored as it is, so the preview shows an
// image 120 px wide from the tenant's signed logo link, before and after Save and reload.
import type { Page } from '@playwright/test';
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

const SUPABASE_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const NS = 'xmlns="http://www.w3.org/2000/svg"';
const F1 = `<svg ${NS} width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" fill="#1f6feb"/></svg>`;

const tenants: string[] = [];
const tid = (page: Page, id: string) => page.getByTestId(id);
const signedPrefix = (tenant: string) =>
  `${SUPABASE_URL()}/storage/v1/object/sign/media/${tenant}/tenant/logo/`;
const startsWithPrefix = (tenant: string) =>
  new RegExp(`^${signedPrefix(tenant).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`);
const naturalWidth = (page: Page) =>
  tid(page, 'company-logo-preview').evaluate((el) => (el as HTMLImageElement).naturalWidth);

test.describe('EZD-290 SVG logo', () => {
  test.afterAll(async () => {
    try {
      for (const t of tenants) {
        const { data } = await adminDb().storage.from('media').list(`${t}/tenant/logo`);
        const names = (data ?? []).map((o) => `${t}/tenant/logo/${o.name}`);
        if (names.length > 0) await adminDb().storage.from('media').remove(names);
      }
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('B1 an SVG logo shows 120 px wide, is saved and is still there after a reload', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    tenants.push(tenant);
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['settings_company']);
    await signInAs(member.email);
    await page.goto('/settings/company');
    await expect(tid(page, 'company-form')).toBeVisible();

    await tid(page, 'company-logo-input').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(F1),
    });
    await expect(tid(page, 'company-logo-preview')).toHaveAttribute(
      'src',
      startsWithPrefix(tenant),
    );
    await expect.poll(() => naturalWidth(page)).toBe(120);

    await tid(page, 'company-save').click();
    await expect(tid(page, 'company-unsaved')).toBeHidden();
    await page.reload();
    await expect(tid(page, 'company-logo-preview')).toBeVisible();
    await expect(tid(page, 'company-logo-preview')).toHaveAttribute(
      'src',
      startsWithPrefix(tenant),
    );
    await expect.poll(() => naturalWidth(page)).toBe(120);
  });
});
