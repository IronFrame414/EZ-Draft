// EZD-132 B1 (vault/plans/EZD-132.md section 4; AC-EZD-132-1, AC-EZD-132-4; 11 Operations): a file picked in
// the browser goes straight to Storage in resumable chunks, never through the app server, and downloads
// byte-identical. Untagged, so desktop only. Josh (seeded owner) on seed project 1; the source_file row and
// object the test makes are removed in afterAll (seed rule: tests remove what they add). Selectors: section 3
// data-testid row. X = randomBytes(7340155) (two PATCHes of 6,291,456 and 1,048,699 bytes).
import { createHash, randomBytes } from 'node:crypto';
import {
  adminDb,
  closeHarness,
  expect,
  harnessSql,
  seedProjectId,
  signInAsOwner,
  test,
} from '../test-harness/e2e/test';

const X_BYTES = 7340155;
const APP_ORIGIN = 'http://127.0.0.1:3000';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test.describe('EZD-132 file storage from the browser', () => {
  let sourceFileId = '';
  let storagePath = '';

  test.afterAll(async () => {
    try {
      if (storagePath) await adminDb().storage.from('sources').remove([storagePath]);
      if (sourceFileId) {
        await harnessSql()`delete from public.source_file where id = ${sourceFileId}::uuid`;
      }
    } finally {
      await closeHarness();
    }
  });

  test('EZD-132 B1 a browser upload goes straight to Storage and downloads byte-identical', async ({
    page,
  }) => {
    const X = randomBytes(X_BYTES);
    await signInAsOwner(page);
    await page.goto(`/dev/storage?project=${seedProjectId(1)}`);

    const patches: string[] = [];
    const appBodies: Array<{ url: string; bytes: number }> = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH') patches.push(request.url());
      if (request.url().startsWith(APP_ORIGIN)) {
        appBodies.push({ url: request.url(), bytes: request.postDataBuffer()?.length ?? 0 });
      }
    });

    await page
      .getByTestId('storage-file')
      .setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: X });
    await expect(page.getByTestId('storage-status')).toHaveText('done', { timeout: 60_000 });

    sourceFileId = ((await page.getByTestId('storage-source-file-id').textContent()) ?? '').trim();
    expect(sourceFileId.length).toBeGreaterThan(0);
    const rows = await harnessSql()<{ storage_path: string }[]>`
      select storage_path from public.source_file where id = ${sourceFileId}::uuid`;
    storagePath = rows[0]?.storage_path ?? '';

    const downloadUrl = (
      (await page.getByTestId('storage-download-url').textContent()) ?? ''
    ).trim();
    const res = await fetch(downloadUrl);
    expect(res.status).toBe(200);
    expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(sha(X));

    const resumable = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable/sign/`;
    expect(patches).toHaveLength(2);
    for (const url of patches) expect(url.startsWith(resumable), url).toBe(true);
    expect(appBodies.length).toBeGreaterThan(0);
    for (const r of appBodies) expect(r.bytes, r.url).toBeLessThan(1024);
  });
});
