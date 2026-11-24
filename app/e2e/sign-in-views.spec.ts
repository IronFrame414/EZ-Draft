// EZD-1961 browser tests (AC-EZD-1961-1, AC-EZD-1961-2; Q-0800): the sign-in page opens on email and
// password; the sign-in link and the forgot-password code each have their own view with only the email box,
// its send button and Back; every link under a sign-in form is centred. Desktop and iPad (AC-EZD-1961-3).
// Text is read from the en catalog, never copied wording.
import type { Locator, Page } from '@playwright/test';
import { en } from '../src/server/messages/catalogs/en';
import { expect, test } from '../test-harness/e2e/test';

const T = en as Record<string, unknown>;
const text = (key: string): string => T[key] as string;

const form = (page: Page) => page.locator('form', { has: page.getByTestId('sign-in-email') });
const visibleInputs = (page: Page) => form(page).locator('input:visible');
const visibleButtons = (page: Page) => form(page).locator('button:visible');

async function centreX(l: Locator): Promise<number> {
  const box = await l.boundingBox();
  expect(box).not.toBeNull();
  return box!.x + box!.width / 2;
}

// A link is centred when its middle sits on the card's middle (1 px for sub-pixel rounding).
async function expectCentred(page: Page, testId: string): Promise<void> {
  const card = await centreX(page.getByTestId('sign-in-card'));
  expect(Math.abs((await centreX(page.getByTestId(testId))) - card), testId).toBeLessThanOrEqual(1);
}

const VIEWS = [
  {
    opener: 'sign-in-submit',
    openerKey: 'common.sign_in.send_instead',
    send: 'sign-in-link-send',
    sendKey: 'common.sign_in.send',
  },
  {
    opener: 'sign-in-forgot',
    openerKey: 'common.sign_in.forgot',
    send: 'sign-in-forgot-send',
    sendKey: 'common.sign_in.send_code',
  },
] as const;

test.describe('EZD-1961 sign-in shows each way in separately', () => {
  test(
    'EZD-1961 AC-1 opens on email and password; the link and code views hold only the email box, send and Back',
    { tag: ['@desktop', '@ipad'] },
    async ({ page }) => {
      await page.goto('/sign-in');
      await expect(visibleInputs(page)).toHaveCount(2);
      await expect(page.getByTestId('sign-in-email')).toBeVisible();
      await expect(page.getByTestId('sign-in-password')).toBeVisible();
      await expect(page.getByTestId('sign-in-password-submit')).toHaveText(
        text('common.sign_in.password_submit'),
      );
      for (const v of VIEWS) {
        await expect(page.getByTestId(v.opener)).toHaveText(text(v.openerKey));
        await expect(page.getByTestId(v.send)).toHaveCount(0);
      }
      await expect(page.getByTestId('sign-in-back')).toHaveCount(0);

      const email = 'kept-email@example.test';
      await page.getByTestId('sign-in-email').fill(email);
      for (const v of VIEWS) {
        await page.getByTestId(v.opener).click();
        // Only the email box and its send button, then Back.
        await expect(visibleInputs(page)).toHaveCount(1);
        await expect(page.getByTestId('sign-in-email')).toHaveValue(email);
        await expect(page.locator('input[type=password]')).toHaveCount(0);
        await expect(visibleButtons(page)).toHaveCount(2);
        await expect(page.getByTestId(v.send)).toHaveText(text(v.sendKey));
        await expect(page.getByTestId(v.send)).toHaveAttribute('type', 'submit');
        await expect(page.getByTestId('sign-in-back')).toHaveText(text('common.sign_in.way_back'));
        await expect(page.getByTestId('sign-in-password-submit')).toHaveCount(0);
        await expect(page.getByTestId('sign-in-invite-code')).toHaveCount(0);
        for (const other of VIEWS) await expect(page.getByTestId(other.opener)).toHaveCount(0);

        // Back returns to email and password with the typed email kept.
        await page.getByTestId('sign-in-back').click();
        await expect(page.getByTestId('sign-in-password')).toBeVisible();
        await expect(page.getByTestId('sign-in-password')).toHaveValue('');
        await expect(page.getByTestId('sign-in-email')).toHaveValue(email);
        await expect(page.getByTestId('sign-in-back')).toHaveCount(0);
      }
    },
  );

  test(
    'EZD-1961 AC-2 every link under a sign-in form is centred and the invite code link opens its form',
    { tag: ['@desktop', '@ipad'] },
    async ({ page }) => {
      await page.goto('/sign-in');
      for (const id of [
        'sign-in-submit',
        'sign-in-forgot',
        'sign-in-invite-code',
        'sign-in-terms-link',
      ]) {
        await expectCentred(page, id);
      }
      for (const v of VIEWS) {
        await page.getByTestId(v.opener).click();
        await expectCentred(page, 'sign-in-back');
        await expectCentred(page, 'sign-in-terms-link');
        await page.getByTestId('sign-in-back').click();
      }

      await page.getByTestId('sign-in-invite-code').click();
      await expect(page.locator('h1')).toHaveText(text('common.sign_in.invite_code_title'));
      await expect(page.getByTestId('invite-code-code')).toBeVisible();
      await expectCentred(page, 'invite-code-back');
      await page.getByTestId('invite-code-back').click();
      await expect(page.getByTestId('sign-in-password')).toBeVisible();
    },
  );
});
