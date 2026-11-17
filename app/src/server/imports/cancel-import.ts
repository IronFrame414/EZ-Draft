// EZD-313 (S02 Controls Cancel import "Asks to confirm, then discards detected items. Uploaded source files are
// kept" and "No model changes are made"; Q-0215 "Cancel returns to the project with nothing imported";
// AC-EZD-313-1 "The model is unchanged after Cancel"): cancel_import, through the caller's session client, closes
// the review (its sessions become cancelled and its review rows are removed); it writes no model_object,
// model_version or source_file row (supabase/migrations/…_create_finish_cancel_import.sql).
import type { DbClient } from '../storage/objects';
import { closeRpcError } from './finish-import';

export type CancelImportResult =
  { status: 'cancelled'; tenantId: string } | { status: 'locked' | 'closed' };

export async function cancelImport(
  client: DbClient,
  projectId: string,
  jobId: string,
): Promise<CancelImportResult> {
  const { data, error } = await client.rpc('cancel_import', { p_project: projectId, p_job: jobId });
  if (error) throw closeRpcError(error);
  const answer = data as { status?: unknown; tenant_id?: unknown } | null;
  if (answer?.status === 'locked' || answer?.status === 'closed') return { status: answer.status };
  if (answer?.status === 'cancelled' && typeof answer.tenant_id === 'string') {
    return { status: 'cancelled', tenantId: answer.tenant_id };
  }
  throw new Error('cancel_import: unexpected answer');
}
