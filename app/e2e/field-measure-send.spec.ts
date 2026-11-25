// EZD-1417 (AC-EZD-1417-1 "Measured offline, sent on reconnect, office notified once"; S17b Header "Saved on phone";
// Send to office "Sends rooms to the project; office notified. Works offline, queued until online"; 07
// field.measure_sent "office notified"). Phone project only (390 x 844). Each test makes its own company (never
// tenant 1), as field-measure-keypad.spec.ts does. The office is the members holding Approve field measurements
// (vault/build/assumptions.md EZD-1417). Expected values: a 12' x 10' rectangle typed as A 12', B 10', C 12' (D
// fills itself) is saved on the phone while offline; Send to office waits with nothing recorded on the server; on
// reconnect exactly one field_measure_send is recorded with the typed lengths (144", 120", 144" in inches), the
// rooms are marked sent, field.measure_sent is logged once, and the office member gets one field_measurements_received
// notification while the sender gets none.
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

const count = async (rows: Promise<{ n: number }[]>) => (await rows)[0]!.n;

test.describe('EZD-1417 Field measure: offline save and send', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test(
    'AC-EZD-1417-1 measured offline, sent on reconnect, office notified once',
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
      const office = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
      await setPermissions(tenant, office.membershipId, [
        'view_projects',
        'approve_field_measurements',
      ]);

      const sql = harnessSql();
      const notes = (userId: string) =>
        count(sql<{ n: number }[]>`
          select count(*)::int as n from public.notification
          where project_id = ${project}::uuid and user_id = ${userId}::uuid
            and kind = 'field_measurements_received'`);
      const sends = () =>
        count(sql<{ n: number }[]>`
          select count(*)::int as n from public.offline_change
          where project_id = ${project}::uuid and kind = 'field_measure_send'`);
      const logged = () =>
        count(sql<{ n: number }[]>`
          select count(*)::int as n from public.event_log
          where object_id = ${project}::uuid and action = 'field.measure_sent'`);

      await signInAs(measurer.email);
      await page.goto(`/projects/${project}/field-measure`);
      await expect(page.getByTestId('field-measure')).toBeVisible();
      // The page's field sender has started: Send to office is offered.
      await page.getByRole('button', { name: 'Menu' }).click();
      await expect(page.getByRole('menuitem', { name: 'Send to office' })).toBeEnabled();
      await page.getByRole('button', { name: 'Menu' }).click();

      // Measured offline.
      await network.set(page, 'off');
      await page.getByRole('button', { name: 'Rectangle' }).click();
      await expect(wall(page, 'A')).toHaveAttribute('aria-pressed', 'true');
      await keys(page, '1', '2', "'");
      await next(page);
      await keys(page, '1', '0', "'");
      await next(page);
      await keys(page, '1', '2', "'");
      await next(page);
      await expect(page.locator('[data-length="D"]')).toHaveText(`10' 0"`);
      await expect(page.getByTestId('measure-status')).toHaveText('Saved on phone');

      // Send to office while offline: it waits on the phone.
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: 'Send to office' }).click();
      await expect(page.getByTestId('measure-status')).toHaveAttribute('data-status', 'queued');
      await expect(page.getByTestId('measure-status')).toHaveText('Waiting to send');
      await expect(page.getByTestId('keypad')).toHaveCount(0);
      await page.waitForTimeout(1000);
      expect(await sends()).toBe(0);
      expect(await notes(office.appUserId)).toBe(0);

      // Sent on reconnect.
      await network.set(page, 'on');
      await expect(page.getByTestId('measure-status')).toHaveAttribute('data-status', 'sent', {
        timeout: 20_000,
      });
      await expect(page.getByTestId('measure-status')).toHaveText('Sent to office');
      expect(await sends()).toBe(1);
      const [session] = await sql<
        {
          rooms: Array<{ shape: string | null; lengths: (number | null)[] }>;
          sent: boolean;
          sent_by: string;
        }[]
      >`select rooms, sent_at is not null as sent, sent_by from public.field_measure_session
        where project_id = ${project}::uuid`;
      expect(session!.sent).toBe(true);
      expect(session!.sent_by).toBe(measurer.appUserId);
      expect(session!.rooms[0]).toMatchObject({
        shape: 'rectangle',
        lengths: [144, 120, 144, null],
      });

      // Office notified once; the sender is not; the event is logged once.
      await expect.poll(() => logged(), { timeout: 10_000 }).toBe(1);
      expect(await notes(office.appUserId)).toBe(1);
      expect(await notes(measurer.appUserId)).toBe(0);
      // Still once a moment later, and after a reload the rooms stay sent.
      await page.reload();
      await expect(page.getByTestId('measure-status')).toHaveAttribute('data-status', 'sent');
      await page.waitForTimeout(2000);
      expect(await sends()).toBe(1);
      expect(await notes(office.appUserId)).toBe(1);
      expect(await logged()).toBe(1);
    },
  );
});
