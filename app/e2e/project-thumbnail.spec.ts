// EZD-224 B1 (vault/plans/EZD-224.md section 4; AC-EZD-224-1, -2, -3). Untagged, so desktop (1600 x 1000). Run with
// `node /Users/josh/Projects/ezdraft/scripts/ui-run.mjs EZD-224 app/e2e/project-thumbnail.spec.ts`. The test makes its
// own company (never tenant 1), a member and two projects; the thumbnail goes up through the routes (a checkpoint,
// start, the signed upload of THUMB_WEBP, complete). Expected values: the plan's B1 row (fixture size 440 x 256;
// S01 Card thumbnail; 11 rule 12). Objects the test makes are removed in afterAll. No import.meta or __dirname
// (lesson L-017).
import { uploadFile, type SignedUpload } from '../src/lib/storage/upload';
import {
  adminDb,
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
import { appOriginHeaders } from '../test-harness/e2e/same-origin';
import { THUMB_WEBP } from '../test-harness/thumbnail/fixture';

const madePaths: string[] = [];

test.describe('EZD-224 project thumbnail', () => {
  test.afterAll(async () => {
    try {
      if (madePaths.length > 0) await adminDb().storage.from('media').remove(madePaths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-224 B1 a stored thumbnail loads on its card from a signed link; the other card keeps its empty slot', async ({
    page,
    signInAs,
  }) => {
    const tenant = await createTenant();
    const [a, b] = await createProjects(tenant, 2);
    const member = await createMember({ tenantId: tenant, scope: 'all', listed: [] });
    await setPermissions(tenant, member.membershipId, ['view_projects', 'edit_model'] as never);
    const names = await harnessSql()<{ id: string; name: string }[]>`
      select id, name from public.project where id in (${a}::uuid, ${b}::uuid)`;
    const nameOf = (id: string) => names.find((n) => n.id === id)?.name as string;

    await signInAs(member.email);
    const headers = appOriginHeaders();

    const made = await page.request.post(`/api/projects/${a}/checkpoints`, { headers });
    expect(made.status()).toBe(201);
    const versionId = ((await made.json()) as { version: { id: string } }).version.id;
    madePaths.push(`${tenant}/${a}/thumb/${versionId}.webp`);

    const started = await page.request.post(`/api/projects/${a}/versions/${versionId}/thumbnail`, {
      headers,
    });
    expect(started.status()).toBe(200);
    const { upload } = (await started.json()) as { upload: SignedUpload };
    await uploadFile(upload, new Blob([THUMB_WEBP as BlobPart]), { contentType: 'image/webp' });
    const completed = await page.request.post(
      `/api/projects/${a}/versions/${versionId}/thumbnail/complete`,
      { headers },
    );
    expect(completed.status()).toBe(200);

    const requested: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    const answered = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/projects/${a}/thumbnail`,
    );
    await page.goto('/');

    const redirect = await answered;
    expect(redirect.status()).toBe(302);
    expect(redirect.headers().location).toContain(
      `/storage/v1/object/sign/media/${tenant}/${a}/thumb/${versionId}.webp?token=`,
    );

    const cardA = page.getByTestId('project-card').filter({ hasText: nameOf(a) });
    const cardB = page.getByTestId('project-card').filter({ hasText: nameOf(b) });
    await expect(cardA).toHaveCount(1);
    await expect(cardB).toHaveCount(1);
    const img = cardA.getByTestId('project-card-thumb-img');
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBe(440);
    expect(await img.evaluate((el) => (el as HTMLImageElement).naturalHeight)).toBe(256);

    await expect(cardB.getByTestId('project-card-thumb-img')).toHaveCount(0);
    expect(requested).not.toContain(`/api/projects/${b}/thumbnail`);
    expect(await page.evaluate(() => document.querySelectorAll('canvas').length)).toBe(0);
  });
});
