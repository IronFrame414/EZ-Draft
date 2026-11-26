// EZD-717 (AC-EZD-717-1 "After Rev 0 the set is locked and edits go to a working copy"; S13 Controls "Issue Rev n ...
// Hidden without Issue permit sets (Rev 0) or Issue revisions (Rev 1+)"; S13 Validation "Numbering"; board S13Sheets
// "Revision log | Rev 0 | Permit set | Issued", "Issue Rev 1", status bar "Rev 1 draft"). Desktop 1600 x 1000,
// untagged. Its own company: a maker saves a wall and issues Rev 0 through the issue function (the database test
// covers the frozen version; the route test covers the HTTP steps). In the browser, the issuer's Sheets screen then
// lists Rev 0 in the revision log, drafts Rev 1 on the open sheet and offers "Issue Rev 1"; a member with View
// projects only sees the log and no Issue button. The header reads "Working copy · Rev 0 issued".
import { CURRENT_SCHEMA_VERSION, createWallData } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import type { Locator, Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { signIn, type Session } from '../test-harness/rls/fixtures';

const id = (page: Page, testId: string): Locator => page.getByTestId(testId);
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name, exact: true });

async function issuedProject(s: Session): Promise<string> {
  const made = await s.serverDb.rpc('create_project', {
    p_name: 'Issue revision e2e',
    p_address: '336 Golfview Rd',
    p_type: 'kitchen',
    p_customer_id: null as never,
    p_scope_of_work: null as never,
  });
  if (made.error) throw new Error(made.error.message);
  const project = (made.data as { project_id: string }[])[0].project_id;
  const floor = await s.serverDb
    .from('model_object')
    .select('object_id')
    .eq('project_id', project)
    .eq('type', 'floor')
    .limit(1)
    .single();
  if (floor.error) throw new Error(floor.error.message);
  const w = createWallData({
    start: { x: 0, y: 0 },
    end: { x: 144, y: 0 },
    level: (floor.data as { object_id: string }).object_id,
  });
  if (!w.ok) throw new Error(w.reason);
  const lock = await s.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-717e' });
  if (lock.error) throw new Error(lock.error.message);
  const saved = await s.serverDb.rpc('save_objects', {
    p_project: project,
    p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
    p_changes: [
      { id: randomUUID(), base_seq: 0, deleted: false, type: 'wall', schema_version: CURRENT_SCHEMA_VERSION, data: w.data },
    ],
  });
  if (saved.error) throw new Error(saved.error.message);
  const issued = await s.serverDb.rpc('issue_permit_set', {
    p_project: project,
    p_description: null as never,
    p_electrical: null as never,
    p_ip: null as never,
  });
  if (issued.error) throw new Error(issued.error.message);
  return project;
}

test.describe('EZD-717 Issue Rev 0 and Rev N', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-717 AC-1 after Rev 0 the Sheets screen drafts Rev 1 and offers Issue Rev 1', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const issuer = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, issuer.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
      'issue_permit_sets',
      'issue_revisions',
    ]);
    const project = await issuedProject(await signIn(issuer.email));
    const viewer = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);

    await signInAs(issuer.email);
    await page.goto(`/projects/${project}`);
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    // Board S13Sheets header: the editor works on the working copy after the issue.
    await expect(id(page, 'editor-version')).toHaveText('Working copy · Rev 0 issued');
    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheets-inspector')).toBeVisible();
    await expect(id(page, 'revision-0')).toContainText('Rev 0');
    await expect(id(page, 'revision-0')).toContainText('Permit set');
    await expect(id(page, 'revision-0')).toContainText('Issued');
    await expect(id(page, 'issue-button')).toHaveText('Issue Rev 1');
    await expect(id(page, 'status-sheet-revision')).toHaveText('Rev 1 draft');

    await signInAs(viewer.email);
    await page.goto(`/projects/${project}`);
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await tab(page, 'Sheets').click();
    await expect(id(page, 'revision-0')).toContainText('Rev 0');
    await expect(id(page, 'issue-button')).toHaveCount(0);
  });
});
