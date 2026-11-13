// EZD-129 browser tests (AC-EZD-129-1, -2, -3, -4; PHASES slice 7 test script step 6), desktop 1600 x 1000. Each
// test makes its own tenant through app/test-harness/users/fixtures.ts and signs in with signInAs (the second
// person through the sessions fixture). Expected values: board S15AccessPassword approved wording ("Project
// access", "All projects", "Listed projects", "Sees every project.", "Choose projects", "2 listed", "2 projects
// listed", "This person sees no projects"); boards S01bForeman and S01bForemanStates approved wording
// ("Foreman", "Optional", "No foreman yet", "Active members", "Create adds this project to Luis Ortega's listed
// projects.", "Add it to Luis Ortega's listed projects"); S01 Permissions (a Listed user sees only their
// projects); Q-0695 decisions 10 row 63 (zero listed projects saves); Q-0202 (a picked Foreman is listed).
import type { Page } from '@playwright/test';
import {
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  expect,
  harnessSql,
  test,
} from '../test-harness/e2e/test';
import { addUser, hex8 } from '../test-harness/users/fixtures';

const tid = (page: Page, id: string) => page.getByTestId(id);
const rowOf = (page: Page, name: string) =>
  page.locator('[data-testid="user-row"]', { hasText: name });
const projectRow = (page: Page, name: string) =>
  page.locator('[data-testid="users-access-project"]', { hasText: name });

async function listedOf(membershipId: string): Promise<string[]> {
  const rows = await harnessSql()<{ id: string }[]>`
    select project_id::text as id from public.membership_project
    where membership_id = ${membershipId}::uuid order by project_id`;
  return rows.map((r) => r.id);
}

async function scopeOf(membershipId: string): Promise<string> {
  const rows = await harnessSql()<{ scope: string }[]>`
    select scope from public.membership where id = ${membershipId}::uuid`;
  return rows[0].scope;
}

async function nameProjects(ids: readonly string[], names: readonly string[]) {
  for (let i = 0; i < ids.length; i++) {
    await harnessSql()`update public.project set name = ${names[i]} where id = ${ids[i]}::uuid`;
  }
}

test.describe('EZD-129 user project scope', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('P1 set a Foreman to Listed projects with one project; signed in as them, Projects shows only that project (AC-1, AC-2; slice 7 step 6)', async ({
    page,
    signInAs,
    sessions,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const ids = await createProjects(tenant, 2);
    await nameProjects(ids, ['Hendricks kitchen', 'Primary bath']);
    const owner = await addUser(tenant, { preset: 'owner', name: 'Ada Owner' });
    const foreman = await addUser(tenant, { preset: 'foreman', name: 'Luis Ortega' });
    await signInAs(owner.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Luis Ortega').click();

    // All projects: the helper line.
    await expect(tid(page, 'users-access')).toContainText('Project access');
    await expect(tid(page, 'users-access-all')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'users-access-all-help')).toHaveText('Sees every project.');

    // Listed with none yet; then pick one project in the picker.
    await tid(page, 'users-access-listed').click();
    await expect(tid(page, 'users-access-summary')).toHaveText('This person sees no projects');
    await expect(tid(page, 'users-unsaved')).toContainText('Unsaved: 1 change');
    await tid(page, 'users-access-choose').click();
    await expect(tid(page, 'users-access-search')).toHaveAttribute('placeholder', 'Search projects');
    await expect(page.getByTestId('users-access-project')).toHaveCount(2);
    await expect(tid(page, 'users-access-count')).toHaveText('0 listed');
    await projectRow(page, 'Hendricks kitchen').click();
    await expect(tid(page, 'users-access-count')).toHaveText('1 listed');
    await expect(tid(page, 'users-access-summary')).toHaveText('1 project listed');
    await projectRow(page, 'Primary bath').click();
    await expect(tid(page, 'users-access-count')).toHaveText('2 listed');
    await expect(tid(page, 'users-access-summary')).toHaveText('2 projects listed');
    await projectRow(page, 'Primary bath').click();
    await expect(tid(page, 'users-unsaved')).toContainText('Unsaved: 2 changes');

    await tid(page, 'users-save').click();
    await expect(tid(page, 'users-unsaved')).toHaveCount(0);
    await expect.poll(() => scopeOf(foreman.membershipId)).toBe('listed');
    expect(await listedOf(foreman.membershipId)).toEqual([ids[0]]);

    // The saved access reads back after a reload.
    await page.reload();
    await rowOf(page, 'Luis Ortega').click();
    await expect(tid(page, 'users-access-listed')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'users-access-summary')).toHaveText('1 project listed');

    // Signed in as the Foreman: Projects shows only the listed project.
    const [f] = await sessions.open([foreman.email]);
    await f.page.goto('/');
    await expect(f.page.getByTestId('project-card')).toHaveCount(1);
    await expect(f.page.getByTestId('project-card')).toHaveAttribute('data-project-id', ids[0]);
  });

  test('P2 Listed with zero projects saves, and that person sees an empty Projects page (AC-4)', async ({
    page,
    signInAs,
    sessions,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    await createProjects(tenant, 2);
    const owner = await addUser(tenant, { preset: 'owner', name: 'Bea Owner' });
    const crew = await addUser(tenant, { preset: 'crew', name: 'Cy Crew' });
    await signInAs(owner.email);
    await page.goto('/settings/users');
    await rowOf(page, 'Cy Crew').click();
    await tid(page, 'users-access-listed').click();
    await tid(page, 'users-save').click();
    await expect(tid(page, 'users-unsaved')).toHaveCount(0);
    await expect.poll(() => scopeOf(crew.membershipId)).toBe('listed');
    expect(await listedOf(crew.membershipId)).toEqual([]);

    const [c] = await sessions.open([crew.email]);
    await c.page.goto('/');
    await expect(c.page.getByTestId('projects-empty')).toBeVisible();
    await expect(c.page.getByTestId('project-card')).toHaveCount(0);
  });

  test('P3 the wizard lists active members; a Listed Foreman picked there is listed and sees the new project (AC-3)', async ({
    page,
    signInAs,
    sessions,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const owner = await addUser(tenant, { preset: 'owner', name: 'Josh Owner' });
    const foreman = await addUser(tenant, { preset: 'foreman', name: 'Luis Ortega' });
    await harnessSql()`update public.membership set scope = 'listed'
      where id = ${foreman.membershipId}::uuid`;
    await addUser(tenant, { preset: 'crew', name: 'Invited Ivy', status: 'invited' });
    await signInAs(owner.email);
    await page.goto('/');
    await tid(page, 'projects-new').click();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    await tid(page, 'new-project-next').click();

    await expect(tid(page, 'new-project-foreman-field')).toContainText('Foreman');
    await expect(tid(page, 'new-project-foreman-field')).toContainText('Optional');
    await expect(tid(page, 'new-project-foreman')).toHaveText('No foreman yet');
    await tid(page, 'new-project-foreman').click();
    await expect(tid(page, 'new-project-foreman-menu')).toContainText('Active members');
    await expect(page.getByTestId('new-project-foreman-option')).toHaveText([
      /Josh Owner/,
      /Luis Ortega/,
    ]);
    await page.getByTestId('new-project-foreman-option').filter({ hasText: 'Luis Ortega' }).click();
    await expect(tid(page, 'new-project-foreman-listed')).toHaveText(
      "Create adds this project to Luis Ortega's listed projects.",
    );
    await expect(tid(page, 'new-project-create-will-foreman')).toHaveText(
      "Add it to Luis Ortega's listed projects",
    );
    await tid(page, 'new-project-create').click();
    await page.waitForURL(/\/projects\//);
    const projectId = new URL(page.url()).pathname.split('/')[2];
    expect(await listedOf(foreman.membershipId)).toEqual([projectId]);

    const [f] = await sessions.open([foreman.email]);
    await f.page.goto('/');
    await expect(f.page.getByTestId('project-card')).toHaveCount(1);
    await expect(f.page.getByTestId('project-card')).toHaveAttribute('data-project-id', projectId);
  });

  test('P4 the Invite dialog picks Listed projects; Send saves them on the new invite (AC-2)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const ids = await createProjects(tenant, 2);
    await nameProjects(ids, ['Hendricks kitchen', 'Primary bath']);
    const owner = await addUser(tenant, { preset: 'owner', name: 'Dee Owner' });
    await signInAs(owner.email);
    await page.goto('/settings/users');
    await tid(page, 'users-invite').click();
    const email = `luis.${hex8()}@example.com`;
    await tid(page, 'invite-email').fill(email);
    await tid(page, 'invite-role').selectOption({ label: 'Foreman' });
    await expect(tid(page, 'invite-access-listed')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(page, 'invite-access-summary')).toHaveText('This person sees no projects');
    await tid(page, 'invite-access-choose').click();
    await page
      .locator('[data-testid="invite-access-project"]', { hasText: 'Primary bath' })
      .click();
    await expect(tid(page, 'invite-access-summary')).toHaveText('1 project listed');
    await tid(page, 'invite-send').click();
    await expect(tid(page, 'invite-dialog')).toHaveAttribute('data-state-name', 'sent');
    const m = await harnessSql()<{ id: string }[]>`
      select m.id::text as id from public.membership m join public.app_user u on u.id = m.user_id
      where u.email = ${email} and m.tenant_id = ${tenant}::uuid`;
    await expect.poll(() => listedOf(m[0].id)).toEqual([ids[1]]);
    await expect(tid(page, 'invite-access-failed')).toHaveCount(0);
  });
});
