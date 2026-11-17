// EZD-126 E1-E3 (AC-EZD-126-1 to -7; 12 Edit lock: "Second user sees amber banner with holder and time; Request
// edit prompts holder; no answer for 5 min saves and releases; banner turns green"). Untagged, so desktop
// 1600 x 1000. Each test makes its own company (never tenant 1) with fixture S (P1 "bravo", the floor "Floor 1")
// and its own members, each in their own browser (sessions). Expected text: board S06 and en.ts office.lock.*;
// the request timer is the company default of 5 minutes (S15d), so the countdown reads 4:xx or 5:00.
// The lock UI loads on the first user input in the editor (11 rule 7, vault/build/assumptions.md EZD-126), so each
// page moves the mouse once it is ready. The auto release is reached by moving the request's deadline into the
// past and letting the holder save (09o Auto-release row 1: a save after the deadline releases).
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { seedFixtureS } from '../test-harness/projects-fixture';

const EDITOR = ['view_projects', 'edit_model'];
const VIEWER = ['view_projects'];

async function member(tenant: string, permissions: string[], name: string) {
  const m = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
  await setPermissions(tenant, m.membershipId, permissions as never);
  const { error } = await adminDb().from('app_user').update({ name }).eq('id', m.appUserId);
  if (error) throw new Error(`name update failed: ${error.code}`);
  return m;
}

const tid = (page: Page, id: string) => page.getByTestId(id);
const canvasToasts = (page: Page) =>
  page.locator('[data-toast-viewport][data-placement="canvas"] [data-toast]');

// Opens the project, waits for the editor, then gives it the first input that loads the lock UI.
async function open(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`);
  await expect(tid(page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
  await page.mouse.move(800, 500);
  await page.mouse.move(810, 510);
}

type Hook = {
  objects(): Array<{ id: string; type: string; data: Record<string, unknown> }>;
  edit(changes: unknown[]): string[];
};

// Renames the floor through the editor's test hook (dev builds only; set once the editor can save).
const rename = async (page: Page, name: string) => {
  await page.waitForFunction(() => '__ezdraftEditor' in window);
  return page.evaluate((n) => {
    const hook = (window as unknown as { __ezdraftEditor: Hook }).__ezdraftEditor;
    const floor = hook.objects().find((o) => o.type === 'floor');
    if (!floor) throw new Error('no floor');
    return hook.edit([
      { id: floor.id, value: { type: 'floor', schemaVersion: 1, data: { name: n, order: 1 } } },
    ]);
  }, name);
};

async function floorName(projectId: string): Promise<unknown> {
  const { data, error } = await adminDb()
    .from('model_object')
    .select('data')
    .eq('project_id', projectId)
    .eq('type', 'floor')
    .single();
  if (error) throw new Error(`model_object read failed: ${error.code}`);
  return (data.data as { name?: unknown }).name;
}

const BANNER = (name: string) =>
  new RegExp(`^${name} is editing since \\d{1,2}:\\d\\d [AP]M · view onlyYou can pan, zoom and measure`);

test.describe('EZD-126 edit lock UI', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-126 E1 two browsers: banner, presence, request and countdown, auto release, Start editing', async ({
    sessions,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const a = await member(tenant, EDITOR, 'Alex Holder');
    const b = await member(tenant, EDITOR, 'Bea Editor');
    const [A, B] = await sessions.open([a.email, b.email]);

    await open(A.page, ids.P1);
    await expect(tid(A.page, 'stop-editing')).toBeVisible();
    await expect(tid(A.page, 'lock-view-only')).toHaveCount(0);
    await open(B.page, ids.P1);

    // AC-1: the viewer sees the amber banner with the holder's name, since time and Request edit; View only.
    await expect(tid(B.page, 'lock-banner')).toHaveText(BANNER('Alex Holder'));
    await expect(tid(B.page, 'lock-request-edit')).toBeVisible();
    await expect(tid(B.page, 'lock-view-only')).toBeVisible();
    await expect(tid(B.page, 'stop-editing')).toHaveCount(0);

    // AC-5: each sees the other in the header, the holder with the amber ring, names from the people route.
    const bAvatar = tid(B.page, 'presence-avatar');
    await expect(bAvatar).toHaveCount(1);
    await expect(bAvatar).toHaveAttribute('data-holder', '');
    await expect(bAvatar).toHaveAttribute('title', 'Alex Holder · Editing');
    await expect(bAvatar).toHaveText('AH');
    const aAvatar = tid(A.page, 'presence-avatar');
    await expect(aAvatar).toHaveCount(1);
    await expect(aAvatar).not.toHaveAttribute('data-holder', '');
    await expect(aAvatar).toHaveAttribute('title', 'Bea Editor · Viewing');

    // AC-2: Request edit becomes "Requested [time]" with Cancel; the holder gets the prompt with a live countdown.
    await tid(B.page, 'lock-request-edit').click();
    await expect(tid(B.page, 'lock-requested')).toHaveText(/^Requested \d{1,2}:\d\d [AP]M$/);
    await expect(tid(B.page, 'lock-cancel-request')).toBeVisible();
    await expect(tid(A.page, 'holder-prompt')).toBeVisible();
    await expect(tid(A.page, 'holder-prompt')).toContainText('Bea Editor wants to edit');
    const countdown = tid(A.page, 'holder-prompt-countdown');
    await expect(countdown).toHaveText(/^[45]:[0-5]\d$/);
    const first = await countdown.textContent();
    await expect.poll(() => countdown.textContent()).not.toBe(first);

    // No answer: the deadline passes and the holder's next save releases the lock (AC-1, AC-7).
    const { error } = await adminDb()
      .from('edit_request')
      .update({ deadline_at: new Date(Date.now() - 1000).toISOString() })
      .eq('project_id', ids.P1)
      .is('response', null);
    if (error) throw new Error(`deadline update failed: ${error.code}`);
    await rename(A.page, 'Floor A');
    await expect(tid(A.page, 'holder-prompt')).toHaveCount(0);
    await expect(tid(A.page, 'lock-lost-banner')).toHaveAttribute('data-reason', 'auto');
    await expect(tid(A.page, 'lock-lost-banner')).toContainText(
      'Changes not yet saved stay on this device.',
    );
    await expect(tid(A.page, 'stop-editing')).toHaveCount(0);

    // The banner turns green: the Available toast with Start editing; the first press takes the lock.
    await expect(tid(B.page, 'lock-banner')).toHaveCount(0);
    const toast = canvasToasts(B.page);
    await expect(toast).toHaveCount(1);
    await expect(toast).toContainText('Available to edit · Alex Holder left the plan');
    await toast.getByRole('button', { name: 'Start editing' }).click();
    await expect(tid(B.page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await B.page.mouse.move(700, 400);
    await expect(tid(B.page, 'stop-editing')).toBeVisible();
    await expect(tid(B.page, 'lock-view-only')).toHaveCount(0);
    await expect(tid(A.page, 'lock-banner')).toHaveText(BANNER('Bea Editor'));
    // The new holder's edit reaches the database.
    await rename(B.page, 'Floor B');
    await expect.poll(() => floorName(ids.P1)).toBe('Floor B');
  });

  test('EZD-126 E2 Esc keeps the prompt; Keep returns Request edit with a toast; ask again; Cancel', async ({
    sessions,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const a = await member(tenant, EDITOR, 'Alex Holder');
    const b = await member(tenant, EDITOR, 'Bea Editor');
    const [A, B] = await sessions.open([a.email, b.email]);
    await open(A.page, ids.P1);
    await expect(tid(A.page, 'stop-editing')).toBeVisible();
    await open(B.page, ids.P1);
    await tid(B.page, 'lock-request-edit').click();
    await expect(tid(A.page, 'holder-prompt')).toBeVisible();

    await A.page.keyboard.press('Escape');
    await expect(tid(A.page, 'holder-prompt')).toBeVisible();

    await tid(A.page, 'holder-prompt-keep').click();
    await expect(tid(A.page, 'holder-prompt')).toHaveCount(0);
    await expect(tid(B.page, 'lock-request-edit')).toBeVisible();
    await expect(canvasToasts(B.page)).toContainText('Alex Holder kept editing. You can ask again.');
    await expect(tid(A.page, 'stop-editing')).toBeVisible();

    await tid(B.page, 'lock-request-edit').click();
    await expect(tid(B.page, 'lock-requested')).toBeVisible();
    await expect(tid(A.page, 'holder-prompt')).toBeVisible();

    await tid(B.page, 'lock-cancel-request').click();
    await expect(tid(B.page, 'lock-request-edit')).toBeVisible();
    await expect(tid(A.page, 'holder-prompt')).toHaveCount(0);
  });

  test('EZD-126 E3 Stop editing: everyone gets the toast, without Edit model it clears, first press wins', async ({
    sessions,
  }) => {
    test.setTimeout(180_000);
    const tenant = await createTenant();
    const ids = await seedFixtureS(tenant);
    const a = await member(tenant, EDITOR, 'Alex Holder');
    const b = await member(tenant, EDITOR, 'Bea Editor');
    const c = await member(tenant, VIEWER, 'Cy Viewer');
    const [A, B, C] = await sessions.open([a.email, b.email, c.email]);
    await open(A.page, ids.P1);
    await expect(tid(A.page, 'stop-editing')).toBeVisible();
    await open(B.page, ids.P1);
    await open(C.page, ids.P1);

    // AC-4: Stop editing only for the holder; the viewer without Edit model has no Request edit.
    await expect(tid(B.page, 'stop-editing')).toHaveCount(0);
    await expect(tid(C.page, 'stop-editing')).toHaveCount(0);
    await expect(tid(C.page, 'lock-banner')).toHaveText(BANNER('Alex Holder'));
    await expect(tid(C.page, 'lock-request-edit')).toHaveCount(0);
    await expect(tid(C.page, 'lock-view-only')).toBeVisible();
    await expect(tid(A.page, 'presence-avatar')).toHaveCount(2);

    await tid(A.page, 'stop-editing').click();
    await expect(tid(A.page, 'stop-editing')).toHaveCount(0);
    await expect(tid(A.page, 'lock-view-only')).toBeVisible();

    // AC-3: every member gets the green toast; Start editing only with Edit model.
    for (const s of [A, B, C]) {
      await expect(canvasToasts(s.page)).toContainText('Available to edit · Alex Holder left the plan');
    }
    await expect(canvasToasts(A.page).getByRole('button', { name: 'Start editing' })).toBeVisible();
    await expect(canvasToasts(B.page).getByRole('button', { name: 'Start editing' })).toBeVisible();
    await expect(canvasToasts(C.page).getByRole('button', { name: 'Start editing' })).toHaveCount(0);
    await expect(canvasToasts(C.page)).toHaveCount(0, { timeout: 8000 });
    await expect(canvasToasts(B.page)).toHaveCount(1);

    await canvasToasts(B.page).getByRole('button', { name: 'Start editing' }).click();
    await expect(tid(B.page, 'editor-state')).toHaveAttribute('data-editor-state', 'ready');
    await B.page.mouse.move(700, 400);
    await expect(tid(B.page, 'stop-editing')).toBeVisible();
    await expect(canvasToasts(A.page)).toHaveCount(0);
    await expect(tid(A.page, 'lock-banner')).toHaveText(BANNER('Bea Editor'));
    await expect(tid(C.page, 'lock-banner')).toHaveText(BANNER('Bea Editor'));
    await rename(B.page, 'Floor B');
    await expect.poll(() => floorName(ids.P1)).toBe('Floor B');
  });
});
