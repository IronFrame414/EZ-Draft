// EZD-236 B1 (vault/plans/EZD-236.md section 4; AC-EZD-236-2, -3). Untagged, so desktop. Expected values: the
// route answers 201 `{ project: { id } }`; the model route (P120b) returns 3,000 objects and `invalid` []; the
// editor (P120c) reaches `ready` with 3,000 objects; the Projects page (P117a) shows only the normal project.
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  expect,
  setPermissions,
  test,
} from '../test-harness/e2e/test';
import { appOriginHeaders } from '../test-harness/e2e/same-origin';

test.describe('EZD-236 benchmark project', () => {
  test.afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-236 B1 opens in the editor and never shows on Projects', async ({
    page: p,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const tenant = await createTenant();
    const [normal] = await createProjects(tenant, 1);
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, [
      'view_projects',
      'edit_model',
      'settings_system_status',
    ]);
    await signInAs(member.email);

    const made = await p.request.post('/api/benchmark/project', { headers: appOriginHeaders() });
    expect(made.status()).toBe(201);
    const id = ((await made.json()) as { project: { id: string } }).project.id;

    const model = await p.request.get(`/api/projects/${id}/model`);
    expect(model.status()).toBe(200);
    const body = (await model.json()) as { objects: unknown[]; invalid: unknown[] };
    expect(body.objects).toHaveLength(3000);
    expect(body.invalid).toEqual([]);

    await p.goto(`/projects/${id}`);
    await expect(p.locator('[data-testid="editor-state"][data-editor-state="ready"]')).toHaveCount(
      1,
    );
    expect(
      await p.evaluate(
        () =>
          (
            window as unknown as { __ezdraftEditor: { objects(): unknown[] } }
          ).__ezdraftEditor.objects().length,
      ),
    ).toBe(3000);

    await p.goto('/');
    await expect(p.getByTestId('projects-grid')).toBeVisible();
    await expect(p.getByTestId('project-card')).toHaveCount(1);
    await expect(p.getByTestId('project-card')).toHaveAttribute('data-project-id', normal!);
    // L-051: let the page's requests finish before afterAll cleans up (the page is closed by then).
    await p.waitForLoadState('networkidle');
  });
});
