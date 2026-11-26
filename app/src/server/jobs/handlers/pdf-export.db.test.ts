// EZD-715 on the local stack (phase-07 EZD-715; AC-EZD-715-1, -2; 08 Exports Permit set, File name; CLAUDE.md rule
// 4): the export job reads a project's model with the secret key, writes its permit set as one PDF (or one per sheet
// from the same handler) to the exports bucket under the job's folder, and names each file from the address and the
// description with the version kept. Expected values: the address typed at create, 08's "buildingplans", Rev 0 for a
// set never issued (S13 Validation "Numbering"), the default permit set of a project with no Reflected ceiling plan
// box (EZD-701: A0.0 A1.0 A2.0 A3.0 A4.0 A5.0 E1.0 E2.0 R1.0), 24x36 = 2592 x 1728 pt. A job of another company that
// names this project finds nothing and writes nothing. No new table or policy (the job and model_object tables keep
// their own RLS tests); the exports bucket has no client policy, so only the secret key reads the files.
import { randomUUID } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../../test-harness/jobs/queue-lock';
import { expectSafeToRunTwice } from '../../../../test-harness/jobs/run-twice';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../../test-harness/rls/fixtures';
import { getHandlers } from '../handlers';
import type { PdfExportPayload, PdfExportResult } from './pdf-export';

const DEFAULT_PERMIT_SHEETS = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const CREATED_AT = '2026-11-26T10:00:00.000Z';

describe('EZD-715 PDF export job', () => {
  let release: () => Promise<void>;
  let tA = '';
  let tB = '';
  let pA = '';
  let editor: Session;
  const jobIds: string[] = [];

  async function newJob(payload: PdfExportPayload): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({ tenant_id: tA, project_id: pA, kind: 'export', payload, status: 'done', max_attempts: 3 })
      .select('id')
      .single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    jobIds.push(id);
    return id;
  }

  async function run(payload: PdfExportPayload, job: { id: string; tenant_id: string; project_id: string }) {
    const handler = getHandlers().export!;
    const outcome = await handler.run({
      job: { ...job, kind: 'export', attempts: 1, created_at: CREATED_AT },
      payload: handler.payload.parse(payload),
      state: null,
      progress: async () => {},
      timeLeft: () => Number.MAX_SAFE_INTEGER,
      sleep: async () => {},
      signal: new AbortController().signal,
    } as never);
    return (outcome as { done: PdfExportResult }).done;
  }

  async function pdfAt(path: string) {
    const { data, error } = await adminDb().storage.from('exports').download(path);
    if (error) throw error;
    return getDocument({ data: new Uint8Array(await data.arrayBuffer()), disableFontFace: true, useSystemFonts: false })
      .promise;
  }

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    tB = await createTenant();
    const m = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, m.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    editor = await signIn(m.email);
    const made = await editor.serverDb.rpc('create_project', {
      p_name: 'Golfview',
      p_address: '336 Golfview Rd',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    if (made.error) throw made.error;
    pA = (made.data as { project_id: string }[])[0]!.project_id;
    const [floor] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${pA}::uuid and type = 'floor'`;
    const lock = await editor.serverDb.rpc('acquire_edit_lock', { p_project: pA, p_device_id: 'dev-a' });
    if (lock.error) throw lock.error;
    const saved = await editor.serverDb.rpc('save_objects', {
      p_project: pA,
      p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
      p_changes: [
        {
          id: randomUUID(),
          base_seq: 0,
          deleted: false,
          type: 'wall',
          schema_version: 1,
          data: {
            geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
            status: 'existing',
            level: floor!.object_id,
            attributes: { thickness: 4.5, thicknessSide: 'right', height: 96, topCutToCeiling: false, bearing: false },
          },
        },
      ],
    });
    if (saved.error) throw saved.error;
  }, 120000);

  afterAll(async () => {
    try {
      for (const id of jobIds) {
        const prefix = `${tA}/${pA}/${id}`;
        const { data } = await adminDb().storage.from('exports').list(prefix, { limit: 1000 });
        const names = (data ?? []).map((o) => `${prefix}/${o.name}`);
        if (names.length > 0) await adminDb().storage.from('exports').remove(names);
      }
      if (jobIds.length > 0) await adminDb().from('job').delete().in('id', jobIds);
      await cleanup();
    } finally {
      await release?.();
      await closeHarness();
    }
  });

  it('is safe to run twice', async () => {
    const id = await newJob({ set: 'permit' });
    await expectSafeToRunTwice('export', {
      payload: { set: 'permit' },
      job: { id, tenant_id: tA, project_id: pA, kind: 'export', created_at: CREATED_AT },
    });
  });

  it('AC-EZD-715-1, -2 writes the permit set as one 24x36 PDF named address + description + version', async () => {
    const id = await newJob({ set: 'permit' });
    const result = await run({ set: 'permit' }, { id, tenant_id: tA, project_id: pA });
    expect(result.files).toEqual([
      {
        name: '336 Golfview Rd buildingplans Rev 0.pdf',
        key: 'combined',
        sheets: DEFAULT_PERMIT_SHEETS,
        bucket: 'exports',
        path: `${tA}/${pA}/${id}/combined.pdf`,
      },
    ]);
    const pdf = await pdfAt(result.files[0]!.path);
    expect(pdf.numPages).toBe(DEFAULT_PERMIT_SHEETS.length);
    const outline = await pdf.getOutline();
    expect(outline.map((o) => o.title.split(' ')[0])).toEqual(DEFAULT_PERMIT_SHEETS);
    expect(await pdf.getPermissions()).toBeNull();
    // A1.0 (page 2) draws the existing wall, so it carries the scale bar and check dimension.
    const page = await pdf.getPage(2);
    expect(page.view).toEqual([0, 0, 2592, 1728]);
    const text = (await page.getTextContent()).items
      .map((i) => ('str' in i ? i.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(text).toContain('CHECK DIMENSION');
    expect(text).toContain('A1.0');
  });

  it('one PDF per sheet from the same handler, each named with its sheet and the version', async () => {
    const id = await newJob({ set: 'permit', split: 'sheet' });
    const result = await run({ set: 'permit', split: 'sheet' }, { id, tenant_id: tA, project_id: pA });
    expect(result.files.map((f) => f.name)).toEqual(
      DEFAULT_PERMIT_SHEETS.map((n) => `336 Golfview Rd buildingplans ${n} Rev 0.pdf`),
    );
    expect(result.files.map((f) => f.path)).toEqual(DEFAULT_PERMIT_SHEETS.map((n) => `${tA}/${pA}/${id}/${n}.pdf`));
    const one = await pdfAt(result.files[1]!.path);
    expect(one.numPages).toBe(1);
  });

  it('the client set is 11x17 and named as the client set', async () => {
    const id = await newJob({ set: 'client' });
    const result = await run({ set: 'client' }, { id, tenant_id: tA, project_id: pA });
    expect(result.files.map((f) => [f.name, f.sheets])).toEqual([['336 Golfview Rd clientset Rev 0.pdf', ['R1.0']]]);
    const pdf = await pdfAt(result.files[0]!.path);
    expect((await pdf.getPage(1)).view).toEqual([0, 0, 1224, 792]);
  });

  it("a job of another company naming this project finds nothing and writes nothing", async () => {
    const id = randomUUID();
    await expect(run({ set: 'permit' }, { id, tenant_id: tB, project_id: pA })).rejects.toMatchObject({
      code: 'project_not_found',
    });
    const { data } = await adminDb().storage.from('exports').list(`${tB}/${pA}/${id}`);
    expect(data ?? []).toEqual([]);
    const { data: own } = await adminDb().storage.from('exports').list(`${tA}/${pA}/${id}`);
    expect(own ?? []).toEqual([]);
  });
});
