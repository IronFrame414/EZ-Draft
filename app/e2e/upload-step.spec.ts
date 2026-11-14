// EZD-301 (AC-EZD-301-1, AC-EZD-301-2; S01 Start from a file flow; S02 Entry; 08 Imports; Q-0410; Q-0398). Untagged,
// so desktop 1600 x 1000. Every test makes its own company (never tenant 1); objects it stores are removed in
// afterAll and the company with cleanup(). Expected values: S01 text "Save this drawing as DXF and upload the DXF";
// board S01 menu text (Standalone, Start from a file); originals stored unchanged (08 Imports), compared by
// sha-256 and length of random bytes; import.started { projectId, sourceFileIds } and project.created source file
// (S01 Events emitted); the file entry needs Edit model with Create projects (S02 Permissions).
import { createHash, randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  expect,
  harnessSql,
  setPermissions,
  test,
  type PermissionKey,
} from '../test-harness/e2e/test';

const tid = (page: Page, id: string) => page.getByTestId(id);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const DWG_PROMPT = 'Save this drawing as DXF and upload the DXF';

async function member(keys: PermissionKey[]): Promise<{ tenant: string; email: string }> {
  const tenant = await createTenant();
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, keys);
  return { tenant, email: m.email };
}

type Row = {
  id: string;
  kind: string;
  original_name: string;
  storage_path: string;
  uploaded_at: Date | null;
};

async function sourceFiles(projectId: string): Promise<Row[]> {
  return harnessSql()<Row[]>`
    select id, kind, original_name, storage_path, uploaded_at from public.source_file
    where project_id = ${projectId}::uuid order by original_name`;
}

async function stored(path: string): Promise<Uint8Array> {
  const { data, error } = await adminDb().storage.from('sources').download(path);
  if (error || !data) throw new Error(`download failed: ${error?.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

test.describe('EZD-301 Upload step', () => {
  const paths: string[] = [];

  test.afterAll(async () => {
    try {
      if (paths.length > 0) await adminDb().storage.from('sources').remove(paths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  test('EZD-301 B1 Start from a file: a DWG shows the prompt; originals are stored byte-identical (AC-1, AC-2)', async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(120_000);
    const { email } = await member(['view_projects', 'create_projects', 'edit_model']);
    await signInAs(email);
    await page.goto('/');

    await tid(page, 'projects-new').click();
    await expect(tid(page, 'projects-new-menu')).toBeVisible();
    await expect(tid(page, 'projects-new-standalone')).toContainText('Standalone');
    await expect(tid(page, 'projects-new-file')).toContainText('Start from a file');
    await expect(tid(page, 'projects-new-file')).toContainText('Polycam scan, PDF or DXF');
    await tid(page, 'projects-new-file').click();
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('336 Golfview Rd');
    await tid(page, 'new-project-next').click();
    await expect(tid(page, 'new-project-source-polycam')).toHaveAttribute('aria-checked', 'true');
    await expect(tid(page, 'new-project-create')).toHaveText('Continue to review');
    await expect(tid(page, 'new-project-create')).toBeDisabled();

    // AC-EZD-301-1: a DWG is refused with the prompt and is not listed.
    await tid(page, 'upload-input').setInputFiles({
      name: 'kitchen.dwg',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(randomBytes(4096)),
    });
    await expect(tid(page, 'upload-refused-message')).toHaveText(DWG_PROMPT);
    await expect(tid(page, 'upload-file')).toHaveCount(0);
    await expect(tid(page, 'new-project-create')).toBeDisabled();

    // AC-EZD-301-2: a Polycam DXF and GLB, sent as browsers report them (no or a generic type).
    const dxf = new Uint8Array(randomBytes(250_003));
    const glb = new Uint8Array(randomBytes(400_009));
    await tid(page, 'upload-input').setInputFiles([
      { name: 'scan.dxf', mimeType: '', buffer: Buffer.from(dxf) },
      { name: 'scan.glb', mimeType: 'application/octet-stream', buffer: Buffer.from(glb) },
      { name: 'extra.pdf', mimeType: 'application/pdf', buffer: Buffer.from(randomBytes(100)) },
    ]);
    await expect(tid(page, 'upload-refused')).toHaveCount(0);
    await expect(tid(page, 'upload-file')).toHaveCount(3);
    await expect(tid(page, 'upload-file').nth(0)).toHaveAttribute('data-kind', 'polycam_dxf');
    await expect(tid(page, 'upload-file').nth(1)).toHaveAttribute('data-kind', 'polycam_glb');
    await expect(tid(page, 'upload-file').nth(2)).toHaveAttribute('data-kind', 'pdf');
    // The user can correct a tag, and Remove drops a file before import.
    await tid(page, 'upload-file-tag').nth(2).selectOption('supplier_pdf');
    await expect(tid(page, 'upload-file').nth(2)).toHaveAttribute('data-kind', 'supplier_pdf');
    await tid(page, 'upload-file-remove').nth(2).click();
    await expect(tid(page, 'upload-file')).toHaveCount(2);
    await expect(tid(page, 'new-project-create-will-upload')).toContainText(
      'Upload 2 files unchanged and start the import',
    );

    await tid(page, 'new-project-create').click();
    // EZD-307: a Polycam DXF queues detection, so Continue to review opens Import review for it. The DXF here is
    // random bytes, so detection fails and the review names the file (S02 States Error).
    await page.waitForURL(/\/projects\/[0-9a-f-]{36}\/import\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const projectId = page.url().split('/').at(-3) as string;
    await expect(tid(page, 'import-review-message')).toHaveText("Couldn't read scan.dxf.", {
      timeout: 60_000,
    });

    const rows = await sourceFiles(projectId);
    for (const r of rows) paths.push(r.storage_path);
    expect(rows.map((r) => [r.original_name, r.kind])).toEqual([
      ['scan.dxf', 'polycam_dxf'],
      ['scan.glb', 'polycam_glb'],
    ]);
    for (const r of rows) expect(r.uploaded_at, r.original_name).not.toBeNull();
    const got = [await stored(rows[0].storage_path), await stored(rows[1].storage_path)];
    expect(got[0].length).toBe(dxf.length);
    expect(sha(got[0])).toBe(sha(dxf));
    expect(got[1].length).toBe(glb.length);
    expect(sha(got[1])).toBe(sha(glb));

    const events = await harnessSql()<{ action: string; details: Record<string, unknown> }[]>`
      select action, details from public.event_log
      where object_id = ${projectId}::uuid and action in ('project.created', 'import.started')
      order by at`;
    expect(events.map((e) => e.action)).toEqual(['project.created', 'import.started']);
    expect(events[0].details).toMatchObject({ projectId, source: 'file' });
    expect(events[1].details).toEqual({ projectId, sourceFileIds: rows.map((r) => r.id) });

    // S02 Entry: a new file to the existing project, from the editor header.
    await page.goto(`/projects/${projectId}`);
    const pdf = new Uint8Array(randomBytes(90_001));
    await tid(page, 'editor-upload-files').click();
    await expect(tid(page, 'upload-files-dialog')).toBeVisible();
    await tid(page, 'upload-input').setInputFiles({
      name: 'plan.dwg',
      mimeType: '',
      buffer: Buffer.from(randomBytes(10)),
    });
    await expect(tid(page, 'upload-refused-message')).toHaveText(DWG_PROMPT);
    await tid(page, 'upload-input').setInputFiles({
      name: 'plan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdf),
    });
    await tid(page, 'upload-files-continue').click();
    await expect(tid(page, 'upload-files-dialog')).toHaveCount(0, { timeout: 60_000 });
    const after = await sourceFiles(projectId);
    const plan = after.find((r) => r.original_name === 'plan.pdf');
    expect(plan?.kind).toBe('pdf');
    paths.push(plan?.storage_path as string);
    expect(sha(await stored(plan?.storage_path as string))).toBe(sha(pdf));
  });

  test('EZD-301 B2 without Edit model, New project opens the wizard directly with Blank only', async ({
    page,
    signInAs,
  }) => {
    const { email } = await member(['view_projects', 'create_projects']);
    await signInAs(email);
    await page.goto('/');
    await tid(page, 'projects-new').click();
    await expect(tid(page, 'new-project-dialog')).toBeVisible();
    await expect(tid(page, 'projects-new-menu')).toHaveCount(0);
    await tid(page, 'new-project-type').selectOption({ label: 'Kitchen' });
    await tid(page, 'new-project-address').fill('12 Oak Ave');
    await tid(page, 'new-project-next').click();
    await expect(tid(page, 'new-project-source-blank')).toBeVisible();
    await expect(tid(page, 'new-project-source-polycam')).toHaveCount(0);
  });
});
