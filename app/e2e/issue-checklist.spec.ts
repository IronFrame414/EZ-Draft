// EZD-716 (AC-EZD-716-1 "An orphan 'Not on a wall' flag blocks Issue"; S13 Layout "Inspector: Issue checklist";
// S13 Controls "Issue checklist row ... red gate"; board S13Sheets wording "No red / orphan flags"). Desktop
// 1600 x 1000, untagged. Its own company: a maker saves a wall and a door with no host wall (Not on a wall) through
// save_objects; a member with View projects opens Sheets and sees the red gate and the blocked line.
import { CURRENT_SCHEMA_VERSION, createOpeningData, createWallData, type WallObject } from '@ezdraft/geometry';
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

async function projectWithOrphanDoor(s: Session): Promise<string> {
  const made = await s.serverDb.rpc('create_project', {
    p_name: 'Issue checklist e2e',
    p_address: '1 Test St',
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
  const wall: WallObject = { id: randomUUID(), type: 'wall', data: w.data };
  const d = createOpeningData({ kind: 'door', host: wall, center: { x: 72, y: 0 } });
  const door = { ...d, geometry: { ...d.geometry, hostWallId: null, axis: { x: 1, y: 0 } } };
  const lock = await s.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-716e' });
  if (lock.error) throw new Error(lock.error.message);
  const change = (oid: string, type: string, data: unknown) => ({
    id: oid,
    base_seq: 0,
    deleted: false,
    type,
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  });
  const saved = await s.serverDb.rpc('save_objects', {
    p_project: project,
    p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
    p_changes: [change(wall.id, 'wall', wall.data), change(randomUUID(), 'opening', door)],
  });
  if (saved.error) throw new Error(saved.error.message);
  return project;
}

test.describe('EZD-716 Issue checklist', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-716 AC-1 an orphan Not on a wall flag blocks Issue', async ({ page, signInAs }) => {
    const tenant = await createTenant();
    const maker = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, maker.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    const project = await projectWithOrphanDoor(await signIn(maker.email));
    const viewer = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, viewer.membershipId, ['view_projects']);
    await signInAs(viewer.email);
    await page.goto(`/projects/${project}`);
    await expect(id(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');

    await tab(page, 'Sheets').click();
    await expect(id(page, 'sheets-inspector')).toBeVisible();
    const row = id(page, 'issue-check-orphan_flags');
    await expect(row).toHaveAttribute('data-status', 'gate');
    await expect(row).toContainText('No red / orphan flags');
    await expect(row).toContainText(/^.*1 open on \d+ sheets/);
    await expect(id(page, 'issue-checklist-block')).toHaveText('Red items block issue until they are fixed.');
  });
});
