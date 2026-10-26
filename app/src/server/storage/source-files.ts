// EZD-132 Step 9 (vault/plans/EZD-132.md Decided startSourceFileUpload, completeSourceFileUpload, View;
// AC-EZD-132-5): a source_file row comes before its object. start checks the input, finds the project through
// the caller's client (RLS: another tenant's or an unlisted project is not found), inserts the row and signs
// the upload; complete checks the object is there with the declared size and stamps uploaded_at once (the
// trigger of Step 1 stores now() and refuses a second stamp). Only the view's columns leave the server.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SOURCE_FILE_KINDS, type SourceFileKind } from '../../lib/storage/source-file-kinds';
import type { SignedUpload } from '../../lib/storage/upload';
import { createSignedUpload, statObject, StorageError, type DbClient } from './objects';

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

const startSchema = z.object({
  projectId: z.uuid(),
  kind: z.enum(SOURCE_FILE_KINDS),
  originalName: z.string().refine((s) => codePoints(s) >= 1 && codePoints(s) <= 255),
  contentType: z.string().trim().toLowerCase().max(127).regex(CONTENT_TYPE_RE),
  size: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  uploadedBy: z.uuid(),
  supplierName: z
    .string()
    .refine((s) => codePoints(s) >= 1 && codePoints(s) <= 255)
    .nullable()
    .optional(),
  supplierContactEmail: z.email().max(320).nullable().optional(),
});

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

export async function startSourceFileUpload(
  client: DbClient,
  input: StartSourceFileInput,
): Promise<{ sourceFile: SourceFileView; upload: SignedUpload }> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) throw new StorageError('invalid_input');
  const v = parsed.data;

  const project = await client
    .from('project')
    .select('id, tenant_id')
    .eq('id', v.projectId)
    .maybeSingle();
  if (project.error) throw new StorageError('storage_unavailable');
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
  if (found.error) throw new StorageError('storage_unavailable');
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
    if (updated.error.code !== 'PGRST116') throw new StorageError('storage_unavailable');
    const again = await client
      .from('source_file')
      .select(VIEW_COLUMNS)
      .eq('id', sourceFileId)
      .maybeSingle();
    if (again.error || !again.data || again.data.uploaded_at === null) {
      throw new StorageError('storage_unavailable');
    }
    return toView(again.data);
  }
  return toView(updated.data);
}
