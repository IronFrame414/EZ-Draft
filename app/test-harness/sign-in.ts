// EZD-007f section 3 (vault/plans/EZD-007f.md; parent P-Step 7): signs a person in through the real
// sign-in page with the 6-digit code from the local mail catcher (no live email, CLAUDE.md rule 6).
// A plain helper function, not a test.extend fixture (plan section 9 Risk 4). EZD-016a reuses it.
import type { Page } from '@playwright/test';
import { waitForAuthEmail } from './mail-catcher';

export async function signInWithCode(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-email').fill(email);
  const after = new Date();
  await page.getByTestId('sign-in-submit').click();
  await page.getByTestId('sign-in-code').waitFor({ state: 'visible' });
  const mail = await waitForAuthEmail(email, { after });
  await page.getByTestId('sign-in-code').fill(mail.code);
  await page.getByTestId('sign-in-code-submit').click();
  await page.waitForURL((u) => u.pathname === '/');
}
