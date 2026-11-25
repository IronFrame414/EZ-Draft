// EZD-1982 (AC-EZD-1982-1, AC-EZD-1982-2; audit/ui-live-2026-11-24/REPORT.md finding F7). Settings pages at the
// iPad profile (1180 x 820, Q-0053) neither squeeze nor clip, and the Sheet presets inspector at the desktop size
// (1600 x 1000) is the board width: 612 px (vault/mockups/html/project/S15cSubmittal.dc.html, the aside
// "Selected submittal profile"). Each test makes its own company and members and never touches seeded rows.
// Expected texts: the en catalog ('Add customer', 'Users + permissions', 'Combined set (one PDF)',
// 'None (GC load calc accepted)'), the board text.
import type { Locator, Page } from '@playwright/test';
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
import { addUser, hex8 } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);

// No horizontal overflow: the box's content fits its own width.
async function noHorizontalOverflow(l: Locator): Promise<void> {
  const { sw, cw } = await l.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(sw, 'scrollWidth <= clientWidth').toBeLessThanOrEqual(cw);
}

// `inner` lies wholly inside `outer`'s visible box (1 px for subpixel rounding).
async function inside(inner: Locator, outer: Locator): Promise<void> {
  const a = await inner.boundingBox();
  const b = await outer.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: r.left + el.clientLeft,
      y: r.top + el.clientTop,
      w: el.clientWidth,
      h: el.clientHeight,
    };
  });
  if (!a) throw new Error('no box');
  expect(a.x).toBeGreaterThanOrEqual(b.x - 1);
  expect(a.y).toBeGreaterThanOrEqual(b.y - 1);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.w + 1);
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.h + 1);
}

// The element's text sits on one line: its height is under two line heights.
async function oneLine(l: Locator): Promise<void> {
  const { h, lh } = await l.evaluate((el) => {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const lhv = cs.lineHeight === 'normal' ? fs * 1.25 : parseFloat(cs.lineHeight);
    return { h: el.getBoundingClientRect().height, lh: lhv };
  });
  expect(h, 'one line').toBeLessThan(lh * 2);
}

// The select shows its whole chosen value: the text width (canvas, the select's own font) plus the select's
// padding and its arrow fits the select's inner width.
async function selectShowsWholeValue(l: Locator, value: string): Promise<void> {
  const shown = await l.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text ?? '');
  expect(shown).toBe(value);
  const { text, room } = await l.evaluate((el) => {
    const s = el as HTMLSelectElement;
    const cs = getComputedStyle(s);
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    // The native arrow takes about 20 px at the inline end.
    return {
      text: ctx.measureText(s.selectedOptions[0].text).width,
      room: s.clientWidth - pad - 20,
    };
  });
  expect(text, `"${value}" fits its select`).toBeLessThanOrEqual(room);
}

test.describe('EZD-1982 Settings fit', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'Users at iPad width: heading on one line, emails unwrapped, every row fully visible @ipad',
    {
      tag: ['@ipad'],
    },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
      // Two emails as long as the audit's (josh@example.com, 16 characters) and one much longer.
      const short1 = `${hex8()}@ex.test`;
      const short2 = `${hex8()}@ex.test`;
      const long = `a.very.long.address.${hex8()}@example-company.com`;
      await addUser(tenant, { preset: 'designer', name: 'Ann Lee', email: short1 });
      await addUser(tenant, { preset: 'foreman', name: 'Bo Field', email: short2 });
      await addUser(tenant, { preset: 'crew', name: 'Cy Crew', email: long });
      await signInAs(v.email);
      await page.goto('/settings/users');
      const rows = tid(page, 'user-row');
      await expect(rows).toHaveCount(4);

      const main = page.locator('[data-settings-page="users"]');
      const table = tid(page, 'users-table');
      await expect(main.getByRole('heading', { level: 1 })).toHaveText('Users + permissions');
      await oneLine(main.getByRole('heading', { level: 1 }));
      await noHorizontalOverflow(main);
      await noHorizontalOverflow(table);

      // Every row shows without scrolling the table, each wholly inside it.
      const { sh, ch } = await table.evaluate((el) => ({
        sh: el.scrollHeight,
        ch: el.clientHeight,
      }));
      expect(sh).toBeLessThanOrEqual(ch);
      for (let i = 0; i < 4; i++) {
        await inside(rows.nth(i), table);
        const sub = rows.nth(i).getByTestId('user-sub');
        await oneLine(sub);
        await inside(sub, main);
      }
      // Audit-length emails show whole; a longer one stays on one line, ends in "…" and keeps its full text.
      for (const [name, email] of [
        ['Ann Lee', short1],
        ['Bo Field', short2],
      ]) {
        const sub = rows.filter({ hasText: name }).getByTestId('user-sub');
        await expect(sub).toHaveText(email);
        await noHorizontalOverflow(sub);
      }
      const longSub = rows.filter({ hasText: 'Cy Crew' }).getByTestId('user-sub');
      await expect(longSub).toHaveAttribute('title', long);
      expect(await longSub.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
      await expect(tid(page, 'users-invite')).toBeVisible();
      await inside(tid(page, 'users-invite'), main);
      // The Roles row and note stay reachable: the card scrolls to them.
      await tid(page, 'users-costs-note').scrollIntoViewIfNeeded();
      await inside(tid(page, 'users-costs-note'), main);
    },
  );

  test(
    'Users at iPad width: a pending invite keeps its email on one line @ipad',
    {
      tag: ['@ipad'],
    },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      const v = await addUser(tenant, { preset: 'owner', name: 'Zed Owner' });
      const short = `${hex8()}@ex.test`;
      const long = `a.very.long.address.${hex8()}@example-company.com`;
      for (const email of [short, long])
        await addUser(tenant, {
          status: 'invited',
          preset: 'crew',
          name: null,
          email,
          invitedAgo: '2 days',
        });
      await signInAs(v.email);
      await page.goto('/settings/users');
      const rows = tid(page, 'user-row');
      await expect(rows).toHaveCount(3);
      await noHorizontalOverflow(tid(page, 'users-table'));
      await noHorizontalOverflow(page.locator('[data-settings-page="users"]'));

      // The whole line keeps its text: "{email} · sent {date}" (en catalog).
      const shortRow = rows.filter({ hasText: short });
      await expect(shortRow.getByTestId('user-sub')).toContainText(`${short} · sent `);
      const shortEmail = shortRow.getByTestId('user-sub-email');
      await expect(shortEmail).toHaveText(short);
      await oneLine(shortEmail);
      await noHorizontalOverflow(shortEmail);

      // A longer email is not broken mid-word: one line, ending in "…", full text in its title.
      const longEmail = rows.filter({ hasText: long }).getByTestId('user-sub-email');
      await expect(longEmail).toHaveText(long);
      await expect(longEmail).toHaveAttribute('title', long);
      await oneLine(longEmail);
      const cs = await longEmail.evaluate((el) => {
        const c = getComputedStyle(el);
        return [c.whiteSpace, c.textOverflow, c.overflowWrap];
      });
      expect(cs).toEqual(['nowrap', 'ellipsis', 'normal']);
      await inside(longEmail, rows.filter({ hasText: long }));
    },
  );

  test(
    'Company at iPad width: the Customers pane is not clipped @ipad',
    {
      tag: ['@ipad'],
    },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      await harnessSql()`
      insert into public.customer (tenant_id, name, email, phone)
      values (${tenant}::uuid, 'Audit client', ${`audit-client-${hex8()}@example.test`}, '561-555-0100')`;
      const member = await createMember({ tenantId: tenant, scope: 'all' });
      await setPermissions(tenant, member.membershipId, ['settings_company']);
      await signInAs(member.email);
      await page.goto('/settings/company');
      await expect(tid(page, 'customer-row')).toHaveCount(1);

      const panel = tid(page, 'customers-panel');
      const pane = panel.locator('xpath=..');
      const add = tid(page, 'customers-add');
      await expect(add).toHaveText('Add customer');
      await noHorizontalOverflow(pane);
      await noHorizontalOverflow(panel);
      await noHorizontalOverflow(add);
      await inside(add, pane);
      await inside(tid(page, 'customers-search'), pane);
      await inside(tid(page, 'customer-row'), pane);
      await noHorizontalOverflow(page.locator('[data-settings-page="company"]'));
    },
  );

  test('Sheet presets at desktop: the inspector is the board width and its selects show their values', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    await harnessSql()`select private.seed_submittal_profile(${tenant}::uuid)`;
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, [
      'settings_sheet_presets',
      'view_projects',
      'create_projects',
    ]);
    await signInAs(member.email);
    await page.goto('/settings/sheet-presets');
    await expect(tid(page, 'sheet-presets-inspector-name')).toHaveText('Palm Beach County');

    const inspector = tid(page, 'sheet-presets-inspector');
    // The page can render the inspector again once its data settles; wait for the form, then read the width.
    await expect(tid(page, 'sheet-presets-file-split')).toBeVisible();
    await expect.poll(async () => (await inspector.boundingBox())?.width).toBe(612);
    await noHorizontalOverflow(inspector);
    await selectShowsWholeValue(tid(page, 'sheet-presets-file-split'), 'Combined set (one PDF)');
    await selectShowsWholeValue(tid(page, 'sheet-presets-signer'), 'None (GC load calc accepted)');
    // The profiles list keeps room for its row.
    await inside(
      tid(page, 'sheet-presets-row'),
      page.locator('[data-settings-page="sheet_presets"]'),
    );
  });

  test(
    'Sheet presets at iPad width: the inspector keeps its narrow width @ipad',
    {
      tag: ['@ipad'],
    },
    async ({ page, signInAs }) => {
      const tenant = await createTenant();
      await harnessSql()`select private.seed_submittal_profile(${tenant}::uuid)`;
      const member = await createMember({ tenantId: tenant, scope: 'all' });
      await setPermissions(tenant, member.membershipId, [
        'settings_sheet_presets',
        'view_projects',
        'create_projects',
      ]);
      await signInAs(member.email);
      await page.goto('/settings/sheet-presets');
      await expect(tid(page, 'sheet-presets-inspector-name')).toHaveText('Palm Beach County');
      await expect(tid(page, 'sheet-presets-file-split')).toBeVisible();
      await expect
        .poll(async () => (await tid(page, 'sheet-presets-inspector').boundingBox())?.width)
        .toBe(336);
    },
  );
});
