// EZD-708c on the local stack (AC-EZD-708c-1 "E2.0 shows every panel schedule row and every load calc line";
// AC-EZD-708c-3 "the EC note is on E1.0 and E2.0"; R7 "the PDF draws exactly what the sheet preview draws"): a panel
// placed with Add to E2.0 (the permit set's panelSheets, saved with the model) prints on E2.0 of the permit PDF,
// every schedule row and every load calc line, with the EC note; E1.0 carries the note and no schedule. Expected
// numbers: the 09a worked example (7,350 ... 35,868 VA, 149.5 A, 50.5 A spare). No new table or policy (the job and
// model_object tables keep their own RLS tests).
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
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
import { EC_NOTE_TEXT } from '../../../lib/sheets/electrical-kinds';
import { panelSheetChange, type PanelSheetEntry } from '../../../lib/sheets/panel-sheet-table';
import { panelSheetFor } from '../../../editor/electrical/panel-schedule';
import type { ObjectValue } from '../../../lib/outbox/model-api';

const LOAD_CALC = {
  method: 'standard',
  floorAreaSqFt: 2450,
  smallApplianceCircuits: 2,
  laundryCircuits: 1,
  loads: [
    { id: 'dw', name: 'Dishwasher', kind: 'fixed_appliance', va: 1200 },
    { id: 'disp', name: 'Disposal', kind: 'fixed_appliance', va: 960, motor: true },
    { id: 'mw', name: 'Microwave', kind: 'fixed_appliance', va: 1500 },
    { id: 'wh', name: 'Water heater', kind: 'fixed_appliance', va: 4500 },
    { id: 'dry', name: 'Dryer', kind: 'dryer', va: 5000 },
    { id: 'rng', name: 'Range', kind: 'range', va: 12000 },
    { id: 'heat', name: 'Heat strips', kind: 'heating', va: 9600 },
    { id: 'ac', name: 'A/C', kind: 'cooling', va: 4200, motor: true },
  ],
  overrides: {},
};

const CREATED_AT = '2026-11-26T10:00:00.000Z';

describe('EZD-708c E2.0 in the permit PDF', () => {
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

  let entry: PanelSheetEntry;
  let panelId = '';
  let editorDb: Awaited<ReturnType<typeof signIn>>['serverDb'];
  let lockEpoch = 0;

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
    await harnessSql()`update public.project set scope_trades = array['electrical'] where id = ${pA}::uuid`;
    const [floor] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${pA}::uuid and type = 'floor'`;
    const level = floor!.object_id;
    const lock = await editor.serverDb.rpc('acquire_edit_lock', { p_project: pA, p_device_id: 'dev-a' });
    if (lock.error) throw lock.error;
    const panel = randomUUID();
    panelId = panel;
    editorDb = editor.serverDb;
    lockEpoch = Number((lock.data as { lock_epoch: number }).lock_epoch);
    const objects = new Map<string, ObjectValue>();
    const put = (id: string, type: string, data: Record<string, unknown>) =>
      objects.set(id, { type, schemaVersion: CURRENT_SCHEMA_VERSION, data });
    put(panel, 'panel', {
      geometry: { point: { x: 5, y: 5 } },
      status: 'existing',
      level,
      attributes: {
        name: 'Panel A',
        parentPanel: null,
        serviceSize: 200,
        mainBreaker: 200,
        spaces: 40,
        loadCalc: LOAD_CALC,
      },
    });
    const circuit = (space: number, poles: 1 | 2, name: string, breaker: number, protection: string | null, load: number) =>
      put(randomUUID(), 'circuit', {
        status: 'new',
        level,
        attributes: { panel, space, poles, name, breaker, protection, dedicated: false, load },
      });
    circuit(12, 1, 'Small appl. 1', 20, 'gfci', 1500);
    circuit(14, 1, 'Small appl. 2', 20, 'gfci', 1500);
    circuit(1, 2, 'Range', 50, null, 12000);
    circuit(24, 1, 'Kitchen lighting', 15, 'afci', 171);
    entry = panelSheetFor(objects, panel)!;
    const set = panelSheetChange(objects, entry, () => randomUUID());
    objects.set(set.id, set.value!);
    const saved = await editor.serverDb.rpc('save_objects', {
      p_project: pA,
      p_lock_epoch: Number((lock.data as { lock_epoch: number }).lock_epoch),
      p_changes: [...objects].map(([id, v]) => ({
        id,
        base_seq: 0,
        deleted: false,
        type: v.type,
        schema_version: v.schemaVersion,
        data: v.data,
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

  it('prints every schedule row and every load calc line on E2.0, and the EC note on E1.0 and E2.0', async () => {
    const result = await run({ set: 'permit' });
    const sheets = result.files[0]!.sheets;
    expect(sheets).toContain('E1.0');
    expect(sheets).toContain('E2.0');
    const page = (n: string) => pageText(result.files[0]!.path, sheets.indexOf(n) + 1);
    const e2 = await page('E2.0');
    expect(e2).toContain(EC_NOTE_TEXT);
    expect(e2).toContain('PANEL A - 200A MAIN - PANEL SCHEDULE - 35 SPACES LEFT');
    expect(entry.schedule).toHaveLength(40);
    for (const row of entry.schedule) expect(e2).toContain(row.filter((c) => c !== '').join(' '));
    for (const row of entry.loadCalc) expect(e2).toContain(row.filter((c) => c !== '').join(' '));
    for (const v of ['7,350', '3,000', '11,850', '6,098', '6,120', '8,000', '9,600', '1,050', '35,868 VA', '149.5 A'])
      expect(e2).toContain(v);
    expect(e2).toContain('75% of 200A service, OK 50.5 A spare');
    const e1 = await page('E1.0');
    expect(e1).toContain(EC_NOTE_TEXT);
    expect(e1).not.toContain('PANEL SCHEDULE');
  });

  it('a panel deleted after it was placed is not printed on E2.0', async () => {
    const [row] = await harnessSql()<{ seq: number }[]>`
      select updated_seq as seq from public.model_object where project_id = ${pA}::uuid and object_id = ${panelId}::uuid`;
    const gone = await editorDb.rpc('save_objects', {
      p_project: pA,
      p_lock_epoch: lockEpoch,
      p_changes: [{ id: panelId, base_seq: Number(row!.seq), deleted: true }],
    });
    if (gone.error) throw gone.error;
    const result = await run({ set: 'permit' });
    const sheets = result.files[0]!.sheets;
    const e2 = await pageText(result.files[0]!.path, sheets.indexOf('E2.0') + 1);
    expect(e2).toContain(EC_NOTE_TEXT);
    expect(e2).not.toContain('PANEL SCHEDULE');
    expect(e2).not.toContain('35,868 VA');
  });
});
