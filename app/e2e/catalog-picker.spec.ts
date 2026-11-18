// EZD-401 (AC-EZD-401-1 "The picker lists seeded items by category and line"; S09 Decision 1; R23), desktop.
// A fresh company, seeded with the R23 generic line (private.seed_catalog_generic_line, as the migration and
// supabase/seed.sql do), gets one added Shaker base and one
// tile; a member with View projects opens the picker on /dev/catalog. Expected values: Cabinets 43 (42 R23 seed
// items + 1), Tile 1; line Generic lists B9 … B36, DB, SB, W and F3, F6 in that order (R23); line Shaker lists
// B15; base sizes 24" deep × 34 1/2" high (S04 Height).
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

const WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

test.describe('EZD-401 catalog picker', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-401 done when: the picker lists seeded items by category and line', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    await harnessSql()`select private.seed_catalog_generic_line(${tenant}::uuid)`;
    await harnessSql()`insert into public.catalog_item
      (tenant_id, category, subcategory, line, name, model, width, depth, height)
      values (${tenant}::uuid, 'cabinets', 'base', 'Shaker', 'Base cabinet', 'B15', 15, 24, 34.5)`;
    await harnessSql()`insert into public.catalog_item (tenant_id, category, name)
      values (${tenant}::uuid, 'tile', 'Subway 3x6')`;
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    await signInAs(member.email);
    await page.goto('/dev/catalog');

    const cabinets = page.getByTestId('catalog-category-cabinets');
    await expect(cabinets).toHaveAttribute('aria-pressed', 'true');
    await expect(cabinets).toContainText('Cabinets');
    await expect(cabinets).toContainText('43');
    await expect(page.getByTestId('catalog-category-tile')).toContainText('1');
    await expect(page.getByTestId('catalog-category-paint')).toContainText('0');

    const lines = page.getByTestId('catalog-line');
    await expect(lines).toHaveCount(2);
    const generic = page.locator('[data-testid="catalog-line"][data-line="Generic"]');
    await expect(generic.locator('h3')).toContainText('Line: Generic');
    const codes = [
      ...['B', 'DB', 'SB', 'W'].flatMap((p) => WIDTHS.map((w) => `${p}${w}`)),
      'F3',
      'F6',
    ];
    const items = generic.getByTestId('catalog-item');
    await expect(items).toHaveCount(42);
    await expect(items.locator('span:first-child')).toHaveText(codes);
    await expect(items.first()).toContainText('9 × 24 × 34 1/2');
    const shaker = page.locator('[data-testid="catalog-line"][data-line="Shaker"]');
    await expect(shaker.getByTestId('catalog-item')).toHaveText(['B15Base cabinet15 × 24 × 34 1/2']);

    await page.getByTestId('catalog-category-tile').click();
    await expect(page.getByTestId('catalog-category-tile')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('catalog-item')).toHaveText(['Subway 3x6']);

    await page.getByTestId('catalog-category-paint').click();
    await expect(page.getByTestId('catalog-picker')).toContainText('No items in this category yet.');
  });
});
