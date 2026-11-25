// EZD-1419 (AC-EZD-1419-1 "The project entry opens Field measure"; AC-EZD-1419-2 "a sent room is read-only on the
// phone"; AC-EZD-1419-3 "typing 250' asks to confirm"; S17b Entry points, States, Validation & warnings, Shape
// picker). Each test makes its own company (never tenant 1). The entry is the Projects card menu's Field measure,
// offered with Send field measurement; the office is the members holding Approve field measurements (assumptions
// EZD-1417, EZD-1419). Expected values: 250' is over 200 ft and shows as 250' 0"; Change keeps the typed text on
// wall A, Keep stores 3000" and moves to wall B; a rectangle with A 12' changed to an L keeps A 12' 0"; sent rooms
// have no keypad, a save of them is refused with 409, and after the office reopens them the keypad is back. With
// 250' typed, Send to office asks too, and Change sends nothing.
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
import { appOriginHeaders } from '../test-harness/e2e/same-origin';

async function setup() {
  const tenant = await createTenant();
  const [project] = (await createProjects(tenant, 1)) as [string];
  const measurer = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, measurer.membershipId, ['view_projects', 'send_field_measurement']);
  const office = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, office.membershipId, [
    'view_projects',
    'approve_field_measurements',
  ]);
  return { tenant, project, measurer, office };
}

const wall = (page: Page, letter: string) =>
  page.getByRole('button', { name: `Wall ${letter}`, exact: true });

async function keys(page: Page, ...ks: string[]) {
  for (const k of ks) {
    await page
      .getByTestId('keypad')
      .locator(`[data-key=${JSON.stringify(k)}]`)
      .tap();
  }
}
const next = (page: Page) => page.getByRole('button', { name: 'Next wall' }).tap();

test.describe('EZD-1419 Field measure entry points and states', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test('AC-EZD-1419-1 the project entry opens Field measure', async ({ page, signInAs }) => {
    const { project, measurer } = await setup();
    await signInAs(measurer.email);
    await page.goto('/');
    const wrap = page.locator(`[data-testid="project-card-wrap"][data-project-id="${project}"]`);
    await wrap.hover();
    await wrap.getByTestId('project-card-menu').click();
    await expect(page.getByTestId('project-card-menu-items').getByRole('menuitem')).toHaveText([
      'Field measure',
    ]);
    await page.getByTestId('project-card-field-measure').click();
    await expect(page).toHaveURL(new RegExp(`/projects/${project}/field-measure$`));
    await expect(page.getByTestId('field-measure')).toHaveAttribute('data-state', 'empty');
    await expect(page.getByText('Pick a shape')).toBeVisible();
  });

  test(
    "AC-EZD-1419-3 typing 250' asks to confirm; a measured room's shape change confirms and keeps wall A",
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { project, measurer } = await setup();
      await signInAs(measurer.email);
      await page.goto(`/projects/${project}/field-measure`);
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await expect(wall(page, 'A')).toHaveAttribute('aria-pressed', 'true');

      await keys(page, '2', '5', '0', "'");
      await next(page);
      const dialog = page.locator('[data-confirm]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(`250' 0" is over 200 ft`);
      // Change: the dialog closes and the typed text stays on wall A.
      await dialog.getByRole('button', { name: 'Change' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(wall(page, 'A')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('wall-value')).toHaveText("250'");

      // Send to office with 250' still typed asks too; Change sends nothing and keeps the text.
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: 'Send to office' }).click();
      await expect(dialog).toContainText(`250' 0" is over 200 ft`);
      await dialog.getByRole('button', { name: 'Change' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.locator('[data-testid="measure-status"][data-status="queued"]'),
      ).toHaveCount(0);
      await expect(page.locator('[data-testid="measure-status"][data-status="sent"]')).toHaveCount(
        0,
      );
      await expect(page.getByTestId('keypad')).toBeVisible();
      await expect(page.getByTestId('wall-value')).toHaveText("250'");

      // Keep: stored as 3000", and Next wall moves on to B.
      await next(page);
      await expect(dialog).toBeVisible();
      await dialog.getByRole('button', { name: 'Keep' }).click();
      await expect(wall(page, 'B')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-length="A"]')).toHaveText(`250' 0"`);
      await expect(page.getByTestId('field-measure')).toHaveAttribute('data-state', 'measuring');

      // A typed 12' needs no confirm.
      await wall(page, 'A').tap();
      await keys(page, '1', '2', "'");
      await next(page);
      await expect(wall(page, 'B')).toHaveAttribute('aria-pressed', 'true');
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-length="A"]')).toHaveText(`12' 0"`);

      // Changing the shape of a measured room asks first; Cancel keeps the rectangle.
      await page.getByRole('button', { name: 'L-shape' }).click();
      await expect(dialog).toContainText('Change the shape?');
      await expect(dialog).toContainText('Walls with the same letter keep their lengths.');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('button', { name: 'Rectangle' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await page.getByRole('button', { name: 'L-shape' }).click();
      await dialog.getByRole('button', { name: 'Change shape' }).click();
      await expect(page.getByRole('button', { name: 'L-shape' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.locator('[data-length="A"]')).toHaveText(`12' 0"`);
      await expect(page.locator('[data-wall]')).toHaveCount(6);
    },
  );

  test(
    'AC-EZD-1419-2 a sent room is read-only on the phone until the office reopens it',
    { tag: ['@phone'] },
    async ({ page, signInAs }) => {
      const { tenant, project, measurer, office } = await setup();
      const rooms = [
        {
          id: 'building',
          kind: 'building',
          name: 'Building',
          shape: 'rectangle',
          corners: [],
          closed: true,
          lengths: [144, 120, 144, 120],
          ceiling: null,
        },
      ];
      const sql = harnessSql();
      await sql`
        insert into public.field_measure_session (tenant_id, project_id, rooms, sent_at, sent_by)
        values (${tenant}::uuid, ${project}::uuid, ${sql.json(rooms as never)}, now(),
                ${measurer.appUserId}::uuid)`;

      await signInAs(measurer.email);
      await page.goto(`/projects/${project}/field-measure`);
      const screen = page.getByTestId('field-measure');
      await expect(screen).toHaveAttribute('data-state', 'sent');
      await expect(page.getByTestId('measure-read-only')).toHaveText(
        'Sent to the office. Read-only until the office reopens it.',
      );
      await expect(page.getByTestId('keypad')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'L-shape' })).toBeDisabled();
      // The measurer cannot reopen; a save of the sent rooms is refused.
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(page.getByTestId('measure-reopen')).toHaveCount(0);
      const put = await page.request.put(`/api/projects/${project}/field-measure`, {
        headers: appOriginHeaders(),
        data: { rooms: [{ ...rooms[0], lengths: [150, 120, 144, 120] }] },
      });
      expect(put.status()).toBe(409);

      // The office (Approve field measurements) reaches the rooms from the project card and reopens them.
      await signInAs(office.email);
      await page.goto('/');
      const card = page.locator(`[data-testid="project-card-wrap"][data-project-id="${project}"]`);
      await card.getByTestId('project-card-menu').click();
      await page.getByTestId('project-card-field-measure').click();
      await expect(page).toHaveURL(new RegExp(`/projects/${project}/field-measure$`));
      await expect(screen).toHaveAttribute('data-state', 'sent');
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByTestId('measure-reopen').click();
      await expect(screen).toHaveAttribute('data-state', 'closed');
      await expect(page.getByTestId('measure-read-only')).toHaveCount(0);
      const [row] = await sql<{ sent: boolean; lengths: number[] }[]>`
        select sent_at is not null as sent, rooms -> 0 -> 'lengths' as lengths
        from public.field_measure_session where project_id = ${project}::uuid`;
      expect(row).toEqual({ sent: false, lengths: [144, 120, 144, 120] });

      // Back on the measurer's phone the rooms can change again.
      await signInAs(measurer.email);
      await page.goto(`/projects/${project}/field-measure`);
      await expect(screen).toHaveAttribute('data-state', 'closed');
      await expect(page.getByTestId('keypad')).toBeVisible();
    },
  );
});
