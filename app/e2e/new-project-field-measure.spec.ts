// EZD-1422 (AC-EZD-1422-1 "Creating a project with source Field measure emails the Foreman an S17b link, and the
// project opens on Import review after a send"; S01 Input source "Field measure creates the project and sends the
// Foreman a link to 17b; the project opens on 02 Import review when the rooms arrive"; board S01b Field measure card;
// Q-0204 "Waiting for field measurements", who it was sent to). Untagged, so desktop 1600 x 1000. The test makes its
// own company (never tenant 1). The Foreman preset holds Send field measurement (S17 Decision 5). The send is posted
// to the field actions route as the phone's sender posts it (EZD-1417), so the server makes the import (EZD-1418).
import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  cleanup,
  closeHarness,
  createTenant,
  expect,
  harnessSql,
  readStubOutboxDir,
  test,
} from '../test-harness/e2e/test';
import { addUser } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);
const stubMail = (email: string) =>
  readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
    (m) => m.to.toLowerCase() === email.toLowerCase(),
  );

const ROOMS = [
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
    shape: 'rectangle',
    corners: [],
    closed: true,
    lengths: [144, 120, 144, 120],
    ceiling: 96,
  },
];

test.describe('EZD-1422 Field measure as wizard input', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('AC-EZD-1422-1 Field measure emails the Foreman the S17b link; after a send the project opens on Import review', async ({
    page,
    signInAs,
    sessions,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Ada Owner' });
    const foreman = await addUser(tenant, { preset: 'foreman', name: 'Luis Ortega' });
    await signInAs(owner.email);
    await page.goto('/');
    await tid(page, 'projects-new').click();
    await tid(page, 'projects-new-standalone').click();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    await tid(page, 'new-project-next').click();

    // Board S01b: the Field measure card and its hint; picking it drops the template and needs the Foreman.
    await expect(tid(page, 'new-project-source-field_measure')).toContainText('Field measure');
    await expect(tid(page, 'new-project-source-field_measure')).toContainText(
      'Foreman measures rooms on the phone. Project opens on Import review when rooms arrive.',
    );
    await tid(page, 'new-project-source-field_measure').click();
    await expect(tid(page, 'new-project-field-measure-hint')).toHaveText(
      'Field measure asks which Foreman gets the link (email + Copy link)',
    );
    await expect(tid(page, 'new-project-source-field_measure')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(tid(page, 'new-project-template-block')).toHaveCount(0);
    await expect(tid(page, 'new-project-create')).toBeDisabled();
    await tid(page, 'new-project-foreman').click();
    await page.getByTestId('new-project-foreman-option').filter({ hasText: 'Luis Ortega' }).click();
    await expect(tid(page, 'new-project-create-will-email-foreman')).toHaveText(
      'Email Luis Ortega the Field measure link',
    );
    await tid(page, 'new-project-create').click();

    // Projects: the dialog closes and the card waits for the rooms, sent to the Foreman (Q-0204).
    await expect(tid(page, 'new-project-dialog')).toHaveCount(0);
    await expect(page.getByText('Field measure link sent to Luis Ortega')).toBeVisible();
    const [row] = await harnessSql()<{ id: string }[]>`
      select id::text as id from public.project where tenant_id = ${tenant}::uuid`;
    const projectId = row!.id;
    const card = page.locator(`[data-testid="project-card"][data-project-id="${projectId}"]`);
    await expect(card.getByTestId('project-card-field-measure-waiting')).toHaveText(
      'Waiting for field measurements',
    );
    await expect(card.getByTestId('project-card-field-measure-sent-to')).toHaveText(
      'Sent to Luis Ortega',
    );

    // One email to the Foreman carrying the project's S17b link.
    await expect.poll(() => stubMail(foreman.email).length).toBe(1);
    const mail = stubMail(foreman.email)[0]!;
    expect(mail.text).toContain(`/projects/${projectId}/field-measure`);

    // The Foreman opens the link on the phone screen and sends the rooms to the office.
    const [f] = await sessions.open([foreman.email]);
    await f.page.goto(`/projects/${projectId}/field-measure`);
    await expect(f.page.getByTestId('field-measure')).toBeVisible();
    const changeId = randomUUID();
    const status = await f.page.evaluate(
      async ({ project, membership, body }) => {
        const r = await fetch(`/api/projects/${project}/field-actions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-ezdraft-membership': membership },
          body: JSON.stringify(body),
        });
        return r.status;
      },
      {
        project: projectId,
        membership: foreman.membershipId,
        body: {
          id: changeId,
          deviceId: randomUUID(),
          kind: 'field_measure_send',
          ops: { rooms: ROOMS },
          baseVersionId: null,
          queuedAt: Date.now(),
          photo: null,
        },
      },
    );
    expect(status).toBe(200);

    // The office opens the project from its card and lands on the Import review of the sent rooms.
    await page.goto('/');
    await expect(card.getByTestId('project-card-field-measure-waiting')).toHaveCount(0);
    await card.click();
    await page.waitForURL(new RegExp(`/projects/${projectId}/import/${changeId}$`), {
      timeout: 60_000,
    });
    await expect(tid(page, 'import-review')).toHaveAttribute('data-status', 'ready', {
      timeout: 60_000,
    });
    await expect(tid(page, 'import-review-subtitle')).toHaveText('Rooms sent from Field measure');
  });
});
