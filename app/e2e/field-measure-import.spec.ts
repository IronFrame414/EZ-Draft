// EZD-1418 (AC-EZD-1418-1 "A sent L-shaped room becomes six existing walls and a room on the plan"; S17b Desktop side
// "sent rooms appear in Import review as Field measure items with high confidence; accepting them creates existing
// walls and rooms"; S02 Entry points "rooms sent from the phone"). Untagged, so desktop 1600 x 1000. The test makes
// its own company (never tenant 1). The send is posted to the field actions route as the phone's sender posts it
// (EZD-1417), so the server makes the import. Expected values: the L of lib/imports/field-measure-items.test.ts
// (A 15', B 10', C 8', D 8', E 7', F 18') is six walls and one room at 100 %, so Accept 7 accepts them all; Finish
// import opens Plan with "6 walls, 0 windows, 0 doors, 1 rooms added" and the model holds six Existing walls and one
// Existing room named Kitchen.
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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

const tid = (page: Page, id: string) => page.getByTestId(id);

const L_ROOMS = [
  {
    id: 'building',
    kind: 'building',
    name: 'Building',
    shape: null,
    corners: [],
    closed: false,
    lengths: [],
    ceiling: null,
  },
  {
    id: 'r1',
    kind: 'room',
    name: 'Kitchen',
    shape: 'l',
    corners: [],
    closed: true,
    lengths: [180, 120, 96, 96, 84, 216],
    ceiling: 96,
  },
];

test.describe('EZD-1418 Field measure into Import review', () => {
  test.afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  test('AC-EZD-1418-1 a sent L-shaped room becomes six existing walls and a room on the plan', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const [project] = (await createProjects(tenant, 1)) as [string];
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, [
      'view_projects',
      'edit_model',
      'send_field_measurement',
    ]);
    await signInAs(m.email);
    await page.goto(`/projects/${project}/field-measure`);
    await expect(tid(page, 'field-measure')).toBeVisible();

    const changeId = randomUUID();
    const status = await page.evaluate(
      async ({ project, membership, body }) => {
        const r = await fetch(`/api/projects/${project}/field-actions`, {
          method: 'POST',
          // The phone's sender names the signed-in membership (lib/outbox/outbox.ts MEMBERSHIP_HEADER).
          headers: { 'content-type': 'application/json', 'x-ezdraft-membership': membership },
          body: JSON.stringify(body),
        });
        return r.status;
      },
      {
        project,
        membership: m.membershipId,
        body: {
          id: changeId,
          deviceId: randomUUID(),
          kind: 'field_measure_send',
          ops: { rooms: L_ROOMS },
          baseVersionId: null,
          queuedAt: Date.now(),
          photo: null,
        },
      },
    );
    expect(status).toBe(200);

    await page.goto(`/projects/${project}/import/${changeId}`);
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 60_000,
    });
    await expect(tid(page, 'import-review-subtitle')).toHaveText('Rooms sent from Field measure');
    await expect(tid(page, 'import-review-accept-n')).toContainText('7');
    await tid(page, 'import-review-accept-n').click();
    await expect(tid(page, 'import-review-finish')).toBeEnabled();
    await tid(page, 'import-review-finish').click();
    await page.waitForURL(new RegExp(`/projects/${project}(\\?.*)?$`), { timeout: 60_000 });
    await expect(
      page.getByText('Import finished: 6 walls, 0 windows, 0 doors, 1 rooms added.'),
    ).toBeVisible({ timeout: 30_000 });

    const rows = await harnessSql()<{ type: string; status: string; name: string | null }[]>`
      select type, data ->> 'status' as status, data -> 'attributes' ->> 'name' as name
      from public.model_object
      where project_id = ${project}::uuid and not deleted and type in ('wall', 'room')
      order by type`;
    expect(rows.filter((r) => r.type === 'wall')).toHaveLength(6);
    expect(rows.filter((r) => r.type === 'room')).toEqual([
      { type: 'room', status: 'existing', name: 'Kitchen' },
    ]);
    expect(rows.every((r) => r.status === 'existing')).toBe(true);
  });
});
