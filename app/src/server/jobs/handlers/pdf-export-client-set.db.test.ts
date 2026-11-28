// EZD-720 (AC-EZD-720-1, -2; vault/build/assumptions/EZD-720.md Settled): the export job writes the client set with the
// countertop sheets (A8.0 Countertop plan with the TOP SCHEDULE, A9.0 Edge details) before R1.0 while the project has
// countertop pieces, and the permit set never holds them. Expected values: the default permit set (EZD-701), the
// client set's R1.0 (S13 Decision 10), the 08 file names (EZD-715 test), the EZD-418 board tops' hand counts (A 25.1 sq
// ft). No new table or policy (pdf-export.db.test.ts proves another company's job finds nothing).
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
import { randomUUID } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holdJobQueueShared } from '../../../../test-harness/jobs/queue-lock';
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
import { boardPiecesModel } from '../../../editor/countertops/test-fixture';

const DEFAULT_PERMIT_SHEETS = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const CREATED_AT = '2026-11-26T10:00:00.000Z';

describe('EZD-720 client set PDF', () => {
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
      p_name: 'Golfview tops',
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
      p_changes: [...boardPiecesModel().values()]
        .filter((v) => v.type === 'countertop_piece')
        .map((v) => ({
          id: randomUUID(),
          base_seq: 0,
          deleted: false,
          type: v.type,
          schema_version: CURRENT_SCHEMA_VERSION,
          data: { ...(v.data as Record<string, unknown>), level: floor!.object_id },
        })),
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

  const pageText = async (path: string, page: number) => {
    const pdf = await pdfAt(path);
    const content = await (await pdf.getPage(page)).getTextContent();
    return content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
  };

  it('AC-1: the client set prints A8.0 and A9.0 before R1.0, A8.0 with the top schedule', async () => {
    const id = await newJob({ set: 'client' });
    const result = await run({ set: 'client' }, { id, tenant_id: tA, project_id: pA });
    expect(result.files.map((f) => [f.name, f.sheets])).toEqual([
      ['336 Golfview Rd clientset Rev 0.pdf', ['A8.0', 'A9.0', 'R1.0']],
    ]);
    const text = await pageText(result.files[0]!.path, 1);
    expect(text).toContain('TOP SCHEDULE');
    expect(text).toContain('25.1');
    expect(text).toContain('Back wall');
  });

  it('AC-2: the permit set of the same project never contains them', async () => {
    const id = await newJob({ set: 'permit' });
    const result = await run({ set: 'permit' }, { id, tenant_id: tA, project_id: pA });
    expect(result.files[0]!.sheets).toEqual(DEFAULT_PERMIT_SHEETS);
    void tB;
  });
});
