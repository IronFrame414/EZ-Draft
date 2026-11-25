// EZD-901a (phase-09 EZD-901a "adds the 150,000-entity DXF to the benchmark project"; 11 Budgets): gives the
// benchmark project its reference drawing the way a user's upload does: a source_file of kind dxf through the
// caller's session (RLS and the sources bucket policies apply), the bytes sent to the signed upload, the upload
// completed, then one reference_convert job (EZD-901a's conversion, run once per upload). Done once per project: a
// benchmark project whose reference upload already completed is left as it is, so a later call or a retry after
// a failed attempt does not upload it again.
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadFile } from '../../lib/storage/upload';
import type { Database } from '../db/database.types';
import { enqueueJob } from '../jobs/enqueue';
import { completeSourceFileUpload, startSourceFileUpload } from '../storage';
import { findUploadedSourceFile } from '../storage/source-files';
import { BENCHMARK_DXF_NAME, generateBenchmarkDxf } from './benchmark-dxf';

export const BENCHMARK_DXF_CONTENT_TYPE = 'image/vnd.dxf';

export async function attachBenchmarkReference(
  client: SupabaseClient<Database>,
  input: { projectId: string; appUserId: string },
  options: { kick?: () => void } = {},
): Promise<{ sourceFileId: string; attached: boolean }> {
  const existing = await findUploadedSourceFile(client, {
    projectId: input.projectId,
    kind: 'dxf',
    originalName: BENCHMARK_DXF_NAME,
  });
  if (existing) return { sourceFileId: existing, attached: false };

  const bytes = new TextEncoder().encode(generateBenchmarkDxf());
  const { sourceFile, upload } = await startSourceFileUpload(client, {
    projectId: input.projectId,
    kind: 'dxf',
    originalName: BENCHMARK_DXF_NAME,
    contentType: BENCHMARK_DXF_CONTENT_TYPE,
    size: bytes.length,
    uploadedBy: input.appUserId,
  });
  await uploadFile(upload, new Blob([bytes]), { contentType: BENCHMARK_DXF_CONTENT_TYPE });
  await completeSourceFileUpload(client, sourceFile.id);
  await enqueueJob(
    client,
    { kind: 'reference_convert', projectId: input.projectId, payload: { sourceFileId: sourceFile.id } },
    options.kick ? { kick: options.kick } : {},
  );
  return { sourceFileId: sourceFile.id, attached: true };
}
