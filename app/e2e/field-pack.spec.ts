// EZD-1404 (AC-EZD-1404-1 "A signed-in crew member opens the seeded pack"; AC-EZD-1404-2 "With the network off the
// seeded pack opens"; S17 Layout, Controls, States; Q-0338 (a): the offline test also runs in the ipad-landscape and
// phone WebKit projects). Every test makes its own company (never tenant 1) with a crew member (the Crew preset's
// permissions, S17 Decision 5) listed on the project (S17 Permissions "scoped to assigned projects"), and seeds an
// issued pack with fixtures/field-pack.ts. Expected values: the seeded Version 2 with rooms Kitchen and Pantry, three
// tasks and the note; title "Kitchen remodel · Hendricks" (S17 Project title).
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

async function setup() {
  const tenant = await createTenant();
  const [project, empty, unlisted] = (await createProjects(tenant, 3)) as [string, string, string];
  const sql = harnessSql();
  await sql`update public.project set name = 'Kitchen remodel', client_name = 'Hendricks'
    where id = ${project}::uuid`;
  await seedFieldPack(sql, {
    tenantId: tenant,
    projectId: project,
    rooms: ['Kitchen', 'Pantry'],
    versionNo: 2,
    taskCount: 3,
    note: 'Sink base widened to 36"',
  });
  await seedFieldPack(sql, { tenantId: tenant, projectId: unlisted });
  const crew = await createMember({ tenantId: tenant, scope: 'listed', listed: [project, empty] });
  await setPermissions(tenant, crew.membershipId, CREW as never);
  return { project, empty, unlisted, crew };
}

const icon = (page: Page) => page.getByTestId('offline-icon');

// True once every same-origin static file the page loaded is in the worker's static cache (the worker stores them
// after the load, alongside the page copy; device-storage.spec.ts shellCached).
const filesCached = (page: Page) =>
  page.evaluate(async () => {
    const files = [
      ...new Set(
        performance
          .getEntriesByType('resource')
          .map((e) => new URL(e.name))
          .filter((u) => u.origin === location.origin && u.pathname.startsWith('/_next/static/'))
          .map((u) => u.href),
      ),
    ];
    const stat = await caches.open('ezdraft-static');
    const hits = await Promise.all(files.map((f) => stat.match(f)));
    return files.length > 0 && hits.every((h) => h !== undefined);
  });
const title = (page: Page) => page.getByRole('heading', { name: 'Kitchen remodel · Hendricks' });
const chip = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Rooms' }).getByRole('button', { name, exact: true });

test.describe('EZD-1404 field pack shell', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-1404-1 a signed-in crew member opens the seeded pack',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, empty, unlisted, crew } = await setup();
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await expect(page.getByTestId('field-pack')).toHaveAttribute('data-state', 'ready');
      await expect(title(page)).toBeVisible();
      await expect(page.getByText(/^Field pack · issued .+ · A3\.0 Proposed plan$/)).toBeVisible();
      await expect(page.getByText('EZ Binder')).toHaveCount(0);

      // Revision badge: a tap shows the note and date.
      const badge = page.getByTestId('revision-badge');
      await expect(badge).toHaveText('Version 2');
      await badge.click();
      await expect(page.getByTestId('revision-note')).toContainText('Sink base widened to 36"');
      await expect(page.getByTestId('revision-note')).toContainText(/Issued \w{3} \d{1,2}, \d{4}/);

      // Room chips: All, then each room; a tap selects the room.
      await expect(chip(page, 'All')).toHaveAttribute('aria-pressed', 'true');
      await chip(page, 'Pantry').click();
      await expect(chip(page, 'Pantry')).toHaveAttribute('aria-pressed', 'true');
      await expect(chip(page, 'Kitchen')).toHaveAttribute('aria-pressed', 'false');

      // Tab bar: Plan, 3D, Measure, Tasks with the open count, Photo (the crew has Photo notes).
      const tabs = page.getByRole('tablist', { name: 'Field pack tabs' }).getByRole('tab');
      await expect(tabs).toHaveText(['Plan', '3D', 'Measure', '3Tasks', 'Photo']);
      await expect(page.getByTestId('open-tasks')).toHaveText('3');
      await page.getByRole('tab', { name: /Tasks/ }).click();
      await expect(page.getByRole('tab', { name: /Tasks/ })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('field-pack')).toHaveAttribute('data-tab', 'tasks');

      // A listed project with nothing issued yet.
      await page.goto(`/projects/${empty}/field`);
      await expect(page.getByText('No field pack issued yet.')).toBeVisible();

      // A project the crew member is not listed on is not found.
      const res = await page.goto(`/projects/${unlisted}/field`);
      expect(res?.status()).toBe(404);
    },
  );

  test(
    'AC-EZD-1404-2 with the network off the seeded pack opens',
    { tag: ['@desktop', '@ipad', '@phone'] },
    async ({ page, signInAs, network }) => {
      const { project, crew } = await setup();
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await expect(title(page)).toBeVisible();
      // First load stores the pack; the icon turns green once the pack and its page are on the device.
      await expect(icon(page)).toHaveAttribute('data-state', 'cached', { timeout: 20_000 });
      await expect(icon(page)).toHaveAttribute('aria-label', 'Saved on this phone for offline use');
      await expect.poll(() => filesCached(page), { timeout: 20_000 }).toBe(true);

      await network.set(page, 'off');
      await page.reload();
      await expect(title(page)).toBeVisible();
      await expect(page.getByTestId('field-pack')).toHaveAttribute('data-state', 'ready');
      await expect(chip(page, 'Kitchen')).toBeVisible();
      await expect(chip(page, 'Pantry')).toBeVisible();
      await expect(page.getByTestId('revision-badge')).toHaveText('Version 2');
      await expect(icon(page)).toHaveAttribute('data-state', 'cached');
      expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
      await network.set(page, 'on');
    },
  );
});
