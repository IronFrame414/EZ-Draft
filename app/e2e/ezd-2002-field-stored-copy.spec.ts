// EZD-2002 (audit 2026-11-27 A1 and A2; AC-EZD-2002-1 "When a field pack or field measure page request has not
// answered within 4 seconds, or answers with a 5xx, the stored copy is shown and the page refreshes behind it when
// the answer arrives"; AC-EZD-2002-2 "rooms saved online and reopened offline are the latest ones, and a later change
// never overwrites newer rooms"; AC-EZD-2002-3). Every test makes its own company (never
// tenant 1), as field-pack.spec.ts and field-measure-send.spec.ts do. Expected values: the seeded pack titled
// "Kitchen remodel · Hendricks"; a rectangle typed as A 12' (144"), then B 10' (120") offline. The slow and 5xx
// tests run in the desktop (Chromium) project: there the test's routes see the page's and the worker's requests,
// while WebKit sends a worker page's requests past them. The offline reopen runs on the phone (390 x 844).
import type { Page } from '@playwright/test';
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
import { seedFieldPack } from './fixtures/field-pack';

const CREW = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];
const PACK_ROUTE = '**/api/projects/*/field-pack';

async function packSetup() {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const sql = harnessSql();
  await sql`update public.project set name = 'Kitchen remodel', client_name = 'Hendricks'
    where id = ${project}::uuid`;
  await seedFieldPack(sql, {
    tenantId: tenant,
    projectId: project,
    rooms: ['Kitchen'],
    versionNo: 2,
  });
  const crew = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
  await setPermissions(tenant, crew.membershipId, CREW as never);
  return { sql, project, crew };
}

const title = (page: Page, name: string) =>
  page.getByRole('heading', { name: `${name} · Hendricks` });

// True once the pack answer is in the project cache (project-cache.ts stores it after the first load).
const packStored = (page: Page, project: string) =>
  page.evaluate(async (id) => {
    const projects = await caches.open('ezdraft-projects');
    const url = new URL(`/api/projects/${id}/field-pack`, location.origin).href;
    return (await projects.match(url, { ignoreVary: true })) !== undefined;
  }, project);

test.describe('EZD-2002 field pack on a slow connection', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-2002-1 a pack read that has not answered in 4 s shows the stored pack, then the newer pack',
    { tag: ['@desktop'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      const { sql, project, crew } = await packSetup();
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await expect(title(page, 'Kitchen remodel')).toBeVisible();
      await expect.poll(() => packStored(page, project), { timeout: 20_000 }).toBe(true);

      // The server's pack changes; its answer then takes 8 s.
      await sql`update public.project set name = 'Kitchen and bath' where id = ${project}::uuid`;
      let slowed = 0;
      await page.context().route(PACK_ROUTE, async (route) => {
        slowed += 1;
        await new Promise((r) => setTimeout(r, 8000));
        await route.continue().catch(() => {});
      });
      const started = Date.now();
      await page.reload();
      await expect(title(page, 'Kitchen remodel')).toBeVisible({ timeout: 7000 });
      expect(Date.now() - started).toBeLessThan(8000);
      expect(slowed).toBeGreaterThan(0);
      await expect(page.getByTestId('field-pack')).toHaveAttribute('data-state', 'ready');
      // The answer lands and the pack shows it in place.
      await expect(title(page, 'Kitchen and bath')).toBeVisible({ timeout: 15_000 });
      await page.context().unroute(PACK_ROUTE);
    },
  );

  test(
    'AC-EZD-2002-1 a pack read answered with a 5xx shows the stored pack, not the error',
    { tag: ['@desktop'] },
    async ({ page, signInAs }) => {
      const { sql, project, crew } = await packSetup();
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await expect(title(page, 'Kitchen remodel')).toBeVisible();
      await expect.poll(() => packStored(page, project), { timeout: 20_000 }).toBe(true);

      // The server's pack changes, but its read answers 503.
      await sql`update public.project set name = 'Kitchen and bath' where id = ${project}::uuid`;
      let refused = 0;
      await page.context().route(PACK_ROUTE, (route) => {
        refused += 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
          }),
        });
      });
      await page.reload();
      await expect(title(page, 'Kitchen remodel')).toBeVisible();
      await expect(page.getByTestId('field-pack')).toHaveAttribute('data-state', 'ready');
      await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
      expect(refused).toBeGreaterThan(0);
      await page.context().unroute(PACK_ROUTE);
    },
  );
});

// EZD-2004 (audit A11): a measured wall's name goes on with its length ("Wall A, 12 feet"), so match the start.
const wall = (page: Page, letter: string) =>
  page.getByRole('button', { name: new RegExp(`^Wall ${letter}(, |$)`) });

async function keys(page: Page, ...ks: string[]) {
  for (const k of ks) {
    await page
      .getByTestId('keypad')
      .locator(`[data-key=${JSON.stringify(k)}]`)
      .tap();
  }
}
const next = (page: Page) => page.getByRole('button', { name: 'Next wall' }).tap();

// What an offline reload needs: the worker controls the page, and the page copy and every static file the page
// loaded are in the device caches (project-offline.spec.ts offlineReady).
const offlineReady = (page: Page) =>
  page.evaluate(async () => {
    if (navigator.serviceWorker.controller === null) return false;
    const here = new URL(location.href);
    here.hash = '';
    if (!(await (await caches.open('ezdraft-projects')).match(here.href, { ignoreVary: true })))
      return false;
    const files = await caches.open('ezdraft-static');
    for (const entry of performance.getEntriesByType('resource')) {
      const url = new URL(entry.name);
      url.hash = '';
      if (url.origin !== location.origin || !url.pathname.startsWith('/_next/static/')) continue;
      if (!(await files.match(url.href))) return false;
    }
    return true;
  });

test.describe('EZD-2002 field measure keeps the newer phone copy', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-2002-2 rooms saved online and reopened offline are the latest, and a later change keeps them',
    { tag: ['@phone'] },
    async ({ page, signInAs, network }) => {
      test.setTimeout(120_000);
      const tenant = await createTenant();
      const [project] = (await createProjects(tenant, 1)) as [string];
      const measurer = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, measurer.membershipId, [
        'view_projects',
        'send_field_measurement',
      ]);
      const sql = harnessSql();
      const lengths = async () =>
        (
          await sql<{ lengths: (number | null)[] | null }[]>`
            select rooms->0->'lengths' as lengths from public.field_measure_session
            where project_id = ${project}::uuid`
        )[0]?.lengths ?? null;

      await signInAs(measurer.email);
      // The first visit: nothing measured yet, and the worker stores this page as it is.
      await page.goto(`/projects/${project}/field-measure`);
      await expect(page.getByTestId('field-measure')).toBeVisible();
      await expect.poll(() => offlineReady(page), { timeout: 30_000 }).toBe(true);

      // Measured online: saved to the server, without loading the page again.
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await expect(wall(page, 'A')).toHaveAttribute('aria-pressed', 'true');
      await keys(page, '1', '2', "'");
      await next(page);
      await expect.poll(lengths, { timeout: 15_000 }).toEqual([144, null, null, null]);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const key = Object.keys(localStorage).find((k) =>
              k.startsWith('ezdraft-field-measure:'),
            );
            const copy = key
              ? (JSON.parse(localStorage.getItem(key)!) as { synced?: boolean })
              : null;
            return copy?.synced === true;
          }),
        )
        .toBe(true);

      // Reopened with no signal: the stored page is the first visit's (no wall A yet), the phone's copy is newer.
      const storedPage = await page.evaluate(async () => {
        const here = new URL(location.href);
        here.hash = '';
        const copy = await (await caches.open('ezdraft-projects')).match(here.href, { ignoreVary: true });
        return copy ? await copy.text() : '';
      });
      expect(storedPage).toContain('field-measure');
      expect(storedPage).not.toContain('144,null,null,null');
      await network.set(page, 'off');
      await page.reload();
      await expect(page.getByTestId('field-measure')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Rectangle' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('[data-length="A"]')).toHaveText(`12' 0"`);

      // A later change builds on those rooms and, on reconnect, keeps wall A on the server.
      await wall(page, 'B').tap();
      await keys(page, '1', '0', "'");
      await next(page);
      await expect(page.getByTestId('measure-status')).toHaveText('Saved on phone');
      await network.set(page, 'on');
      await expect.poll(lengths, { timeout: 20_000 }).toEqual([144, 120, null, null]);
    },
  );

  test(
    'AC-EZD-2002-1 a field measure page load that has not answered in 4 s shows the stored page',
    { tag: ['@desktop'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      const tenant = await createTenant();
      const [project] = (await createProjects(tenant, 1)) as [string];
      const measurer = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, measurer.membershipId, [
        'view_projects',
        'send_field_measurement',
      ]);
      await signInAs(measurer.email);
      await page.goto(`/projects/${project}/field-measure`);
      await expect(page.getByTestId('field-measure')).toBeVisible();
      await expect.poll(() => offlineReady(page), { timeout: 30_000 }).toBe(true);

      // The page's request takes 8 s (Chromium: the context's route sees the worker's own requests too).
      let held = 0;
      const pageRoute = `**/projects/${project}/field-measure`;
      await page.context().route(pageRoute, async (route) => {
        held += 1;
        await new Promise((r) => setTimeout(r, 8000));
        await route.continue().catch(() => {});
      });
      const started = Date.now();
      await page.reload({ waitUntil: 'commit' });
      await expect(page.getByTestId('field-measure')).toBeVisible({ timeout: 7000 });
      expect(Date.now() - started).toBeLessThan(8000);
      expect(held).toBeGreaterThan(0);
      await page.context().unroute(pageRoute);
    },
  );
});
