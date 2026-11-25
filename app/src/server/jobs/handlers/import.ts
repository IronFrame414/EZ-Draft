// EZD-302 (phase-03 EZD-302: "write import_session items; runs as a background job and emits import.ready when
// detection finishes"; 07 import.completed row "Detection finishing is import.ready"): the import job. The payload
// names the source files the import started from (EZD-301 import.started); each Polycam floor plan DXF among them
// is read from Storage, detected, and written as one import_session with its items. A GLB is a reference underlay
// only (08), read on demand by app/src/lib/imports/polycam-glb (EZD-303), so this job skips it. Other kinds wait
// for their own tickets (PDF EZD-304/305, DXF layer map EZD-306) and are skipped. Runs with the secret key, so every
// query is filtered by the job's tenant and project. Safe to run twice: a source file that already has a session
// for this job keeps it, and import.ready is emitted only by the run that wrote a session. An unreadable file
// gives a failed session with a stable code (S02 States Error).
// EZD-306 (S01 DXF: conversion choice; R26 R25): an architect or supplier DXF (kind dxf) named in dxfFiles is
// detected the same way, from only the layers the user chose and with the role each was given; its session's
// source_kind is dxf. A dxf file without a choice is a reference only and gets no session.
// EZD-305 (S01 PDF: detect type; S02 States Empty): a PDF (kind pdf) is read on its calibrated page (page 1 without a
// scale) and its wall lines detected (pdf-walls/detect); source_kind pdf. A scanned PDF has no lines, so its session is
// ready with no items, which Import review shows as "Nothing detected" (EZD-314).
// EZD-915 (S12 Supplier PDF import; S02 States "Supplier kitchen PDF"): a supplier PDF (kind supplier_pdf) is read on
// every page (page 1 the plan, later pages elevations) for walls and labelled cabinets (supplier-pdf/detect); its
// session's source_kind is supplier and import.ready counts its cabinets. A scanned supplier PDF gives no items.
import { z } from 'zod';
import {
  DXF_LAYER_NAME_MAX,
  DXF_LAYER_ROLES,
  DXF_LAYERS_MAX,
  type DxfLayerChoice,
} from '../../../lib/imports/dxf-layers';
import { emit } from '../../events';
import { detectPolycamDxf, type Detection, type LayerMap } from '../polycam-dxf/detect';
import { layerMapFromChoice } from '../polycam-dxf/layer-choice';
import { DxfReadError, readDxf } from '../polycam-dxf/read-dxf';
import { detectPdfWalls } from '../pdf-walls/detect';
import { PdfReadError, readPdfPage, readPdfPages } from '../pdf-walls/read-pdf';
import { detectSupplierPdf, type SupplierDetection } from '../supplier-pdf/detect';
import { readObject } from '../../storage/objects';
import { readJobPdfCalibration, readJobSourceFiles } from '../../storage/source-files';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import type { JobHandler } from '../registry';

// EZD-307: meshFileIds (Polycam GLBs of the same import) are not read here; Import review reads them from the payload.
export type ImportDxfFile = { sourceFileId: string; layers: DxfLayerChoice[] };
export type ImportPayload = {
  sourceFileIds: string[];
  meshFileIds?: string[];
  dxfFiles?: ImportDxfFile[];
};
export type ImportResult = { importSessionIds: string[] };

export const IMPORT_MAX_FILES = 20;

export const dxfLayerChoiceSchema = z.strictObject({
  name: z.string().min(1).max(DXF_LAYER_NAME_MAX),
  role: z.enum(DXF_LAYER_ROLES),
});

export const importDxfFileSchema = z.strictObject({
  sourceFileId: z.uuid(),
  layers: z.array(dxfLayerChoiceSchema).min(1).max(DXF_LAYERS_MAX),
});

export type ImportCounts = { walls: number; openings: number; rooms: number; cabinets?: number };

const hasCabinets = (d: Detection | SupplierDetection): d is SupplierDetection => 'cabinets' in d;

export function detectionItems(d: Detection | SupplierDetection) {
  return [...d.walls, ...d.openings, ...d.rooms, ...(hasCabinets(d) ? d.cabinets : [])];
}

export function detectionCounts(d: Detection | SupplierDetection): ImportCounts {
  const c: ImportCounts = { walls: d.walls.length, openings: d.openings.length, rooms: d.rooms.length };
  if (hasCabinets(d)) c.cabinets = d.cabinets.length;
  return c;
}

async function detectPdf(
  db: ReturnType<typeof createJobsDbClient>,
  scope: { tenantId: string; projectId: string },
  sourceFileId: string,
  bytes: Uint8Array,
): Promise<Detection> {
  const calibration = await readJobPdfCalibration(db, scope, sourceFileId);
  const page = await readPdfPage(bytes, calibration?.page ?? 1);
  return detectPdfWalls(page, calibration);
}

export const importHandler: JobHandler<ImportPayload, never, ImportResult> = {
  kind: 'import',
  payload: z.object({
    sourceFileIds: z.array(z.uuid()).min(1).max(IMPORT_MAX_FILES),
    meshFileIds: z.array(z.uuid()).max(IMPORT_MAX_FILES).optional(),
    dxfFiles: z.array(importDxfFileSchema).max(IMPORT_MAX_FILES).optional(),
  }),
  result: z.object({ importSessionIds: z.array(z.uuid()) }),
  async run(ctx) {
    const projectId = ctx.job.project_id;
    if (!projectId) throw new JobError('invalid_payload', { retry: false });
    const tenantId = ctx.job.tenant_id;
    const db = createJobsDbClient();

    const files = await readJobSourceFiles(db, { tenantId, projectId }, ctx.payload.sourceFileIds);
    const byId = new Map(files.map((f) => [f.id.toLowerCase(), f]));
    const choices = new Map(
      (ctx.payload.dxfFiles ?? []).map((d) => [d.sourceFileId.toLowerCase(), d.layers]),
    );
    // Each file to detect, with the layer map it is read with (undefined: the Polycam layer names).
    const scans: Array<{
      file: (typeof files)[number];
      sourceKind: 'scan' | 'dxf' | 'pdf' | 'supplier';
      layerMap?: LayerMap;
    }> = [];
    for (const id of ctx.payload.sourceFileIds) {
      const file = byId.get(id.toLowerCase());
      if (!file || !file.uploaded) continue;
      if (file.kind === 'polycam_dxf') scans.push({ file, sourceKind: 'scan' });
      if (file.kind === 'pdf') scans.push({ file, sourceKind: 'pdf' });
      if (file.kind === 'supplier_pdf') scans.push({ file, sourceKind: 'supplier' });
      const chosen = choices.get(id.toLowerCase());
      if (file.kind === 'dxf' && chosen) {
        scans.push({ file, sourceKind: 'dxf', layerMap: layerMapFromChoice(chosen) });
      }
    }

    const ids: string[] = [];
    const written: string[] = [];
    const counts: ImportCounts = { walls: 0, openings: 0, rooms: 0 };
    for (const { file, sourceKind, layerMap } of scans) {
      const { data: existing, error: existingError } = await db
        .from('import_session')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .eq('job_id', ctx.job.id)
        .eq('source_file_id', file.id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing && existing.status !== 'detecting') {
        ids.push(existing.id);
        continue;
      }

      const bytes = await readObject(db, { bucket: 'sources', path: file.storagePath });
      let row: {
        status: 'ready' | 'failed';
        items: unknown[];
        summary: object;
        error: string | null;
      };
      if (!bytes) {
        row = { status: 'failed', items: [], summary: {}, error: 'source_missing' };
      } else {
        try {
          const detection =
            sourceKind === 'pdf'
              ? await detectPdf(db, { tenantId, projectId }, file.id, bytes)
              : sourceKind === 'supplier'
                ? detectSupplierPdf(await readPdfPages(bytes))
                : detectPolycamDxf(readDxf(bytes), layerMap ? { layerMap } : {});
          const c = detectionCounts(detection);
          counts.walls += c.walls;
          counts.openings += c.openings;
          counts.rooms += c.rooms;
          if (c.cabinets !== undefined) counts.cabinets = (counts.cabinets ?? 0) + c.cabinets;
          row = { status: 'ready', items: detectionItems(detection), summary: c, error: null };
        } catch (e) {
          if (!(e instanceof DxfReadError) && !(e instanceof PdfReadError)) throw e;
          row = { status: 'failed', items: [], summary: {}, error: e.code };
        }
      }
      const { data: saved, error: saveError } = await db
        .from('import_session')
        .upsert(
          {
            tenant_id: tenantId,
            project_id: projectId,
            source_file_id: file.id,
            job_id: ctx.job.id,
            source_kind: sourceKind,
            status: row.status,
            items: row.items as never,
            summary: row.summary as never,
            error: row.error,
          },
          { onConflict: 'job_id,source_file_id' },
        )
        .select('id')
        .single();
      if (saveError) throw saveError;
      ids.push(saved.id);
      written.push(saved.id);
    }

    if (written.length > 0) {
      await emit(
        'import.ready',
        { projectId, importSessionIds: written, counts },
        { tenantId, projectId, actorId: ctx.job.created_by ?? null },
      );
    }
    return { done: { importSessionIds: ids } };
  },
};
