// EZD-1409 (AC-EZD-1409-1 "Seeded published tasks show grouped by phase"; AC-EZD-1409-2 "A task checked offline
// syncs with its user and time"; S17 Tab: Tasks; Task row: checkbox "records user and time ... Queued offline", add
// photo (Photo notes), edit text (Edit field tasks; online only); S22 Decisions 2 drafts hidden from crew). Every test
// makes its own company (never tenant 1) with a member listed on the project, and seeds an issued pack with
// fixtures/field-pack.ts. Expected values come from the seeded tasks: Demo (2 tasks, one in the Pantry), Rough-in,
// Finish, and a Demo draft that never shows; 4 open tasks.
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  expectTouchTargets,
  createMember,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFieldPack } from './fixtures/field-pack';

const madePaths: string[] = [];
const CREW = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];

async function setup(permissions: string[] = CREW) {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const sql = harnessSql();
  const seeded = await seedFieldPack(sql, {
    tenantId: tenant,
    projectId: project,
    rooms: ['Kitchen', 'Pantry'],
    versionNo: 2,
    tasks: [
      { text: 'Set the vanity', phase: 'Finish', phasePosition: 4, position: 0 },
      { text: 'Remove upper cabinets', phase: 'Demo', phasePosition: 0, position: 0 },
      { text: 'Pull the pantry shelves', phase: 'Demo', phasePosition: 0, position: 1, room: 'Pantry' },
      { text: 'Rough in the sink drain', phase: 'Rough-in', phasePosition: 1, position: 0 },
      { text: 'Draft not for crew', phase: 'Demo', phasePosition: 0, position: 2, status: 'draft' },
    ],
  });
  const crew = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
  await setPermissions(tenant, crew.membershipId, permissions as never);
  await sql`update public.app_user set name = 'Luis Ortega' where id = ${crew.appUserId}::uuid`;
  const [vanity, upper, shelves, drain] = seeded.taskIds as [string, string, string, string];
  return { tenant, project, crew, tasks: { vanity, upper, shelves, drain } };
}

const openTasksTab = async (page: Page) => {
  await page.getByRole('tab', { name: /Tasks/ }).click();
  await expect(page.getByTestId('field-pack')).toHaveAttribute('data-tab', 'tasks');
};
const box = (page: Page, task: string) => page.getByRole('checkbox', { name: `Mark done: ${task}` });
const row = (page: Page, id: string) => page.locator(`li[data-task="${id}"]`);

test.describe('EZD-1409 Tasks tab', () => {
  test.afterAll(async () => {
    try {
      if (madePaths.length > 0) await adminDb().storage.from('media').remove(madePaths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test(
    'AC-EZD-1409-1 seeded published tasks show grouped by phase',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, crew } = await setup();
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await expect(page.getByTestId('open-tasks')).toHaveText('4');
      await openTasksTab(page);

      const phases = page.getByTestId('tasks').locator('section');
      await expect(phases.locator('h2')).toHaveText(['Demo', 'Rough-in', 'Finish']);
      await expect(phases.nth(0).locator('li')).toHaveText([
        /Remove upper cabinets/,
        /Pull the pantry shelves/,
      ]);
      await expect(phases.nth(1).locator('li')).toHaveText([/Rough in the sink drain/]);
      await expect(phases.nth(2).locator('li')).toHaveText([/Set the vanity/]);
      await expect(page.getByText('Draft not for crew')).toHaveCount(0);
      // Checkboxes and Add photo are 44 px touch targets.
      expect(await expectTouchTargets(page, page.getByTestId('tasks'))).toBeGreaterThanOrEqual(8);

      // A room chip shows that room's tasks.
      await page.getByRole('group', { name: 'Rooms' }).getByRole('button', { name: 'Pantry' }).click();
      await expect(phases.locator('h2')).toHaveText(['Demo']);
      await expect(phases.locator('li')).toHaveText([/Pull the pantry shelves/]);
    },
  );

  test(
    'AC-EZD-1409-2 a task checked offline syncs with its user and time',
    { tag: ['@phone'] },
    async ({ page, signInAs, network }) => {
      test.setTimeout(120_000);
      const { project, crew, tasks } = await setup();
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await expect(page.getByTestId('offline-icon')).toHaveAttribute('data-state', 'cached', {
        timeout: 20_000,
      });
      await openTasksTab(page);
      // Edit text needs Edit field tasks, which the crew does not hold.
      await expect(row(page, tasks.drain).getByRole('button', { name: 'Edit' })).toHaveCount(0);

      await network.set(page, 'off');
      await box(page, 'Rough in the sink drain').check();
      await expect(box(page, 'Rough in the sink drain')).toBeChecked();
      await expect(box(page, 'Rough in the sink drain')).toBeDisabled();
      await expect(row(page, tasks.drain).getByTestId('task-done')).toContainText('Done by Luis Ortega');
      await expect(page.getByTestId('open-tasks')).toHaveText('3');
      const state = async () =>
        (
          await harnessSql()<{ status: string }[]>`
            select status from public.field_task where id = ${tasks.drain}::uuid`
        )[0]!.status;
      expect(await state()).toBe('published');

      await network.set(page, 'on');
      await expect.poll(state, { timeout: 20_000 }).toBe('done');
      const [done] = await harnessSql()<
        { done_by: string; done_at: Date; queued_at: Date; app_user_id: string }[]
      >`select t.done_by, t.done_at, c.queued_at, c.app_user_id
        from public.field_task t join public.offline_change c on c.id = t.done_change_id
        where t.id = ${tasks.drain}::uuid`;
      expect(done!.done_by).toBe(crew.appUserId);
      expect(done!.app_user_id).toBe(crew.appUserId);
      // The time the phone checked it, not the time it reached the server.
      expect(done!.done_at.getTime()).toBe(done!.queued_at.getTime());
      await expect(box(page, 'Rough in the sink drain')).toBeChecked();

      await page.reload();
      await openTasksTab(page);
      await expect(box(page, 'Rough in the sink drain')).toBeChecked();
      await expect(row(page, tasks.drain).getByTestId('task-done')).toContainText('Done by Luis Ortega');
      await expect(page.getByTestId('open-tasks')).toHaveText('3');
    },
  );

  // Desktop Chromium, as e2e/offline-queue.spec.ts: Playwright's WebKit refuses to keep a photo in IndexedDB
  // ("Error preparing Blob/File data to be stored in object store").
  test('a photo added to a task offline arrives on reconnect', { tag: ['@desktop'] }, async ({
    page,
    signInAs,
    network,
  }) => {
    test.setTimeout(120_000);
    const { tenant, project, crew, tasks } = await setup();
    await signInAs(crew.email);
    await page.goto(`/projects/${project}/field`);
    await expect(page.getByTestId('offline-icon')).toHaveAttribute('data-state', 'cached', {
      timeout: 20_000,
    });
    await openTasksTab(page);
    await network.set(page, 'off');
    await row(page, tasks.upper).getByTestId('task-photo-input').setInputFiles({
      name: 'cabinets.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(2048, 0xff),
    });
    await expect(row(page, tasks.upper).getByTestId('task-photos')).toHaveText('1 photo');
    await network.set(page, 'on');
    const photos = async () =>
      (
        await harnessSql()<{ photos: Array<{ path: string }> }[]>`
          select photos from public.field_task where id = ${tasks.upper}::uuid`
      )[0]!.photos;
    await expect.poll(async () => (await photos()).length, { timeout: 20_000 }).toBe(1);
    const [p] = await photos();
    expect(p!.path).toMatch(new RegExp(`^${tenant}/${project}/field-photos/[0-9a-f-]{36}\\.jpg$`));
    madePaths.push(p!.path);
  });

  test('edit text works online only', { tag: ['@phone'] }, async ({ page, signInAs, network }) => {
    const { project, crew, tasks } = await setup(['view_projects', 'check_off_tasks', 'edit_field_tasks']);
    await signInAs(crew.email);
    await page.goto(`/projects/${project}/field`);
    await expect(page.getByTestId('offline-icon')).toHaveAttribute('data-state', 'cached', {
      timeout: 20_000,
    });
    await openTasksTab(page);
    // No Photo notes: no Add photo.
    await expect(page.getByRole('button', { name: 'Add photo' })).toHaveCount(0);

    await network.set(page, 'off');
    await row(page, tasks.vanity).getByRole('button', { name: 'Edit' }).click();
    await expect(row(page, tasks.vanity)).toContainText('Editing needs a connection.');
    await network.set(page, 'on');

    await row(page, tasks.vanity).getByRole('button', { name: 'Edit' }).click();
    await row(page, tasks.vanity).getByRole('textbox', { name: 'Task text' }).fill('Set the vanity level');
    await row(page, tasks.vanity).getByRole('button', { name: 'Save' }).click();
    await expect(row(page, tasks.vanity).getByRole('textbox')).toHaveCount(0);
    await expect(row(page, tasks.vanity).locator('p').first()).toHaveText('Set the vanity level');
    const [saved] = await harnessSql()<{ text_en: string; edited_on_phone_at: Date | null }[]>`
      select text_en, edited_on_phone_at from public.field_task where id = ${tasks.vanity}::uuid`;
    expect(saved!.text_en).toBe('Set the vanity level');
    expect(saved!.edited_on_phone_at).not.toBeNull();
  });
});
