// EZD-901a (phase-09 EZD-901a "The DXF parser ... runs once per upload in a background job: entities are converted
// per layer into binary geometry buffers ... plus a per-layer snap index, stored in Storage beside the original; the
// browser never parses DXF text. Entity types the parser cannot read are counted per type and stored with the
// reference"; 03c reference_drawing; S11 States Error "Unreadable file"): the reference_convert job. The payload names
// one uploaded DXF drawing (source_file kind dxf) of the job's project. The job reads it from the sources bucket,
// converts it (reference-dxf/convert.ts), writes each layer buffer and manifest.json under the job's output folder in
// the jobs bucket (<tenant>/<project>/<job>/out/reference/; docs/architecture.md Background jobs "Output paths are
// fixed by job id"; vault/build/assumptions.md EZD-901a "beside the original") and upserts the file's
// reference_drawing row: ready with the layer state, units and not-read counts, or failed with a stable code.
// Runs with the secret key, so every query is filtered by the job's tenant and project. Safe to run twice: the
// objects are written with upsert at fixed paths and the row is keyed by source_file_id.
import { z } from 'zod';
import type { Json as DbJson } from '../../db/database.types';
import { readObject } from '../../storage/objects';
import { readJobSourceFiles } from '../../storage/source-files';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import type { JobHandler } from '../registry';
import { convertReferenceDxf, type ReferenceManifest, ReferenceReadError } from '../reference-dxf/convert';

// Column values that are never SQL null.
type Json = NonNullable<DbJson>;

export type ReferenceConvertPayload = { sourceFileId: string };
export type ReferenceConvertResult = { referenceDrawingId: string; status: 'ready' | 'failed' };

export const REFERENCE_MANIFEST_FILE = 'manifest.json';

// The job's output folder for the reference (jobs bucket).
export function referenceOutputDir(job: { tenant_id: string; project_id: string; id: string }): string {
  return `${job.tenant_id}/${job.project_id}/${job.id}/out/reference`;
}

// The S11 layer rows (03c layer_state): name, file colour, visible, count, converted.
export function layerState(manifest: ReferenceManifest) {
  return manifest.layers.map((l) => ({
    name: l.name,
    color: l.color,
    visible: l.visible,
    count: l.entityCount,
    converted: false,
  }));
}

export const referenceConvertHandler: JobHandler<
  ReferenceConvertPayload,
  never,
  ReferenceConvertResult
> = {
  kind: 'reference_convert',
  payload: z.object({ sourceFileId: z.uuid() }),
  result: z.object({
    referenceDrawingId: z.uuid(),
    status: z.enum(['ready', 'failed']),
  }),
  maxAttempts: 3,
  async run(ctx) {
    const projectId = ctx.job.project_id;
    if (!projectId) throw new JobError('invalid_payload', { retry: false });
    const tenantId = ctx.job.tenant_id;
    const db = createJobsDbClient();

    const [file] = await readJobSourceFiles(db, { tenantId, projectId }, [ctx.payload.sourceFileId]);
    if (!file || !file.uploaded || file.kind !== 'dxf') {
      throw new JobError('source_file_not_found', { retry: false });
    }

    type Row = {
      status: 'ready' | 'failed';
      error: string | null;
      units: string | null;
      layer_state: Json;
      not_read: Json;
      manifest_path: string | null;
    };
    let row: Row = failed('unreadable_dxf');
    const bytes = await readObject(db, { bucket: 'sources', path: file.storagePath });
    if (!bytes) {
      row = failed('source_missing');
    } else {
      let converted: Awaited<ReturnType<typeof convertReferenceDxf>> | null = null;
      try {
        converted = await convertReferenceDxf(bytes);
      } catch (e) {
        if (!(e instanceof ReferenceReadError)) throw e;
        row = failed(e.code);
      }
      if (converted) {
        const dir = referenceOutputDir({ tenant_id: tenantId, project_id: projectId, id: ctx.job.id });
        const storage = db.storage.from('jobs');
        for (const [name, data] of converted.files) {
          const { error } = await storage.upload(`${dir}/${name}`, data, {
            contentType: 'application/octet-stream',
            upsert: true,
          });
          if (error) throw new JobError('storage_unavailable', { retry: true });
        }
        const manifestPath = `${dir}/${REFERENCE_MANIFEST_FILE}`;
        const { error } = await storage.upload(manifestPath, JSON.stringify(converted.manifest), {
          contentType: 'application/json',
          upsert: true,
        });
        if (error) throw new JobError('storage_unavailable', { retry: true });
        row = {
          status: 'ready',
          error: null,
          units: converted.manifest.units.name,
          layer_state: layerState(converted.manifest) as Json,
          not_read: converted.manifest.notRead as Json,
          manifest_path: manifestPath,
        };
      }
    }

    const { data: saved, error } = await db
      .from('reference_drawing')
      .upsert(
        {
          tenant_id: tenantId,
          project_id: projectId,
          source_file_id: file.id,
          job_id: ctx.job.id,
          ...row,
        },
        { onConflict: 'source_file_id' },
      )
      .select('id, status')
      .single();
    if (error) throw error;
    return { done: { referenceDrawingId: saved.id, status: saved.status as 'ready' | 'failed' } };
  },
};

function failed(code: string): {
  status: 'failed';
  error: string;
  units: null;
  layer_state: Json;
  not_read: Json;
  manifest_path: null;
} {
  return {
    status: 'failed' as const,
    error: code,
    units: null,
    layer_state: [] as Json,
    not_read: {} as Json,
    manifest_path: null,
  };
}
