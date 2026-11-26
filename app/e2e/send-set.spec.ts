// EZD-719 (AC-EZD-719-1 "A client send before permit is labeled Version 1"; S13 Controls "Send to client | Header
// Share | Sends the set to the client; numbered Version N before Rev 0, Rev N after. Email plus Copy link"; S13
// rule 12; R24 #26). Desktop 1600 x 1000, untagged. Each test makes its own company (never tenant 1) with fixture S
// (app/test-harness/projects-fixture.ts: P1 "bravo", client "Zed Co" zedco@example.test). From the Sheets screen,
// the header Share sends the chosen set: before any issue the dialog reads "Permit set · Version 1" and the header
// "Working copy · Version 1 sent"; after Rev 0 the send is the next Rev, "Permit set · Rev 1", the header reads
// "Working copy · Rev 1 issued" and the revision log lists Rev 1 (vault/build/assumptions/EZD-719.md Settled; the
// line's wording is that file's "{Set name} · {Version N or Rev N}"). The email goes to the stub outbox; Copy link
// is shown.
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  readStubOutboxDir,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';
import { signIn } from '../test-harness/rls/fixtures';

const SENDER = ['view_projects', 'edit_model', 'send_to_client', 'issue_permit_sets'];
const CLIENT_EMAIL = 'zedco@example.test';

const id = (page: Page, testId: string) => page.getByTestId(testId);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });

async function fixture() {
  const tenant = await createTenant();
  const ids = await seedFixtureS(tenant);
  const user = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, user.membershipId, SENDER as never);
  return { ids, user };
}

async function sendFromSheets(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await tab(page, 'Sheets').click();
  await expect(id(page, 'sheets-inspector')).toBeVisible();
  await id(page, 'header-share').click();
  await expect(id(page, 'send-dialog')).toHaveAttribute('data-send-state', 'ready');
  await id(page, 'send-submit').click();
  await expect(id(page, 'send-dialog')).toHaveAttribute('data-send-state', 'sent');
}

test.describe('EZD-719 Send set to client', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-719 AC-1 @smoke a client send before permit is labeled Version 1', async ({ page, signInAs }) => {
    const { ids, user } = await fixture();
    await signInAs(user.email);
    await sendFromSheets(page, ids.P1);
    await expect(id(page, 'send-label')).toHaveText('Permit set · Version 1');
    await expect(id(page, 'send-status')).toHaveText('Sent to Zed Co.');
    const link = (await id(page, 'send-copy-link').getAttribute('data-link')) as string;
    expect(link).toMatch(/\/c\/[A-Za-z0-9_-]{43}$/);
    await expect
      .poll(
        () =>
          readStubOutboxDir(process.env.EMAIL_STUB_DIR as string).filter(
            (m) => m.to === CLIENT_EMAIL && m.text.includes(link),
          ).length,
      )
      .toBe(1);
    await id(page, 'send-cancel').click();
    await expect(id(page, 'editor-version')).toHaveText('Working copy · Version 1 sent');
  });

  test('EZD-719 after Rev 0 a client send is the next Rev, Rev 1', async ({ page, signInAs }) => {
    const { ids, user } = await fixture();
    const s = await signIn(user.email);
    const issued = await s.serverDb.rpc('issue_permit_set', {
      p_project: ids.P1,
      p_description: null as never,
      p_electrical: null as never,
      p_ip: null as never,
    });
    if (issued.error) throw new Error(issued.error.message);
    await signInAs(user.email);
    await sendFromSheets(page, ids.P1);
    await expect(id(page, 'send-label')).toHaveText('Permit set · Rev 1');
    await id(page, 'send-cancel').click();
    await expect(id(page, 'editor-version')).toHaveText('Working copy · Rev 1 issued');
    await expect(id(page, 'revision-1')).toContainText('Rev 1');
  });
});
