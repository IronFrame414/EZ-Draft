// EZD-307 (S02 Layout, Data shown; Entry points "Continue to review"): read one import for Import review. An import
// is the job Continue to review queued (EZD-302); its import_session rows hold the detected items. Every read goes
// through the caller's client, so RLS decides what is visible: another company's or an unlisted project's job,
// sessions and files are not found. Status: detecting while the job is queued or running (S02 States Loading),
// failed when the job or a session failed (S02 States Error, with the file name), else ready. The mesh is a
// short-lived signed link to the import's Polycam GLB (S02 Show 3D mesh "Only when a GLB was uploaded"); the
// storage policy on sources is the check (EZD-132).
import { z } from 'zod';
import type { ReviewFile, ReviewItem } from '../../lib/imports/review';
import { signedDownloadUrl, StorageError, type DbClient } from '../storage/objects';
import { readReviewSourceFiles } from '../storage/source-files';

export type ImportReviewStatus = 'detecting' | 'ready' | 'failed';

export type ImportReviewView = {
  jobId: string;
  projectId: string;
  projectName: string;
  status: ImportReviewStatus;
  files: ReviewFile[];
  failedFile: string | null;
  items: ReviewItem[];
  meshUrl: string | null;
};

const pt = z.object({ x: z.number(), y: z.number() });
const confidence = z.number().min(0).max(100);
const itemSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('wall'),
    number: z.number().int(),
    side: z.enum(['north', 'east', 'south', 'west']),
    confidence,
    geometry: z.object({ start: pt, end: pt }),
    thickness: z.number().nullable(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('opening'),
    kind: z.enum(['door', 'window']),
    number: z.number().int(),
    confidence,
    hostWallId: z.string().nullable(),
    width: z.number(),
    center: pt,
  }),
  z.object({
    id: z.string(),
    type: z.literal('room'),
    number: z.number().int(),
    confidence,
    boundary: z.array(pt),
    closed: z.boolean(),
    areaSqIn: z.number(),
  }),
]);

const payloadSchema = z.object({
  sourceFileIds: z.array(z.string()).default([]),
  meshFileIds: z.array(z.string()).optional(),
});

/** Null when the job is not an import of this project or RLS hides it. */
export async function readImportReview(
  client: DbClient,
  projectId: string,
  jobId: string,
): Promise<ImportReviewView | null> {
  const job = await client
    .from('job')
    .select('id, project_id, kind, status, payload')
    .eq('id', jobId)
    .eq('project_id', projectId)
    .eq('kind', 'import')
    .maybeSingle();
  if (job.error) throw job.error;
  if (!job.data) return null;

  const project = await client.from('project').select('id, name').eq('id', projectId).maybeSingle();
  if (project.error) throw project.error;
  if (!project.data) return null;

  const payload = payloadSchema.safeParse(job.data.payload);
  const scanIds = payload.success ? payload.data.sourceFileIds : [];
  const meshIds = payload.success ? (payload.data.meshFileIds ?? []) : [];
  const ids = [...scanIds, ...meshIds];
  const files = await readReviewSourceFiles(client, projectId, ids);
  const ordered = ids
    .map((id) => files.get(id.toLowerCase()))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  const base = {
    jobId: job.data.id,
    projectId,
    projectName: project.data.name,
    files: ordered.map((f) => ({ name: f.name, kind: f.kind })),
  };
  const firstScan = ordered.find((f) => f.kind === 'polycam_dxf')?.name ?? null;

  if (job.data.status === 'queued' || job.data.status === 'running') {
    return { ...base, status: 'detecting', failedFile: null, items: [], meshUrl: null };
  }
  if (job.data.status === 'failed') {
    return { ...base, status: 'failed', failedFile: firstScan, items: [], meshUrl: null };
  }

  const sessions = await client
    .from('import_session')
    .select('id, source_file_id, status, items, created_at')
    .eq('job_id', jobId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (sessions.error) throw sessions.error;
  const failed = sessions.data.find((s) => s.status === 'failed');
  if (failed) {
    const name = files.get(failed.source_file_id.toLowerCase())?.name ?? firstScan;
    return { ...base, status: 'failed', failedFile: name, items: [], meshUrl: null };
  }
  if (sessions.data.some((s) => s.status === 'detecting')) {
    return { ...base, status: 'detecting', failedFile: null, items: [], meshUrl: null };
  }

  const items: ReviewItem[] = [];
  for (const s of sessions.data) {
    const list = Array.isArray(s.items) ? s.items : [];
    for (const raw of list) {
      const parsed = itemSchema.safeParse(raw);
      if (parsed.success) items.push(parsed.data);
    }
  }

  let meshUrl: string | null = null;
  const mesh = ordered.find((f) => f.kind === 'polycam_glb' && f.uploaded);
  if (mesh) {
    try {
      meshUrl = await signedDownloadUrl(client, { bucket: 'sources', path: mesh.storagePath });
    } catch (e) {
      // A missing or refused object only hides Show 3D mesh; the review itself still opens.
      if (!(e instanceof StorageError)) throw e;
    }
  }
  return { ...base, status: 'ready', failedFile: null, items, meshUrl };
}
