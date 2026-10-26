// EZD-026b B1-B3, B7 (vault/plans/EZD-026b.md Tests). Phone project: each title carries @phone.
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  test,
} from '../test-harness/e2e/test';

async function setLanguage(appUserId: string, language: 'en' | 'es'): Promise<void> {
  const { error } = await adminDb().from('app_user').update({ language }).eq('id', appUserId);
  if (error) throw new Error(`set language failed: ${error.code}`);
}

async function readLanguage(appUserId: string): Promise<string> {
  const { data, error } = await adminDb()
    .from('app_user')
    .select('language')
    .eq('id', appUserId)
    .single();
  if (error) throw new Error(`read language failed: ${error.code}`);
  return data.language as string;
}

const field = (page: Page, id: string) => page.getByTestId('field-sample').getByTestId(id);
const office = (page: Page, id: string) => page.getByTestId('office-sample').getByTestId(id);

test.describe('EZD-026b messages test page', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-026b done when: a test page renders in Spanish for a Spanish user @phone', async ({
    page,
    signInAs,
  }) => {
    const member = await createMember({ tenantId: await createTenant(), scope: 'all' });
    await setLanguage(member.appUserId, 'es');
    await signInAs(member.email);
    await page.goto('/dev/messages');
    await expect(page.getByTestId('field-sample').locator('[lang]')).toHaveAttribute('lang', 'es');
    await expect(field(page, 'sample')).toHaveText('Mensaje de ejemplo');
    await expect(field(page, 'items-1')).toHaveText('1 elemento');
    await expect(field(page, 'items-2')).toHaveText('2 elementos');
    await expect(page.getByTestId('office-sample').locator('[lang]')).toHaveAttribute('lang', 'en');
    await expect(office(page, 'sample')).toHaveText('Sample message');
  });

  test('EZD-026b B2 an English user sees English @phone', async ({ page, signInAs }) => {
    const member = await createMember({ tenantId: await createTenant(), scope: 'all' });
    await setLanguage(member.appUserId, 'en');
    await signInAs(member.email);
    await page.goto('/dev/messages');
    await expect(page.getByTestId('field-sample').locator('[lang]')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('office-sample').locator('[lang]')).toHaveAttribute('lang', 'en');
    await expect(field(page, 'sample')).toHaveText('Sample message');
    await expect(field(page, 'items-2')).toHaveText('2 items');
  });

  test('EZD-026b B3 a language change applies on the next request @phone', async ({
    page,
    signInAs,
  }) => {
    const member = await createMember({ tenantId: await createTenant(), scope: 'all' });
    await setLanguage(member.appUserId, 'es');
    await signInAs(member.email);
    await page.goto('/dev/messages');
    await expect(page.getByTestId('field-sample').locator('[lang]')).toHaveAttribute('lang', 'es');
    await setLanguage(member.appUserId, 'en');
    await page.reload();
    await expect(field(page, 'sample')).toHaveText('Sample message');
    await expect(page.getByTestId('field-sample').locator('[lang]')).toHaveAttribute('lang', 'en');
  });

  test('EZD-026b B7 a new user gets the default language @phone', async ({ page, signInAs }) => {
    const member = await createMember({ tenantId: await createTenant(), scope: 'all' });
    await signInAs(member.email);
    expect(await readLanguage(member.appUserId)).toBe('en');
    await page.goto('/dev/messages');
    await expect(page.getByTestId('field-sample').locator('[lang]')).toHaveAttribute('lang', 'en');
    await expect(field(page, 'sample')).toHaveText('Sample message');
  });
});

test.describe('EZD-158 messages test page without a session', () => {
  test('EZD-158 /dev/messages without a session is not found', async ({ page }) => {
    const res = await page.goto('/dev/messages');
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId('field-sample')).toHaveCount(0);
  });
});
