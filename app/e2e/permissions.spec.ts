// EZD-102 B1-B6 and the done-when test (vault/plans/EZD-102.md section 4; AC-EZD-102-1..5). Untagged, so
// desktop only. Fresh tenants, projects and members from EZD-006's fixtures through the harness test.ts,
// removed in afterAll; switches set with setPermissions (section 3 harness) or one admin SQL update (B4).
// Routes, bodies and data-testid values: section 3. Expected values: AC-1..5; Q-0214 (the no-access text);
// Q-0232 (no access shown in place, no redirect); Q-0202 (own jobs = listed projects); EZD-101 T7 (Owner has
// all 37); ARCH Errors (401 body). Wait 10,000 ms, quiet 3,000 ms (app/e2e/realtime.spec.ts).
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
  signInAsOwner,
  test,
} from '../test-harness/e2e/test';

const WAIT = 10_000;
const QUIET = 3_000;
const NO_ACCESS_EN = "You don't have access to this. Ask your supervisor.";
const RENAMED = 'EZD-102 renamed';

const renamePath = (id: string) => `/api/dev/permissions/projects/${id}`;

async function projectName(id: string): Promise<string> {
  const rows = await harnessSql()`select name from public.project where id = ${id}::uuid`;
  return rows[0].name as string;
}

const listedIds = (page: Page) =>
  page
    .locator('[data-testid=perm-projects] li[data-project-id]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-project-id') ?? ''));

test.describe('EZD-102 permission enforcement', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-102 done when: a user missing a permission gets 403 from the API and the control is absent from the page', async ({
    sessions,
  }) => {
    const tenant = await createTenant();
    const [p] = await createProjects(tenant, 1);
    const m = await createMember({ tenantId: tenant, scope: 'listed', listed: [p] });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const [s] = await sessions.open([m.email]);

    const res = await s.page.request.patch(renamePath(p), { data: { name: RENAMED } });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });

    await s.page.goto('/dev/permissions');
    await expect(s.page.getByTestId('perm-controls')).toBeAttached();
    await expect(s.page.getByTestId('perm-control-edit_model')).toHaveCount(0);
  });

  test('B1 rename: 403 without the switch, 404 outside the list, 200 with both, 401 signed out', async ({
    sessions,
    request,
  }) => {
    const tenant = await createTenant();
    const [p, q] = await createProjects(tenant, 2);
    const pName = await projectName(p);
    const qName = await projectName(q);
    const m = await createMember({ tenantId: tenant, scope: 'listed', listed: [p] });
    await setPermissions(tenant, m.membershipId, ['view_projects']);

    const [first] = await sessions.open([m.email]);
    const refused = await first.page.request.patch(renamePath(p), { data: { name: RENAMED } });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
    expect(await projectName(p)).toBe(pName);

    await setPermissions(tenant, m.membershipId, ['view_projects', 'edit_model']);
    const [second] = await sessions.open([m.email]);
    const outside = await second.page.request.patch(renamePath(q), { data: { name: RENAMED } });
    expect(outside.status()).toBe(404);
    expect(await outside.json()).toEqual({
      error: { code: 'project_not_found', message_key: 'error.project_not_found' },
    });
    expect(await projectName(q)).toBe(qName);

    const renamed = await second.page.request.patch(renamePath(p), { data: { name: RENAMED } });
    expect(renamed.status()).toBe(200);
    expect(await renamed.json()).toEqual({ project: { id: p, name: RENAMED } });
    expect(await projectName(p)).toBe(RENAMED);

    const signedOut = await request.patch(renamePath(p), { data: { name: 'EZD-102 signed out' } });
    expect(signedOut.status()).toBe(401);
    expect(await signedOut.json()).toEqual({
      error: { code: 'not_signed_in', message_key: 'error.not_signed_in' },
    });
    expect(await projectName(p)).toBe(RENAMED);
  });

  test('B2 hidden: controls a member lacks are absent, not disabled; the owner sees both enabled', async ({
    sessions,
    page,
  }) => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const [s] = await sessions.open([m.email]);
    await s.page.goto('/dev/permissions');
    const controls = s.page.getByTestId('perm-controls');
    await expect(controls).toBeAttached();
    await expect(s.page.getByTestId('perm-control-edit_model')).toHaveCount(0);
    await expect(s.page.getByTestId('perm-control-delete_projects')).toHaveCount(0);
    await expect(controls.locator('[disabled], [aria-disabled]')).toHaveCount(0);

    await signInAsOwner(page);
    await page.goto('/dev/permissions');
    for (const id of ['perm-control-edit_model', 'perm-control-delete_projects']) {
      await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId(id)).toBeEnabled();
    }
  });

  test('B3 no access: a member with no switches sees the no-access text in place', async ({
    sessions,
  }) => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, []);
    const [s] = await sessions.open([m.email]);
    await s.page.goto('/dev/permissions');
    await expect(s.page.getByTestId('no-access')).toHaveText(NO_ACCESS_EN);
    expect(new URL(s.page.url()).pathname).toBe('/dev/permissions');
    await expect(s.page.getByTestId('perm-projects')).toHaveCount(0);
  });

  test('B4 live: a switch changed in the database shows up without a reload, with one request after the event', async ({
    sessions,
  }) => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const [s] = await sessions.open([m.email]);
    const page = s.page;

    let permissionRequests = 0;
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/permissions') permissionRequests++;
    });

    await page.goto('/dev/permissions');
    await expect(page.locator('[data-testid=perm-channel][data-status=subscribed]')).toBeAttached({
      timeout: WAIT,
    });
    await page.evaluate(() => {
      (window as unknown as { __ezd102?: number }).__ezd102 = 1;
    });
    await page.waitForTimeout(QUIET);
    expect(permissionRequests).toBe(0);
    await expect(page.getByTestId('perm-control-edit_model')).toHaveCount(0);

    await harnessSql()`
      update public.user_permission set granted = true
      where membership_id = ${m.membershipId}::uuid and permission_key = 'edit_model'`;

    await expect(page.getByTestId('perm-control-edit_model')).toBeVisible({ timeout: WAIT });
    await page.waitForTimeout(QUIET);
    expect(permissionRequests).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __ezd102?: number }).__ezd102)).toBe(
      1,
    );
    await expect(page.getByTestId('perm-keys')).toHaveText('edit_model,view_projects');
  });

  test('B5 own jobs: a listed member sees only listed projects; an all-projects member sees every one', async ({
    sessions,
  }) => {
    const tenant = await createTenant();
    const [p, q] = await createProjects(tenant, 2);
    const pName = await projectName(p);
    const listed = await createMember({ tenantId: tenant, scope: 'listed', listed: [p] });
    const all = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, listed.membershipId, ['view_projects']);
    await setPermissions(tenant, all.membershipId, ['view_projects']);
    const [ls, as] = await sessions.open([listed.email, all.email]);

    await ls.page.goto('/dev/permissions');
    await expect(ls.page.getByTestId('perm-projects')).toBeAttached();
    expect(await listedIds(ls.page)).toEqual([p]);

    await ls.page.goto(`/dev/permissions/projects/${q}`);
    await expect(ls.page.getByTestId('no-access')).toHaveText(NO_ACCESS_EN);
    expect(new URL(ls.page.url()).pathname).toBe(`/dev/permissions/projects/${q}`);

    await ls.page.goto(`/dev/permissions/projects/${p}`);
    const project = ls.page.getByTestId('perm-project');
    await expect(project).toHaveText(pName);
    await expect(project).toHaveAttribute('data-project-id', p);

    await as.page.goto('/dev/permissions');
    await expect(as.page.getByTestId('perm-projects')).toBeAttached();
    expect((await listedIds(as.page)).sort()).toEqual([p, q].sort());
  });

  test('B6 route: GET /api/permissions answers the own sorted set with no-store; 401 signed out', async ({
    sessions,
    request,
  }) => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const [s] = await sessions.open([m.email]);

    const res = await s.page.request.get('/api/permissions');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ permissions: ['view_projects'] });
    expect(res.headers()['cache-control'] ?? '').toContain('no-store');

    const out = await request.get('/api/permissions');
    expect(out.status()).toBe(401);
    expect(await out.json()).toEqual({
      error: { code: 'not_signed_in', message_key: 'error.not_signed_in' },
    });
  });
});
