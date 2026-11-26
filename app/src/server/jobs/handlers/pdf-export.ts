// EZD-715 (phase-07 EZD-715 "Background job: writes the PDF directly from each sheet's drawing list (EZD-238) with
// PDFKit, with embedded fonts, following the EZD-028 spike; 24x36 (ARCH D) or 11x17; one bookmark per sheet; not
// password-locked; markup allowed; file name from the profile; supporting documents separate. ... the one-PDF-per-set
// and one-PDF-per-sheet outputs come from the same job run"; 08 Exports Permit set, File name; S13 Validation): the
// export job (kind `export`) for a project's permit or client set.
//
// With the secret key, so every query is filtered by the job's tenant and project. The run:
// 1. The project's address, scope boxes and submittal profile (its own, else the company default, else the S15c
//    defaults), and its live model objects.
// 2. The set (its stored sheet_set object, else the default set, as the Sheets screen reads it), its sheets with the
//    floor copies, and each sheet's viewports (lib/sheets). Each plan viewport's drawing list is built as the sheet
//    worker builds it (workers/sheet-job.ts viewportDrawingList) for its floor (the lowest when it names none or a
//    floor since deleted) and view, in its column of the drawing area.
// 3. The files of the profile's split, or of the split asked for (`split`), named by pdf-export/file-name.ts; each
//    file is written by pdf-export/write-pdf.ts to the exports bucket at <tenant>/<project>/<job>/<key>.pdf, the key
//    being "combined", the sheet number or the discipline (Storage keys stay plain; the display name is in the
//    result).
// Progress is the share of sheets written. Safe to run twice: paths are fixed by job id and key, written with upsert,
// and the result holds no time or size. Supporting documents are separate files of their own tickets.
// EZD-717 (AC-EZD-717-1): an issue's job names the frozen version (modelVersionId) and its revision: the objects are
// read from that version's model_json, so an edit made after the issue never reaches the issued PDF. Without a
// revision the permit set's files are named with its draft revision (one more than the newest issued).
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  parseStoredObject,
  SHEET_SET_KINDS,
  type SheetSetData,
  type SheetSetKind,
  type StoredObject,
} from '@ezdraft/geometry';
import { isScopeTrade } from '../../../lib/projects/new-project';
import {
  defaultSheetSetData,
  draftRevision,
  sheetDrawingArea,
  sheetsForSet,
  withFloorSheets,
  type SheetFloor,
} from '../../../lib/sheets/sheet-set';
import {
  sheetScaleLabel,
  sheetViewports,
  viewportAreas,
  viewportScaleFactor,
} from '../../../lib/sheets/viewport';
import { profileOf } from '../../../lib/submittal-profiles/profiles';
import type { PlanProfile } from '../../../lib/submittal-profiles/file-plan';
import { AS_NOTED } from '../../../lib/title-block/sheet-title-block';
import { elevationViewportLists, viewportDrawingList } from '../../../workers/sheet-job';
import {
  SCHEDULE_SHEET,
  schedulePlan,
  scheduleRowsOf,
  scheduleTableFor,
  withScheduleSheets,
} from '../../../lib/sheets/cabinet-schedule-table';
import type { Database } from '../../db/database.types';
import { nextRevision } from '../../../lib/sheets/revisions';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import {
  DISCIPLINE,
  EXPORT_SPLITS,
  SET_DESCRIPTION,
  exportFiles,
  revisionToken,
  type ExportSplit,
} from '../pdf-export/file-name';
import { writePdf, type PdfSheet, type PdfViewport } from '../pdf-export/write-pdf';
import type { JobHandler } from '../registry';

type Db = SupabaseClient<Database>;

export type PdfExportPayload = {
  set: SheetSetKind;
  // One PDF per set or one per sheet; absent, the submittal profile's file split.
  split?: ExportSplit;
  // The revision the files are named with; absent, the set's draft revision (Rev 0 until first issued, then one more
  // than the newest issued). The issue (EZD-717) passes the number it gives.
  revision?: number;
  // EZD-717: the frozen version to print (the issue's checkpoint); absent, the live working copy.
  modelVersionId?: string;
};

export type PdfExportFile = {
  // The file name the user downloads, ".pdf" included.
  name: string;
  // "combined", the sheet number or the discipline.
  key: string;
  sheets: string[];
  bucket: 'exports';
  path: string;
};

export type PdfExportResult = { files: PdfExportFile[] };

export const PDF_CONTENT_TYPE = 'application/pdf';
// PostgREST answers at most this many rows per request (supabase/config.toml max_rows).
const PAGE_ROWS = 1000;

// The job's output folder in the exports bucket.
export function pdfExportDir(job: { tenant_id: string; project_id: string; id: string }): string {
  return `${job.tenant_id}/${job.project_id}/${job.id}`;
}

async function readObjects(db: Db, tenantId: string, projectId: string): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await db
      .from('model_object')
      .select('object_id, type, schema_version, data')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('deleted', false)
      .order('object_id')
      .range(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    for (const r of data)
      out.push({ id: r.object_id, type: r.type, schema_version: r.schema_version, data: r.data });
    if (data.length < PAGE_ROWS) return out;
  }
}

// EZD-717: the objects of one frozen version of the project (its model_json, written by make_checkpoint).
export async function readVersionObjects(
  db: Db,
  tenantId: string,
  projectId: string,
  versionId: string,
): Promise<StoredObject[]> {
  const { data, error } = await db
    .from('model_version')
    .select('model_json')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .eq('id', versionId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) throw new JobError('version_not_found', { retry: false });
  const doc = data.model_json as { objects?: unknown } | null;
  const list = Array.isArray(doc?.objects) ? (doc.objects as StoredObject[]) : [];
  return list.filter(
    (o) => typeof o === 'object' && o !== null && typeof o.id === 'string' && typeof o.type === 'string',
  );
}

// EZD-717: the permit set's draft revision: one more than its newest issued revision, 0 before any.
async function nextPermitRevision(db: Db, tenantId: string, projectId: string): Promise<number> {
  const { data, error } = await db
    .from('permit_revision')
    .select('rev_no')
    .eq('tenant_id', tenantId)
    .eq('project_id', projectId)
    .order('rev_no', { ascending: false })
    .limit(1);
  if (error) throw error;
  return nextRevision(data.map((r) => ({ revNo: r.rev_no })));
}

async function readProfile(
  db: Db,
  tenantId: string,
  profileId: string | null,
): Promise<(PlanProfile & { bookmarks: boolean }) | null> {
  let q = db.from('submittal_profile').select('*').eq('tenant_id', tenantId);
  q = profileId === null ? q.eq('is_default', true).is('archived_at', null) : q.eq('id', profileId);
  const { data, error } = await q.order('id').limit(1);
  if (error) throw error;
  const row = data[0];
  return row === undefined ? null : profileOf(row);
}

export const pdfExportHandler: JobHandler<PdfExportPayload, never, PdfExportResult> = {
  kind: 'export',
  payload: z.strictObject({
    set: z.enum(SHEET_SET_KINDS),
    split: z.enum(EXPORT_SPLITS).optional(),
    revision: z.number().int().min(0).max(999).optional(),
    modelVersionId: z.uuid().optional(),
  }),
  result: z.object({
    files: z.array(
      z.object({
        name: z.string(),
        key: z.string(),
        sheets: z.array(z.string()),
        bucket: z.literal('exports'),
        path: z.string(),
      }),
    ),
  }),
  maxAttempts: 3,
  async run(ctx) {
    const projectId = ctx.job.project_id;
    if (!projectId) throw new JobError('invalid_payload', { retry: false });
    const tenantId = ctx.job.tenant_id;
    const db = createJobsDbClient();

    const project = await db
      .from('project')
      .select('address, scope_trades, submittal_profile_id')
      .eq('tenant_id', tenantId)
      .eq('id', projectId)
      .maybeSingle();
    if (project.error) throw project.error;
    if (project.data === null) throw new JobError('project_not_found', { retry: false });
    const profile = await readProfile(db, tenantId, project.data.submittal_profile_id);
    const objects =
      ctx.payload.modelVersionId === undefined
        ? await readObjects(db, tenantId, projectId)
        : await readVersionObjects(db, tenantId, projectId, ctx.payload.modelVersionId);

    // The set and the floors, as the Sheets screen reads them (server/sheets/sheets.ts): the lowest-id live set
    // object of the kind, else the default set; floors by order, then id.
    let setData: SheetSetData | null = null;
    const floorRows: (SheetFloor & { order: number })[] = [];
    for (const stored of objects) {
      if (stored.type !== 'floor' && stored.type !== 'sheet_set') continue;
      const parsed = parseStoredObject(stored);
      if (!parsed.ok) continue;
      if (parsed.object.type === 'floor')
        floorRows.push({ id: parsed.object.id, name: parsed.object.data.name, order: parsed.object.data.order });
      else if (parsed.object.type === 'sheet_set' && setData === null && parsed.object.data.kind === ctx.payload.set)
        setData = parsed.object.data;
    }
    const floors: SheetFloor[] = floorRows
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map(({ id, name }) => ({ id, name }));
    const data = setData ?? defaultSheetSetData(ctx.payload.set);
    const trades = project.data.scope_trades.filter(isScopeTrade);
    // EZD-707: the cabinet schedule prints on A4.0 under the elevations and continues on A4.1, as the preview.
    const scheduleRows = scheduleRowsOf(objects);
    const sheets = withScheduleSheets(withFloorSheets(sheetsForSet(data.kind, trades), floors), data.size, scheduleRows.length);

    const floorIds = new Set(floors.map((f) => f.id));
    const pages = new Map<string, PdfSheet>();
    for (const sheet of sheets) {
      const vps = sheetViewports(data, sheet.number, floors);
      const areas = viewportAreas(
        sheet.number === SCHEDULE_SHEET ? schedulePlan(data.size, scheduleRows.length).elevations : sheetDrawingArea(data.size),
        vps.length,
      );
      const viewports: PdfViewport[] = [];
      vps.forEach((vp, i) => {
        if (vp.kind !== 'plan' && vp.kind !== 'elevation') return;
        const level = vp.level !== null && floorIds.has(vp.level) ? vp.level : floors[0]?.id;
        if (level === undefined) return;
        // EZD-707: an elevation viewport prints each of its elevations in its own cell, as the preview draws them.
        if (vp.kind === 'elevation') {
          const scale = viewportScaleFactor(vp.scale);
          for (const cell of elevationViewportLists(objects, level, vp.view, vp.walls ?? [], areas[i]!))
            viewports.push({ list: cell.list, scale, area: cell.area });
          return;
        }
        viewports.push({
          list: viewportDrawingList(objects, level, vp.view),
          scale: viewportScaleFactor(vp.scale),
          area: areas[i]!,
        });
      });
      const table = scheduleTableFor(sheet.number, data.size, scheduleRows);
      if (table !== null) viewports.push({ list: table.list, scale: 1, area: table.area, marks: false });
      pages.set(sheet.number, {
        number: sheet.number,
        title: sheet.title,
        scaleLabel: sheetScaleLabel(vps) ?? AS_NOTED,
        stampAreas: data.kind === 'permit',
        viewports,
      });
    }

    const rev =
      ctx.payload.revision ??
      (data.kind === 'permit' ? await nextPermitRevision(db, tenantId, projectId) : (draftRevision(data) ?? 0));
    const created = typeof ctx.job.created_at === 'string' ? ctx.job.created_at : new Date().toISOString();
    const files = exportFiles(
      profile,
      sheets.map((s) => ({ number: s.number, discipline: DISCIPLINE[s.group] })),
      {
        address: project.data.address,
        description: SET_DESCRIPTION[data.kind],
        rev: revisionToken(rev),
        date: created.slice(0, 10),
      },
      ctx.payload.split,
    );

    const dir = pdfExportDir({ tenant_id: tenantId, project_id: projectId, id: ctx.job.id });
    const storage = db.storage.from('exports');
    const out: PdfExportFile[] = [];
    let written = 0;
    for (const file of files) {
      const bytes = await writePdf({
        size: data.size,
        title: file.name.replace(/\.pdf$/, ''),
        bookmarks: profile?.bookmarks ?? true,
        sheets: file.sheets.map((n) => pages.get(n)!),
      });
      const path = `${dir}/${file.key}.pdf`;
      const { error } = await storage.upload(path, bytes, { contentType: PDF_CONTENT_TYPE, upsert: true });
      if (error) throw new JobError('storage_unavailable', { retry: true });
      out.push({ name: file.name, key: file.key, sheets: file.sheets, bucket: 'exports', path });
      written += file.sheets.length;
      await ctx.progress(sheets.length === 0 ? 100 : (written / sheets.length) * 100);
    }
    return { done: { files: out } };
  },
};
