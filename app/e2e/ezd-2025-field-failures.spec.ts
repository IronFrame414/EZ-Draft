// EZD-2025 (Josh 2026-11-27 Q-0903 "903 A": "Not saved to the office. Retry" is decided; accessibility and iPad audit
// 2026-11-27 A3, A4, A5; AC-EZD-2025-1, AC-EZD-2025-2, AC-EZD-2025-3, AC-EZD-2025-5). Phone project (390 x 844). Each test makes its own company
// (never tenant 1). The office's answers are stubbed with page.route (a refused save: 500, 403, 401; rooms already
// sent: 409; a task check refused for good: 403), and a full phone with IndexedDB put throwing QuotaExceededError.
// Expected wording: the decided line, and the proposed lines in vault/build/assumptions/EZD-2025.md. The field
// sender that cannot start (A4 reason, A6) is covered by unit tests (OutboxDrain.test.ts, FieldMeasureFailures.test.tsx,
// TasksPanel.failures.test.tsx).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  expectTouchTargets,
  harnessSql,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFieldPack } from './fixtures/field-pack';

const NOT_SAVED = 'Not saved to the office.';

// The service worker answers /api/* itself (sw-rules.mjs NETWORK_ONLY_PATHS), which page.route does not see; these
// tests stub the office's answers and need no offline page copy, so the service worker is not started.
test.use({ serviceWorkers: 'block' });

// The phone's storage is full: every IndexedDB put throws, as Safari does when the quota is used up.
const fillStorage = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __put?: IDBObjectStore['put'] };
    w.__put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    };
  });
const freeStorage = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __put?: IDBObjectStore['put'] };
    if (w.__put) IDBObjectStore.prototype.put = w.__put;
  });

const refuse = (status: number, code: string) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify({ error: { code, message_key: `error.${code}` } }),
});

async function measurer() {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, member.membershipId, ['view_projects', 'send_field_measurement']);
  return { project, member };
}

const MEASURE_PUT = '**/api/projects/*/field-measure';

test.describe('EZD-2025 Field measure: a save or a Send that did not reach the office', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test(
    'AC-EZD-2025-1 a refused save (500, 403, 401) shows "Not saved to the office. Retry"; Retry saves',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      const { project, member } = await measurer();
      const answers = [refuse(500, 'internal'), refuse(403, 'permission_denied'), refuse(401, 'unauthorized')];
      let refused = 0;
      await page.route(MEASURE_PUT, async (route) => {
        if (route.request().method() !== 'PUT' || refused >= answers.length) return route.fallback();
        await route.fulfill(answers[refused++]!);
      });
      await signInAs(member.email);
      await page.goto(`/projects/${project}/field-measure`);
      await expect(page.getByTestId('field-measure')).toBeVisible();

      await page.getByRole('button', { name: 'Rectangle' }).click();
      const line = page.getByTestId('measure-not-saved');
      await expect(line).toBeVisible();
      await expect(line).toHaveAttribute('role', 'alert');
      await expect(line).toHaveText(`${NOT_SAVED}Retry`);
      // The green "Saved on phone" is not shown as if done.
      await expect(page.getByTestId('measure-status')).toHaveCount(0);
      await expectTouchTargets(page, line);

      // 403, then 401: still not saved.
      for (const n of [2, 3]) {
        await line.getByRole('button', { name: 'Retry' }).click();
        await expect.poll(() => refused).toBe(n);
        await expect(line).toBeVisible();
      }

      // The office takes it: the line goes and Saved on phone is back.
      const saved = page.waitForResponse(
        (r) => r.url().includes('/field-measure') && r.request().method() === 'PUT' && r.ok(),
      );
      await line.getByRole('button', { name: 'Retry' }).click();
      await saved;
      await expect(line).toHaveCount(0);
      await expect(page.getByTestId('measure-status')).toHaveAttribute('data-status', 'saved');
      const [row] = await harnessSql()<{ rooms: unknown }[]>`
        select rooms from public.field_measure_session where project_id = ${project}::uuid`;
      expect(JSON.stringify(row?.rooms)).toContain('"rectangle"');
    },
  );

  test(
    'AC-EZD-2025-1 a 409 (sent from another phone) loads the sent state of the rooms',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, member } = await measurer();
      await page.route(MEASURE_PUT, (route) =>
        route.request().method() === 'PUT'
          ? route.fulfill(refuse(409, 'field_measure_sent'))
          : route.fallback(),
      );
      await signInAs(member.email);
      await page.goto(`/projects/${project}/field-measure`);
      await expect(page.getByTestId('field-measure')).toHaveAttribute('data-state', 'empty');
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await expect(page.getByTestId('field-measure')).toHaveAttribute('data-state', 'sent');
      await expect(page.getByTestId('measure-read-only')).toBeVisible();
      await expect(page.getByTestId('measure-status')).toHaveAttribute('data-status', 'sent');
      await expect(page.getByTestId('keypad')).toHaveCount(0);
      await expect(page.getByTestId('measure-not-saved')).toHaveCount(0);
    },
  );

  test(
    'AC-EZD-2025-2 Send to office that cannot be queued on the phone shows a failure line',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, member } = await measurer();
      await signInAs(member.email);
      await page.goto(`/projects/${project}/field-measure`);
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(page.getByRole('menuitem', { name: 'Send to office' })).toBeEnabled();
      await expect(page.getByTestId('send-reason')).toHaveCount(0);

      await fillStorage(page);
      await page.getByRole('menuitem', { name: 'Send to office' }).click();
      const failed = page.getByTestId('measure-send-failed');
      await expect(failed).toBeVisible();
      await expect(failed).toHaveAttribute('role', 'alert');
      await expect(failed).toHaveText(
        "Couldn't keep the rooms on this phone to send. Free up space and try again.",
      );
      // Nothing waits to send; the rooms can still be changed.
      await expect(page.getByTestId('field-measure')).not.toHaveAttribute('data-state', 'sent');
      await expect(page.getByTestId('keypad')).toBeVisible();
      await freeStorage(page);
    },
  );

  // The back link no longer uses next/link (it kept field measure over its download budget); it still switches to
  // Projects with no page reload.
  test('the back link switches to Projects without a reload', { tag: ['@phone'] }, async ({ page, signInAs }) => {
    const { project, member } = await measurer();
    await signInAs(member.email);
    await page.goto(`/projects/${project}/field-measure`);
    await expect(page.getByTestId('field-measure')).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __same?: boolean }).__same = true;
    });
    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => (window as unknown as { __same?: boolean }).__same)).toBe(true);
  });
});

const CREW = ['view_projects', 'check_off_tasks', 'photo_notes'];

async function crewWithTasks() {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const sql = harnessSql();
  const seeded = await seedFieldPack(sql, {
    tenantId: tenant,
    projectId: project,
    rooms: ['Kitchen'],
    versionNo: 1,
    tasks: [
      { text: 'Remove upper cabinets', phase: 'Demo', phasePosition: 0, position: 0 },
      { text: 'Rough in the sink drain', phase: 'Rough-in', phasePosition: 1, position: 0 },
    ],
  });
  const crew = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
  await setPermissions(tenant, crew.membershipId, CREW as never);
  const [upper, drain] = seeded.taskIds as [string, string];
  return { project, crew, tasks: { upper, drain } };
}

const openTasks = async (page: Page) => {
  await page.getByRole('tab', { name: /Tasks/ }).click();
  await expect(page.getByTestId('field-pack')).toHaveAttribute('data-tab', 'tasks');
};
const box = (page: Page, task: string) => page.getByRole('checkbox', { name: `Mark done: ${task}` });
const row = (page: Page, id: string) => page.locator(`li[data-task="${id}"]`);
const status = async (id: string) =>
  (await harnessSql()<{ status: string }[]>`select status from public.field_task where id = ${id}::uuid`)[0]!
    .status;

test.describe('EZD-2025 Field pack: a task tick that did not reach the office', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test(
    'AC-EZD-2025-3 a tick that cannot be stored on the phone unticks and says so',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, crew, tasks } = await crewWithTasks();
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await openTasks(page);
      await expect(box(page, 'Remove upper cabinets')).toBeEnabled();

      await fillStorage(page);
      await box(page, 'Remove upper cabinets').click();
      const failed = row(page, tasks.upper).getByTestId('task-check-failed');
      await expect(failed).toHaveText("The tick wasn't saved on this phone. Try again.");
      await expect(failed).toHaveAttribute('role', 'alert');
      await expect(box(page, 'Remove upper cabinets')).not.toBeChecked();
      await expect(box(page, 'Remove upper cabinets')).toBeEnabled();
      await expect(page.getByTestId('open-tasks')).toHaveText('2');

      // Space again: the tick is stored, shows, and reaches the office.
      await freeStorage(page);
      await box(page, 'Remove upper cabinets').click();
      await expect(box(page, 'Remove upper cabinets')).toBeChecked();
      await expect(failed).toHaveCount(0);
      await expect.poll(() => status(tasks.upper), { timeout: 20_000 }).toBe('done');
    },
  );

  test(
    'AC-EZD-2025-3 a check the office refuses for good unticks with "Not saved to the office. Retry"; Retry sends it',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      test.setTimeout(90_000);
      const { project, crew, tasks } = await crewWithTasks();
      let refusing = true;
      await page.route('**/api/projects/*/field-actions', (route) =>
        refusing && route.request().method() === 'POST'
          ? route.fulfill(refuse(403, 'permission_denied'))
          : route.fallback(),
      );
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await openTasks(page);

      await box(page, 'Rough in the sink drain').click();
      const line = row(page, tasks.drain).getByTestId('task-not-saved');
      await expect(line).toBeVisible({ timeout: 20_000 });
      await expect(line).toHaveAttribute('role', 'alert');
      await expect(line).toHaveText(`${NOT_SAVED}Retry`);
      await expect(box(page, 'Rough in the sink drain')).not.toBeChecked();
      expect(await status(tasks.drain)).toBe('published');
      await expectTouchTargets(page, line);

      // Still refused after a reload: the line is read from the phone's queue.
      await page.reload();
      await openTasks(page);
      await expect(row(page, tasks.drain).getByTestId('task-not-saved')).toBeVisible();
      await expect(box(page, 'Rough in the sink drain')).not.toBeChecked();

      refusing = false;
      await row(page, tasks.drain).getByRole('button', { name: 'Retry' }).click();
      await expect(box(page, 'Rough in the sink drain')).toBeChecked();
      await expect(row(page, tasks.drain).getByTestId('task-not-saved')).toHaveCount(0);
      await expect.poll(() => status(tasks.drain), { timeout: 20_000 }).toBe('done');
    },
  );

  test(
    'AC-EZD-2025-3 ticking a refused task again sends the same check, as Retry does',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, crew, tasks } = await crewWithTasks();
      let refusing = true;
      let posts = 0;
      await page.route('**/api/projects/*/field-actions', (route) => {
        if (route.request().method() === 'POST') posts += 1;
        return refusing && route.request().method() === 'POST'
          ? route.fulfill(refuse(403, 'permission_denied'))
          : route.fallback();
      });
      await signInAs(crew.email);
      await page.goto(`/projects/${project}/field`);
      await openTasks(page);

      await box(page, 'Remove upper cabinets').click();
      await expect(row(page, tasks.upper).getByTestId('task-not-saved')).toBeVisible({ timeout: 20_000 });
      await expect(box(page, 'Remove upper cabinets')).not.toBeChecked();

      refusing = false;
      await box(page, 'Remove upper cabinets').click();
      await expect(box(page, 'Remove upper cabinets')).toBeChecked();
      await expect(row(page, tasks.upper).getByTestId('task-not-saved')).toHaveCount(0);
      await expect.poll(() => status(tasks.upper), { timeout: 20_000 }).toBe('done');
      // One check refused, the same check sent again: two posts, and no refused check left on the phone.
      expect(posts).toBe(2);
      await page.reload();
      await openTasks(page);
      await expect(box(page, 'Remove upper cabinets')).toBeChecked();
      await expect(page.getByTestId('task-not-saved')).toHaveCount(0);
    },
  );
});
