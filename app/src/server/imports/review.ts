// EZD-307 (S02 Layout, Data shown; Entry points "Continue to review"): read one import for Import review. An import
// is the job Continue to review queued (EZD-302); its import_session rows hold the detected items. Every read goes
// through the caller's client, so RLS decides what is visible: another company's or an unlisted project's job,
// sessions and files are not found. Status: detecting while the job is queued or running (S02 States Loading),
// failed when the job or a session failed (S02 States Error, with the file name), else ready. The mesh is a
// short-lived signed link to the import's Polycam GLB (S02 Show 3D mesh "Only when a GLB was uploaded"); the
// storage policy on sources is the check (EZD-132).
// EZD-308 (S15d High-confidence cutoff "Import items below it go to To check"; Round 24): the view carries the
// company's cutoff, the effective Defaults value of high_confidence_cutoff, or 80 while it is Not set
// (vault/build/assumptions.md EZD-308). The key is company-wide, not a per-project copy.
// EZD-309 (Q-0215 "Detected items are saved until Finish or Cancel, even if the browser closes"; AC-EZD-309-2): the
// view also carries what the reviewer has saved, the decisions and fixes from import_review_item and the mode from
// import_session, so a reload restores them. saveImportReview writes one batch through save_import_review.
import { z } from 'zod';
import { effectiveValue } from '../../lib/defaults/values';
import {
  DEFAULT_REVIEW_MODE,
  REVIEW_MODES,
  reviewCutoff,
  type Decision,
  type ReviewFile,
  type ReviewItem,
  type ReviewMode,
} from '../../lib/imports/review';
import { parseFix, type ItemFix, type ReviewChange } from '../../lib/imports/review-fix';
import { reviewTolerance } from '../../lib/imports/review-conflicts';
import type { Json } from '../db/database.types';
import { loadTenantDefaults } from '../defaults/defaults';
import { signedDownloadUrl, StorageError, type DbClient } from '../storage/objects';
import { readReviewSourceFiles } from '../storage/source-files';

// EZD-313: finished or cancelled once Finish import or Cancel import has closed the review (import_session.status).
export type ImportReviewStatus = 'detecting' | 'ready' | 'failed' | 'finished' | 'cancelled';

export type ImportReviewView = {
  jobId: string;
  projectId: string;
  projectName: string;
  status: ImportReviewStatus;
  files: ReviewFile[];
  failedFile: string | null;
  items: ReviewItem[];
  meshUrl: string | null;
  /** The high-confidence cutoff (%) for this review: at or above it is high confidence. */
  cutoff: number;
  /** EZD-310: the typed-vs-scan tolerance (in), Defaults measurement_tolerance or 1/2" while Not set (Round 24 #30). */
  tolerance: number;
  /** Saved decisions by item id (EZD-309). */
  decisions: Record<string, Decision>;
  /** Saved fixes by item id (EZD-309). */
  fixes: Record<string, ItemFix>;
  /** The saved review mode (import_session.mode). */
  mode: ReviewMode;
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

  const stored = await loadTenantDefaults(client);
  const base = {
    jobId: job.data.id,
    projectId,
    projectName: project.data.name,
    cutoff: reviewCutoff(effectiveValue('high_confidence_cutoff', stored)),
    tolerance: reviewTolerance(effectiveValue('measurement_tolerance', stored)),
    files: ordered.map((f) => ({ name: f.name, kind: f.kind })),
    decisions: {},
    fixes: {},
    mode: DEFAULT_REVIEW_MODE,
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
    .select('id, source_file_id, status, items, mode, created_at')
    .eq('job_id', jobId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (sessions.error) throw sessions.error;
  const closed = sessions.data.find((s) => s.status === 'finished' || s.status === 'cancelled');
  if (closed) {
    const status = closed.status === 'finished' ? 'finished' : 'cancelled';
    return { ...base, status, failedFile: null, items: [], meshUrl: null };
  }
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

  const saved = await client
    .from('import_review_item')
    .select('item_id, decision, fix')
    .eq('job_id', jobId)
    .eq('project_id', projectId);
  if (saved.error) throw saved.error;
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const decisions: Record<string, Decision> = {};
  const fixes: Record<string, ItemFix> = {};
  for (const row of saved.data) {
    const item = byId.get(row.item_id);
    if (!item) continue;
    if (row.decision === 'accepted' || row.decision === 'rejected')
      decisions[item.id] = row.decision;
    const fix = row.fix === null ? null : parseFix(item, row.fix);
    if (fix) fixes[item.id] = fix;
  }
  const storedMode = sessions.data[0]?.mode;
  const mode = REVIEW_MODES.find((m) => m === storedMode) ?? DEFAULT_REVIEW_MODE;

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
  return { ...base, status: 'ready', failedFile: null, items, meshUrl, decisions, fixes, mode };
}

export type SaveReviewResult = 'saved' | 'locked' | 'closed';

/** Thrown for the refusals of save_import_review the route answers with 403, 404 or 400. */
export class ReviewSaveError extends Error {
  constructor(readonly code: 'permission_denied' | 'not_found' | 'invalid_input') {
    super(code);
    this.name = 'ReviewSaveError';
  }
}

/**
 * One batch of review changes (EZD-309), through the caller's session client: save_import_review checks Edit
 * model, project scope, the import and its items, and the edit lock (supabase/migrations/…_import_review_item).
 */
export async function saveImportReview(
  client: DbClient,
  projectId: string,
  jobId: string,
  batch: { mode: ReviewMode | null; changes: readonly ReviewChange[] },
): Promise<SaveReviewResult> {
  const { data, error } = await client.rpc('save_import_review', {
    p_project: projectId,
    p_job: jobId,
    // The generated argument type is `string`; a null mode is the SQL null the function expects.
    p_mode: batch.mode as string,
    p_changes: batch.changes as unknown as Json,
  });
  if (error) {
    if (error.code === '42501') throw new ReviewSaveError('permission_denied');
    if (error.code === 'P0002') throw new ReviewSaveError('not_found');
    if (error.code === '22023') throw new ReviewSaveError('invalid_input');
    throw error;
  }
  const status = (data as { status?: unknown } | null)?.status;
  if (status === 'saved' || status === 'locked' || status === 'closed') return status;
  throw new Error('save_import_review: unexpected answer');
}
