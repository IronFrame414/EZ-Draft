// EZD-132 Step 9 (vault/plans/EZD-132.md Decided startSourceFileUpload, completeSourceFileUpload, View;
// AC-EZD-132-5): a source_file row comes before its object. start checks the input, finds the project through
// the caller's client (RLS: another tenant's or an unlisted project is not found), inserts the row and signs
// the upload; complete checks the object is there with the declared size and stamps uploaded_at once (the
// trigger of Step 1 stores now() and refuses a second stamp). Only the view's columns leave the server.
// A cost record (EZD-322 D1) is refused without See company costs before any write.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  SOURCE_CONTENT_TYPES,
  SOURCE_FILE_KINDS,
  SOURCE_MAX_BYTES,
  type SourceFileKind,
} from '../../lib/storage/source-file-kinds';
import type { SignedUpload } from '../../lib/storage/upload';
import { kindTakes } from '../../lib/imports/upload-files';
import { can, loadPermissionContext } from '../permissions';
import { createSignedUpload, statObject, StorageError, type DbClient } from './objects';

// Supplier files and order reports are cost files (Q-0269 (b)); their starts need See company costs (EZD-322).
export const COST_FILE_KINDS: readonly SourceFileKind[] = ['supplier_pdf', 'order_report'];

export type SourceFileView = {
  id: string;
  projectId: string;
  kind: SourceFileKind;
  storagePath: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  uploadedAt: string | null;
  createdAt: string;
};

export type StartSourceFileInput = {
  projectId: string;
  kind: SourceFileKind;
  originalName: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  supplierName?: string | null;
  supplierContactEmail?: string | null;
};

const VIEW_COLUMNS =
  'id, project_id, kind, storage_path, original_name, content_type, size_bytes, uploaded_by, uploaded_at, created_at';

type ViewRow = {
  id: string;
  project_id: string;
  kind: string;
  storage_path: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  uploaded_at: string | null;
  created_at: string;
};

const CONTENT_TYPE_RE = /^[a-z0-9]+\/[a-z0-9.+-]+$/;
const codePoints = (s: string) => Array.from(s).length;

const startSchema = z
  .object({
    projectId: z.uuid(),
    kind: z.enum(SOURCE_FILE_KINDS),
    originalName: z.string().refine((s) => codePoints(s) >= 1 && codePoints(s) <= 255),
    contentType: z
      .string()
      .trim()
      .toLowerCase()
      .max(127)
      .regex(CONTENT_TYPE_RE)
      .refine((v) => (SOURCE_CONTENT_TYPES as readonly string[]).includes(v)),
    size: z.number().int().min(1).max(SOURCE_MAX_BYTES),
    uploadedBy: z.uuid(),
    supplierName: z
      .string()
      .refine((s) => codePoints(s) >= 1 && codePoints(s) <= 255)
      .nullable()
      .optional(),
    supplierContactEmail: z.email().max(320).nullable().optional(),
  })
  // EZD-301 (Q-0517): each kind takes only its own content types (order reports PDF only, field measure files
  // the photo types, Q-0513).
  .refine((v) => kindTakes(v.kind, v.contentType));

export function sourceFilePath(tenantId: string, projectId: string, sourceFileId: string): string {
  return `${tenantId}/${projectId}/${sourceFileId}`;
}

function toView(row: ViewRow): SourceFileView {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind as SourceFileKind,
    storagePath: row.storage_path,
    originalName: row.original_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
  };
}

// EZD-322 D2: the caller's own switch, read live through current_permissions on the caller's client. A missing
// context or a missing key is permission_denied; a failed read is storage_unavailable (no table call either way).
async function requireSeeCompanyCosts(client: DbClient, appUserId: string): Promise<void> {
  let ctx: Awaited<ReturnType<typeof loadPermissionContext>>;
  try {
    ctx = await loadPermissionContext(client, appUserId);
  } catch {
    throw new StorageError('storage_unavailable');
  }
  if (!can(ctx, 'see_company_costs')) throw new StorageError('permission_denied');
}

export async function startSourceFileUpload(
  client: DbClient,
  input: StartSourceFileInput,
): Promise<{ sourceFile: SourceFileView; upload: SignedUpload }> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) throw new StorageError('invalid_input');
  const v = parsed.data;

  const isCostRecord =
    COST_FILE_KINDS.includes(v.kind) ||
    (v.supplierName !== undefined && v.supplierName !== null) ||
    (v.supplierContactEmail !== undefined && v.supplierContactEmail !== null);
  if (isCostRecord) await requireSeeCompanyCosts(client, v.uploadedBy);

  const project = await client
    .from('project')
    .select('id, tenant_id')
    .eq('id', v.projectId)
    .maybeSingle();
  if (project.error) throw new StorageError('storage_unavailable', { cause: project.error });
  if (!project.data) throw new StorageError('project_not_found');

  const id = randomUUID();
  const path = sourceFilePath(project.data.tenant_id, v.projectId, id);
  const inserted = await client
    .from('source_file')
    .insert({
      id,
      tenant_id: project.data.tenant_id,
      project_id: v.projectId,
      kind: v.kind,
      storage_path: path,
      original_name: v.originalName,
      content_type: v.contentType,
      size_bytes: v.size,
      uploaded_by: v.uploadedBy,
      supplier_name: v.supplierName ?? null,
      supplier_contact_email: v.supplierContactEmail ?? null,
    })
    .select(VIEW_COLUMNS)
    .single();
  if (inserted.error) {
    if (inserted.error.code === '42501') throw new StorageError('upload_refused');
    if (inserted.error.code === '23514') throw new StorageError('invalid_input');
    throw new StorageError('storage_unavailable');
  }

  const upload = await createSignedUpload(client, { bucket: 'sources', path });
  return { sourceFile: toView(inserted.data), upload };
}

export async function completeSourceFileUpload(
  client: DbClient,
  sourceFileId: string,
): Promise<SourceFileView> {
  if (!z.uuid().safeParse(sourceFileId).success) throw new StorageError('invalid_input');

  const found = await client
    .from('source_file')
    .select(VIEW_COLUMNS)
    .eq('id', sourceFileId)
    .maybeSingle();
  if (found.error) throw new StorageError('storage_unavailable', { cause: found.error });
  if (!found.data) throw new StorageError('source_file_not_found');
  const row = toView(found.data);
  if (row.uploadedAt !== null) return row;

  const stat = await statObject(client, { bucket: 'sources', path: row.storagePath });
  if (stat === null) throw new StorageError('upload_missing');
  if (stat.size !== row.sizeBytes) throw new StorageError('upload_size_mismatch');

  const updated = await client
    .from('source_file')
    .update({ uploaded_at: new Date().toISOString() })
    .eq('id', sourceFileId)
    .is('uploaded_at', null)
    .select(VIEW_COLUMNS)
    .single();
  if (updated.error) {
    // No row under .single() (PGRST116): a concurrent complete stamped it first. Re-read the row by id and
    // return it when uploaded_at is set (Decided completeSourceFileUpload).
    if (updated.error.code !== 'PGRST116') {
      throw new StorageError('storage_unavailable', { cause: updated.error });
    }
    const again = await client
      .from('source_file')
      .select(VIEW_COLUMNS)
      .eq('id', sourceFileId)
      .maybeSingle();
    if (again.error || !again.data) throw new StorageError('storage_unavailable');
    // A still-pending re-read means the update policy refused the caller (EZD-320).
    if (again.data.uploaded_at === null) throw new StorageError('upload_refused');
    return toView(again.data);
  }
  return toView(updated.data);
}

// EZD-234 Build (Q-0704 03-data-model row 3 "File references are checked on save"): the rows of `ids` the caller's
// client can read, keyed by lower-case id, in reads of at most READ_CHUNK ids. A row it cannot read is absent.
export type StoredFileRef = { projectId: string; kind: string; uploaded: boolean };
const READ_CHUNK = 100;

export async function readSourceFileRefs(
  client: DbClient,
  ids: readonly string[],
): Promise<Map<string, StoredFileRef>> {
  const files = new Map<string, StoredFileRef>();
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const { data, error } = await client
      .from('source_file')
      .select('id, project_id, kind, uploaded_at')
      .in('id', ids.slice(i, i + READ_CHUNK));
    if (error) throw error;
    for (const row of data)
      files.set(row.id.toLowerCase(), {
        projectId: row.project_id,
        kind: row.kind,
        uploaded: row.uploaded_at !== null,
      });
  }
  return files;
}

// EZD-302: the import job's read of its project's files. It runs with the secret key, so the tenant and project
// filters stand in for RLS; a file of another tenant or project is absent.
export type JobSourceFile = { id: string; kind: string; storagePath: string; uploaded: boolean };

export async function readJobSourceFiles(
  client: DbClient,
  scope: { tenantId: string; projectId: string },
  ids: readonly string[],
): Promise<JobSourceFile[]> {
  const out: JobSourceFile[] = [];
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const { data, error } = await client
      .from('source_file')
      .select('id, kind, storage_path, uploaded_at')
      .eq('tenant_id', scope.tenantId)
      .eq('project_id', scope.projectId)
      .in('id', ids.slice(i, i + READ_CHUNK));
    if (error) throw error;
    for (const row of data)
      out.push({
        id: row.id,
        kind: row.kind,
        storagePath: row.storage_path,
        uploaded: row.uploaded_at !== null,
      });
  }
  return out;
}

// EZD-307: Import review's read of its import's files, through the caller's client so RLS decides what is visible
// (a file of another company or an unlisted project is absent). Keyed by lower-case id.
export type ReviewSourceFile = { name: string; kind: string; storagePath: string; uploaded: boolean };

export async function readReviewSourceFiles(
  client: DbClient,
  projectId: string,
  ids: readonly string[],
): Promise<Map<string, ReviewSourceFile>> {
  const out = new Map<string, ReviewSourceFile>();
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const { data, error } = await client
      .from('source_file')
      .select('id, kind, original_name, storage_path, uploaded_at')
      .eq('project_id', projectId)
      .in('id', ids.slice(i, i + READ_CHUNK));
    if (error) throw error;
    for (const row of data)
      out.set(row.id.toLowerCase(), {
        name: row.original_name,
        kind: row.kind,
        storagePath: row.storage_path,
        uploaded: row.uploaded_at !== null,
      });
  }
  return out;
}
