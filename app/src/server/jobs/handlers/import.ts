// EZD-302 (phase-03 EZD-302: "write import_session items; runs as a background job and emits import.ready when
// detection finishes"; 07 import.completed row "Detection finishing is import.ready"): the import job. The payload
// names the source files the import started from (EZD-301 import.started); each Polycam floor plan DXF among them
// is read from Storage, detected, and written as one import_session with its items. A GLB is a reference underlay
// only (08), read on demand by app/src/lib/imports/polycam-glb (EZD-303), so this job skips it. Other kinds wait
// for their own tickets (PDF EZD-304/305, DXF layer map EZD-306) and are skipped. Runs with the secret key, so every
// query is filtered by the job's tenant and project. Safe to run twice: a source file that already has a session
// for this job keeps it, and import.ready is emitted only by the run that wrote a session. An unreadable file
// gives a failed session with a stable code (S02 States Error).
import { z } from 'zod';
import { emit } from '../../events';
import { detectPolycamDxf, type Detection } from '../polycam-dxf/detect';
import { DxfReadError, readDxf } from '../polycam-dxf/read-dxf';
import { readObject } from '../../storage/objects';
import { readJobSourceFiles } from '../../storage/source-files';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import type { JobHandler } from '../registry';

export type ImportPayload = { sourceFileIds: string[] };
export type ImportResult = { importSessionIds: string[] };

export const IMPORT_MAX_FILES = 20;

export type ImportCounts = { walls: number; openings: number; rooms: number };

export function detectionItems(d: Detection) {
  return [...d.walls, ...d.openings, ...d.rooms];
}

export function detectionCounts(d: Detection): ImportCounts {
  return { walls: d.walls.length, openings: d.openings.length, rooms: d.rooms.length };
}

export const importHandler: JobHandler<ImportPayload, never, ImportResult> = {
  kind: 'import',
  payload: z.object({ sourceFileIds: z.array(z.uuid()).min(1).max(IMPORT_MAX_FILES) }),
  result: z.object({ importSessionIds: z.array(z.uuid()) }),
  async run(ctx) {
    const projectId = ctx.job.project_id;
    if (!projectId) throw new JobError('invalid_payload', { retry: false });
    const tenantId = ctx.job.tenant_id;
    const db = createJobsDbClient();

    const files = await readJobSourceFiles(db, { tenantId, projectId }, ctx.payload.sourceFileIds);
    const byId = new Map(files.map((f) => [f.id.toLowerCase(), f]));
    const scans = ctx.payload.sourceFileIds
      .map((id) => byId.get(id.toLowerCase()))
      .filter((f): f is NonNullable<typeof f> => !!f && f.kind === 'polycam_dxf' && f.uploaded);

    const ids: string[] = [];
    const written: string[] = [];
    const counts: ImportCounts = { walls: 0, openings: 0, rooms: 0 };
    for (const file of scans) {
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
          const detection = detectPolycamDxf(readDxf(bytes));
          const c = detectionCounts(detection);
          counts.walls += c.walls;
          counts.openings += c.openings;
          counts.rooms += c.rooms;
          row = { status: 'ready', items: detectionItems(detection), summary: c, error: null };
        } catch (e) {
          if (!(e instanceof DxfReadError)) throw e;
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
            source_kind: 'scan',
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
