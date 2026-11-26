// EZD-708a on the local stack (AC-EZD-708a-1, -3; R7 "the PDF draws exactly what the sheet preview draws"): with the
// Reflected ceiling plan box ticked, the permit PDF's A6.0 page prints the fixture schedule (title, the "A" tag, its
// 650 lumens and its count of 2) and the RCP's supply register needs nothing else to print; A3.0 prints no schedule.
// The model is one wall, two "A" cans at 650 lm and one 10 x 10 in supply register on the project's floor. No new
// table or policy (the job and model_object tables keep their own RLS tests).
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
} from '../../../../test-harness/rls/fixtures';
import { getHandlers } from '../handlers';
import type { PdfExportPayload, PdfExportResult } from './pdf-export';

const CREATED_AT = '2026-11-26T10:00:00.000Z';
const WITH_RCP = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0', 'E1.0', 'E2.0', 'R1.0'];

describe('EZD-708a A6.0 in the permit PDF', () => {
  let release: () => Promise<void>;
  let tA = '';
  let pA = '';
  const jobIds: string[] = [];

  async function run(payload: PdfExportPayload): Promise<PdfExportResult> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tA,
        project_id: pA,
        kind: 'export',
        payload,
        status: 'done',
        max_attempts: 3,
      })
      .select('id')
      .single();
    if (error) throw error;
    const id = (data as { id: string }).id;
    jobIds.push(id);
    const handler = getHandlers().export!;
    const outcome = await handler.run({
      job: {
        id,
        tenant_id: tA,
        project_id: pA,
        kind: 'export',
        attempts: 1,
        created_at: CREATED_AT,
      },
      payload: handler.payload.parse(payload),
      state: null,
      progress: async () => {},
      timeLeft: () => Number.MAX_SAFE_INTEGER,
      sleep: async () => {},
      signal: new AbortController().signal,
    } as never);
    return (outcome as { done: PdfExportResult }).done;
  }

  async function pageText(path: string, page: number): Promise<string> {
    const { data, error } = await adminDb().storage.from('exports').download(path);
    if (error) throw error;
    const pdf = await getDocument({
      data: new Uint8Array(await data.arrayBuffer()),
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
    return (await (await pdf.getPage(page)).getTextContent()).items
      .map((i) => ('str' in i ? i.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ');
  }

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tA = await createTenant();
    const m = await createMember({ tenantId: tA, scope: 'all' });
    await setPermissions(tA, m.membershipId, ['view_projects', 'edit_model', 'create_projects']);
    const editor = await signIn(m.email);
    const made = await editor.serverDb.rpc('create_project', {
      p_name: 'Golfview',
      p_address: '336 Golfview Rd',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    if (made.error) throw made.error;
    pA = (made.data as { project_id: string }[])[0]!.project_id;
    await harnessSql()`update public.project set scope_trades = array['rcp'] where id = ${pA}::uuid`;
    const [floor] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${pA}::uuid and type = 'floor'`;
    const level = floor!.object_id;
    const lock = await editor.serverDb.rpc('acquire_edit_lock', {
      p_project: pA,
      p_device_id: 'dev-a',
    });
    if (lock.error) throw lock.error;
    const change = (type: string, data: unknown) => ({
      id: randomUUID(),
      base_seq: 0,
      deleted: false,
      type,
      schema_version: 1,
      data,
    });
    const can = (x: number) =>
      change('device', {
        geometry: { point: { x, y: 30 } },
        status: 'new',
        level,
        attributes: { kind: 'recessed_light', typeTag: 'A', lumens: 650 },
      });
    const saved = await editor.serverDb.rpc('save_objects', {
      p_project: pA,
      p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
      p_changes: [
        change('wall', {
          geometry: { start: { x: 0, y: 0 }, end: { x: 144, y: 0 } },
          status: 'existing',
          level,
          attributes: {
            thickness: 4.5,
            thicknessSide: 'right',
            height: 96,
            topCutToCeiling: false,
            bearing: false,
          },
        }),
        can(36),
        can(108),
        change('hvac', {
          geometry: { center: { x: 72, y: 40 }, axis: { x: 1, y: 0 } },
          status: 'new',
          level,
          attributes: { kind: 'supply', width: 10, depth: 10 },
        }),
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

  it('prints A6.0 with its fixture schedule; A3.0 has none', async () => {
    const result = await run({ set: 'permit' });
    expect(result.files[0]!.sheets).toEqual(WITH_RCP);
    const a6 = await pageText(result.files[0]!.path, WITH_RCP.indexOf('A6.0') + 1);
    expect(a6).toContain('FIXTURE SCHEDULE');
    expect(a6).toContain('LUMENS');
    expect(a6).toContain('A Recessed light 650 2');
    const a3 = await pageText(result.files[0]!.path, WITH_RCP.indexOf('A3.0') + 1);
    expect(a3).not.toContain('FIXTURE SCHEDULE');
  });
});
