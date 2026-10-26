// EZD-112 B1-B10 (vault/plans/EZD-112.md sections 3, 4; AC-EZD-112-1..9). Untagged, so desktop only
// (1600 x 1000). Each test makes its own tenant, with a member who has settings_company (and settings_users
// where the nav link is clicked) through createTenant / createMember / setPermissions, and never touches
// seeded rows. Test ids and en texts: section 3 and section 6; prompt, toast and nav markup: EZD-103b
// ([data-confirm], [data-toast-viewport] > [data-toast], [data-settings-nav="<id>"]); status markup:
// EZD-103a ([data-settings-company], [data-settings-status="company"]) and Decided "Shell additions"
// ([data-settings-status="license"]). Expected values: the plan's B rows; Q-0228 (error texts); Q-0302 and
// Q-0352 (b) (draft restore). Files go through setInputFiles; a 6 MB file is refused by the page before any
// upload, the SVG with a script is refused by the check route.
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

const SUPABASE_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_100 = Buffer.from([...PNG_SIG, ...new Array(92).fill(0)]);
const PNG_6MB = Buffer.from([...PNG_SIG, ...new Array(5_999_992).fill(0)]);
const SVG_SCRIPT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

const SUBTITLE = 'Identity used on the title block, client pages, selections PDF and email.';
const TOO_LARGE = 'Logos can be up to 5 MB. Choose a smaller file.';
const WRONG_TYPE = 'Logos must be PNG, JPG or SVG.';
const SVG_UNSAFE = "This SVG can't be used. Save it as PNG and try again.";
const NAME_REQUIRED = 'Enter your company name.';
const SAVE_FAILED = "Couldn't save. Your changes are still here. Try again.";
const OFFLINE = "Offline. Company settings can't be changed until you're back online.";
const RESTORED = 'Your unsaved changes from last time are still here.';

const tenants: string[] = [];
const suffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const GREY = 'rgb(154, 163, 175)';
const style = (page: Page, id: string, prop: 'opacity' | 'cursor' | 'color') =>
  tid(page, id).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

const tid = (page: Page, id: string) => page.getByTestId(id);
const logoError = (page: Page) =>
  page.locator('[data-testid="company-field-error"][data-field="logo"]');
const nameError = (page: Page) =>
  page.locator('[data-testid="company-field-error"][data-field="name"]');
const previewPath = async (page: Page) =>
  ((await tid(page, 'company-logo-preview').getAttribute('src')) ?? '').split('?')[0];
const signedPrefix = (tenant: string) =>
  `${SUPABASE_URL()}/storage/v1/object/sign/media/${tenant}/tenant/logo/`;

async function tenantName(tenant: string): Promise<string> {
  const rows = await harnessSql()`select name from public.tenant where id = ${tenant}::uuid`;
  return rows[0].name as string;
}

async function openCompany(
  signInAs: (email: string) => Promise<unknown>,
  page: Page,
  extra: 'settings_users'[] = [],
) {
  const tenant = await createTenant();
  tenants.push(tenant);
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, ['settings_company', ...extra]);
  await signInAs(member.email);
  await page.goto('/settings/company');
  await expect(tid(page, 'company-form')).toBeVisible();
  return { tenant, name: await tenantName(tenant) };
}

async function saveLogo(page: Page, tenant: string) {
  await tid(page, 'company-logo-input').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG_100,
  });
  await expect(tid(page, 'company-logo-preview')).toHaveAttribute(
    'src',
    new RegExp(`^${signedPrefix(tenant).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`),
  );
  await tid(page, 'company-save').click();
  await expect(tid(page, 'company-unsaved')).toBeHidden();
  await page.reload();
  await expect(tid(page, 'company-logo-preview')).toBeVisible();
}

test.describe('EZD-112 company settings', () => {
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

  test('B1 page filled: heading, subtitle, name from the tenant, empty fields, customers slot, Save disabled', async ({
    page,
    signInAs,
  }) => {
    const { name } = await openCompany(signInAs, page);
    await expect(page.locator('[data-settings-page="company"] h1')).toHaveText('Company');
    await expect(page.locator('[data-settings-page="company"]')).toContainText(SUBTITLE);
    await expect(tid(page, 'company-name')).toHaveValue(name);
    for (const id of [
      'company-license',
      'company-phone',
      'company-email',
      'company-website',
      'company-address',
    ]) {
      await expect(tid(page, id)).toHaveValue('');
    }
    await expect(tid(page, 'company-customers')).toBeAttached();
    expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('ez binder');
    await expect(tid(page, 'company-save')).toBeDisabled();
    expect(await style(page, 'company-save', 'opacity')).toBe('0.45');
    expect(await style(page, 'company-save', 'cursor')).toBe('default');
    expect(await style(page, 'company-discard', 'color')).toBe(GREY);
    expect(await style(page, 'company-discard', 'cursor')).toBe('default');
    await expect(page.locator('[data-settings-nav="company"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('B2 save fields: unsaved line, Save enabled, saved values survive a reload', async ({
    page,
    signInAs,
  }) => {
    await openCompany(signInAs, page);
    await tid(page, 'company-website').fill('example.test');
    await tid(page, 'company-phone').fill('555-0100');
    await expect(tid(page, 'company-unsaved')).toHaveText('Unsaved: 2 changes · Phone, Website');
    await expect(tid(page, 'company-save')).toBeEnabled();
    await tid(page, 'company-save').click();
    await expect(tid(page, 'company-unsaved')).toBeHidden();
    await expect(tid(page, 'company-save')).toBeDisabled();
    await page.reload();
    await expect(tid(page, 'company-website')).toHaveValue('example.test');
    await expect(tid(page, 'company-phone')).toHaveValue('555-0100');
  });

  test('B3 empty name: field error under the name, nothing saved', async ({ page, signInAs }) => {
    const { tenant, name } = await openCompany(signInAs, page);
    await tid(page, 'company-name').fill('');
    await tid(page, 'company-save').click();
    await expect(nameError(page)).toHaveText(NAME_REQUIRED);
    expect(await tenantName(tenant)).toBe(name);
    // Discard clears the stored draft, so the reload shows the saved name.
    await tid(page, 'company-discard').click();
    await expect(tid(page, 'company-unsaved')).toBeHidden();
    await expect(tid(page, 'company-save')).toBeDisabled();
    await expect(tid(page, 'company-name')).toHaveValue(name);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const dbs = await indexedDB.databases();
          if (!dbs.some((d) => d.name === 'ezdraft-settings-drafts')) return 0;
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open('ezdraft-settings-drafts');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });
          try {
            if (!db.objectStoreNames.contains('drafts')) return 0;
            return await new Promise<number>((resolve, reject) => {
              const req = db.transaction('drafts', 'readonly').objectStore('drafts').count();
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
          } finally {
            db.close();
          }
        }),
      )
      .toBe(0);
    await page.reload();
    await expect(tid(page, 'company-name')).toHaveValue(name);
  });

  test('B4 name in the header: new name and license show in the Settings header and status bar, before and after a reload', async ({
    page,
    signInAs,
  }) => {
    await openCompany(signInAs, page);
    const renamed = `EZD-112 Renamed ${suffix()}`;
    await tid(page, 'company-name').fill(renamed);
    await tid(page, 'company-license').fill('EZD112-LIC');
    await tid(page, 'company-save').click();
    const check = async () => {
      await expect(page.locator('[data-settings-company]')).toHaveText(renamed);
      await expect(page.locator('[data-settings-status="company"]')).toHaveText(renamed);
      await expect(page.locator('[data-settings-status="license"]')).toHaveText('EZD112-LIC');
    };
    await check();
    await page.reload();
    await check();
  });

  test('B5 logo upload and refusals: signed preview, PNG logo meta, three refusal texts, preview unchanged', async ({
    page,
    signInAs,
  }) => {
    const { tenant } = await openCompany(signInAs, page);
    await saveLogo(page, tenant);
    await expect(tid(page, 'company-logo-meta')).toHaveText('PNG logo');
    expect(await tid(page, 'company-logo-preview').getAttribute('src')).toContain(
      signedPrefix(tenant),
    );
    const saved = await previewPath(page);

    const refusals: [string, string, Buffer, string][] = [
      ['big.png', 'image/png', PNG_6MB, TOO_LARGE],
      ['a.gif', 'image/gif', Buffer.from('GIF89a'), WRONG_TYPE],
      ['bad.svg', 'image/svg+xml', SVG_SCRIPT, SVG_UNSAFE],
    ];
    for (const [fileName, mimeType, buffer, text] of refusals) {
      await tid(page, 'company-logo-input').setInputFiles({ name: fileName, mimeType, buffer });
      await expect(logoError(page)).toHaveText(text);
      expect(await previewPath(page)).toBe(saved);
    }
    await expect(tid(page, 'company-save')).toBeDisabled();
  });

  test('B6 remove: the logo is gone after Save and a reload, the button reads Upload', async ({
    page,
    signInAs,
  }) => {
    const { tenant } = await openCompany(signInAs, page);
    await saveLogo(page, tenant);
    await tid(page, 'company-logo-remove').click();
    await tid(page, 'company-save').click();
    await expect(tid(page, 'company-unsaved')).toBeHidden();
    await page.reload();
    await expect(tid(page, 'company-logo-preview')).toHaveCount(0);
    await expect(tid(page, 'company-logo-pick')).toHaveText('Upload');
  });

  test('B7 failed save: the banner, the edit and the unsaved line stay', async ({
    page,
    signInAs,
  }) => {
    await openCompany(signInAs, page);
    await page.route('**/api/settings/company', async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
        }),
      });
    });
    await tid(page, 'company-address').fill('12 Failing Rd');
    await tid(page, 'company-save').click();
    await expect(tid(page, 'company-save-error')).toContainText(SAVE_FAILED);
    await expect(tid(page, 'company-address')).toHaveValue('12 Failing Rd');
    await expect(tid(page, 'company-unsaved')).toBeVisible();
  });

  test('B8 offline: banner, read-only name, Save, Discard and the logo button disabled, edit kept', async ({
    page,
    signInAs,
    network,
  }) => {
    await openCompany(signInAs, page);
    await tid(page, 'company-phone').fill('555-0199');
    await network.set(page, 'off');
    await expect(tid(page, 'company-offline')).toBeVisible();
    await expect(tid(page, 'company-offline')).toContainText(OFFLINE);
    await expect(tid(page, 'company-name')).toHaveJSProperty('readOnly', true);
    await expect(tid(page, 'company-save')).toBeDisabled();
    await expect(tid(page, 'company-discard')).toBeDisabled();
    await expect(tid(page, 'company-logo-pick')).toBeDisabled();
    expect(await style(page, 'company-save', 'opacity')).toBe('0.45');
    expect(await style(page, 'company-logo-pick', 'color')).toBe(GREY);
    await expect(tid(page, 'company-phone')).toHaveValue('555-0199');
    await network.set(page, 'on');
  });

  test('B9 discard and prompt: Discard restores the saved value, leaving with an edit asks Save your changes?', async ({
    page,
    signInAs,
  }) => {
    await openCompany(signInAs, page, ['settings_users']);
    await tid(page, 'company-license').fill('DISCARD-1');
    await tid(page, 'company-discard').click();
    await expect(tid(page, 'company-license')).toHaveValue('');
    await expect(tid(page, 'company-save')).toBeDisabled();

    await tid(page, 'company-license').fill('DISCARD-2');
    await page.locator('[data-settings-nav="users"]').click();
    await expect(page.locator('[data-confirm] h2')).toHaveText('Save your changes?');
  });

  test('B10 draft restore: the unsaved name and the staged logo come back with a signed preview', async ({
    page,
    signInAs,
  }) => {
    const { tenant } = await openCompany(signInAs, page);
    await page.goto('/');
    await page.goto('/settings/company');
    await expect(tid(page, 'company-form')).toBeVisible();
    const draftName = `EZD-112 Draft ${suffix()}`;
    await tid(page, 'company-name').fill(draftName);
    await tid(page, 'company-logo-input').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: PNG_100,
    });
    await expect(tid(page, 'company-logo-preview')).toHaveAttribute(
      'src',
      new RegExp(`^${signedPrefix(tenant).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`),
    );
    const noted = await previewPath(page);
    await expect(tid(page, 'company-unsaved')).toHaveText(
      'Unsaved: 2 changes · Company name, Logo',
    );

    await page.evaluate(() => history.go(-2));
    await page.waitForURL((u) => u.pathname === '/');
    await page.goto('/settings/company');

    await expect(page.locator('[data-toast-viewport] > [data-toast]')).toContainText(RESTORED);
    await expect(tid(page, 'company-name')).toHaveValue(draftName);
    await expect(tid(page, 'company-logo-preview')).toHaveAttribute(
      'src',
      new RegExp(`^${signedPrefix(tenant).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`),
    );
    expect(await previewPath(page)).toBe(noted);
    await expect(tid(page, 'company-unsaved')).toHaveText(
      'Unsaved: 2 changes · Company name, Logo',
    );
  });
});
