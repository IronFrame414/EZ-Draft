// EZD-1418 (S17b Desktop side "sent rooms appear in Import review as Field measure items with high confidence";
// S02 Entry points "rooms sent from the phone (17b Field measure, source kind field_measure)"; AC-EZD-1418-1): the
// import of one recorded Send to office. The walls and rooms are worked out here from the sent rooms
// (lib/imports/field-measure-items.ts) and written through create_field_measure_import under the sender's session
// (supabase/migrations/20261124120000_field_measure_import.sql), which checks the send is the caller's and is the one
// the session's sent rooms came from. Safe to run again for the same send: it answers exists.
import type { FieldRoom } from '../../field-measure/rooms';
import { fieldMeasureItems } from '../../lib/imports/field-measure-items';
import type { Json } from '../db/database.types';
import type { DbClient } from '../storage/objects';

export type FieldMeasureImportResult =
  | { status: 'created' | 'exists'; jobId: string }
  /** No room was measured fully, so there is nothing to review. */
  | { status: 'empty' }
  /** The send found rooms already sent and changed nothing (20261121230000). */
  | { status: 'not_sent' };

/** The Import review page of a field measure import. */
export const importReviewPath = (projectId: string, jobId: string): string =>
  `/projects/${encodeURIComponent(projectId)}/import/${encodeURIComponent(jobId)}`;

export async function createFieldMeasureImport(
  client: DbClient,
  projectId: string,
  changeId: string,
  rooms: readonly FieldRoom[],
): Promise<FieldMeasureImportResult> {
  const items = fieldMeasureItems(rooms);
  if (items.length === 0) return { status: 'empty' };
  const { data, error } = await client.rpc('create_field_measure_import', {
    p_project: projectId,
    p_change: changeId,
    p_items: items as unknown as Json,
  });
  if (error) throw error;
  const answer = data as { status?: unknown; job_id?: unknown } | null;
  if (answer?.status === 'not_sent') return { status: 'not_sent' };
  if ((answer?.status === 'created' || answer?.status === 'exists') && typeof answer.job_id === 'string') {
    return { status: answer.status, jobId: answer.job_id };
  }
  throw new Error('create_field_measure_import: unexpected answer');
}
