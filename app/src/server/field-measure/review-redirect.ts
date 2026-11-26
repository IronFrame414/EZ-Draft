// EZD-1422 (S01 Input source "Field measure creates the project and sends the Foreman a link to 17b; the project
// opens on 02 Import review when the rooms arrive"; AC-EZD-1422-1 "the project opens on Import review after a
// send"): the import job whose review the project opens on, or null. Only a project with a field measure request
// from the wizard (not cancelled) opens there, and only while the newest Field measure import of the project is
// in review (status ready); Finish or Cancel import closes it and the project opens on the plan again. Reads go
// through the caller's session client and RLS, so an out-of-scope project answers null.
import { z } from 'zod';
import type { DbClient } from '../storage/objects';

export async function fieldMeasureReviewJob(
  client: DbClient,
  projectId: string,
): Promise<string | null> {
  if (!z.uuid().safeParse(projectId).success) return null;
  const request = await client
    .from('field_measure_request')
    .select('id')
    .eq('project_id', projectId)
    .is('cancelled_at', null)
    .maybeSingle();
  if (request.error) throw request.error;
  if (request.data === null) return null;
  const session = await client
    .from('import_session')
    .select('job_id, status')
    .eq('project_id', projectId)
    .eq('source_kind', 'field_measure')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (session.error) throw session.error;
  if (session.data === null || session.data.status !== 'ready') return null;
  return session.data.job_id ?? null;
}
