// EZD-2032 (AC-EZD-2032-1; S18 Page tab: Plans; Q-0911; Q-0059; vault/build/assumptions/EZD-1205.md Settled rows,
// now EZD-2032's: "Page images made at send", "Image size"): the client_sheet_images job. Send set to client (EZD-719)
// queues one per send of a sheet set (server/sends/sends.ts), payload { sentPackageId }, never the token.
//
// With the secret key, so every query is filtered by the job's tenant and project. The run:
// 1. The sent package (its frozen version and the set it went out with) and the project's scope trades. A package
//    deleted with its project stops the job without a retry.
// 2. The objects of the frozen sent version (model_version.model_json), so an edit after the send never reaches the
//    client's images.
// 3. The set's pages as the export job prints them (pdf-export/set-pages.ts): the set object the send named, or the
//    set of the kind when it was the unchanged default (sheet_set_id null, EZD-719).
// 4. Per sheet, in set order, one WebP 2400 px on the long side and one 400 px thumbnail (client-sheet-images/
//    raster.ts) in the exports bucket at <tenant>/<project>/client-sheets/<sent package>/<nn>.webp and <nn>-thumb.webp,
//    nn the sheet's place in the set from 01.
// The result is the folder and, per sheet, its number, title and the two images' pixel sizes; public.client_sheets
// reads it for the client page. Slices: a sheet at a time, continuing in a new slice when time runs short. Safe to
// run twice: paths are fixed by the package and the sheet's place, written with upsert, and the result holds no time.
// A failed write retries as Q-0059 (up to 5 tries, the runner's 1, 2, 4 and 8 minute waits).
import { z } from 'zod';
import { createJobsDbClient } from '../db';
import { JobError } from '../errors';
import type { JobHandler } from '../registry';
import { buildSetPages } from '../pdf-export/set-pages';
import { clientSheetFiles, clientSheetsDir, type ClientSheetImage } from '../client-sheet-images/paths';
import { readVersionObjects } from './pdf-export';

export { clientSheetFiles, clientSheetsDir, type ClientSheetImage };

export type ClientSheetImagesPayload = { sentPackageId: string };

export type ClientSheetImagesResult = { dir: string; sheets: ClientSheetImage[] };

type State = { next: number; sheets: ClientSheetImage[] };

// A slice stops before a sheet when less than this is left (one 24x36 sheet renders in well under it).
const SLICE_RESERVE_MS = 20_000;

const imageSchema = z.object({
  number: z.string(),
  title: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  thumbWidth: z.number().int().positive(),
  thumbHeight: z.number().int().positive(),
});

export const clientSheetImagesHandler: JobHandler<ClientSheetImagesPayload, State, ClientSheetImagesResult> = {
  kind: 'client_sheet_images',
  payload: z.strictObject({ sentPackageId: z.uuid() }),
  state: z.object({ next: z.number().int().min(0), sheets: z.array(imageSchema) }),
  result: z.object({ dir: z.string(), sheets: z.array(imageSchema) }),
  maxAttempts: 5,
  async run(ctx) {
    const projectId = ctx.job.project_id;
    if (!projectId) throw new JobError('invalid_payload', { retry: false });
    const tenantId = ctx.job.tenant_id;
    const db = createJobsDbClient();

    const [pkg, project] = await Promise.all([
      db
        .from('sent_package')
        .select('model_version_id, sheet_set_kind, sheet_set_id')
        .eq('tenant_id', tenantId)
        .eq('project_id', projectId)
        .eq('id', ctx.payload.sentPackageId)
        .maybeSingle(),
      db.from('project').select('scope_trades').eq('tenant_id', tenantId).eq('id', projectId).maybeSingle(),
    ]);
    if (pkg.error) throw pkg.error;
    if (project.error) throw project.error;
    if (pkg.data === null || project.data === null) throw new JobError('sent_package_not_found', { retry: false });
    const kind = pkg.data.sheet_set_kind;
    if (kind !== 'permit' && kind !== 'client') throw new JobError('no_sheet_set', { retry: false });

    const objects = await readVersionObjects(db, tenantId, projectId, pkg.data.model_version_id);
    const { data, sheets, pages } = await buildSetPages(db, {
      tenantId,
      projectId,
      objects,
      scopeTrades: project.data.scope_trades,
      kind,
      setId: pkg.data.sheet_set_id,
    });

    const { sheetImages, SHEET_IMAGE_TYPE } = await import('../client-sheet-images/raster');
    const dir = clientSheetsDir({ tenant_id: tenantId, project_id: projectId }, ctx.payload.sentPackageId);
    const storage = db.storage.from('exports');
    const state: State = ctx.state ?? { next: 0, sheets: [] };
    const done = state.sheets.slice(0, state.next);
    for (let i = state.next; i < sheets.length; i++) {
      if (i > state.next && ctx.timeLeft() < SLICE_RESERVE_MS) return { continue: { next: i, sheets: done } };
      const sheet = sheets[i]!;
      const page = pages.get(sheet.number)!;
      const { full, thumb } = await sheetImages(data.size, page);
      const files = clientSheetFiles(dir, i);
      for (const [path, bytes] of [
        [files.image, full.bytes],
        [files.thumb, thumb.bytes],
      ] as const) {
        const { error } = await storage.upload(path, bytes, { contentType: SHEET_IMAGE_TYPE, upsert: true });
        if (error) throw new JobError('storage_unavailable', { retry: true });
      }
      done.push({
        number: sheet.number,
        title: sheet.title,
        width: full.width,
        height: full.height,
        thumbWidth: thumb.width,
        thumbHeight: thumb.height,
      });
      await ctx.progress(((i + 1) / sheets.length) * 100);
    }
    return { done: { dir, sheets: done } };
  },
};
