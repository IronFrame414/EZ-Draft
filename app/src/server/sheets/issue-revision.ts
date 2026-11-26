// EZD-717 (S13 Controls "Issue Rev n"; W11 3-4; 09h Revision rules; 03c permit_revision, electrical_calc;
// AC-EZD-717-1): the issue's database calls, under the member's session so RLS and the definer functions decide.
// - loadPermitRevisions: the project's issued revisions, oldest first (permit_revision RLS: another company's project,
//   or one out of scope, reads as none).
// - issuePermitSet: public.issue_permit_set (supabase/migrations/20261126230000_issue_permit_revision.sql): a frozen
//   checkpoint of the saved working copy named "Rev N", the permit_revision row, the electrical_calc row when given
//   and the plan_set.issued event_log row, all in one transaction.
// - attachRevisionExport: records the issue's PDF export job once.
// - issuedPdf: the issued revision's export job and, once it is done, a signed link to its first file (the exports
//   bucket lets a member read only an issued revision's files, storage_exports_issued_select).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../db/database.types';
import type { IssuedRevision } from '../../lib/sheets/revisions';
import { signedDownloadUrl } from '../storage';

type Client = SupabaseClient<Database>;

export type ElectricalCalcInput = {
  case: 'existing' | 'proposed';
  method: 'standard' | 'optional';
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
};

export type IssueResult =
  | { ok: true; permitRevisionId: string; revNo: number; modelVersionId: string; issuedAt: string }
  | { ok: false; code: 'permission_denied' | 'project_not_found' | 'invalid_input' };

export async function loadPermitRevisions(client: Client, projectId: string): Promise<IssuedRevision[]> {
  const { data, error } = await client
    .from('permit_revision')
    .select('id, rev_no, issued_at, description, model_version_id, export_job_id')
    .eq('project_id', projectId)
    .order('rev_no');
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    revNo: r.rev_no,
    issuedAt: r.issued_at,
    description: r.description,
    modelVersionId: r.model_version_id,
    exportJobId: r.export_job_id,
  }));
}

const refused = (e: { code?: string; message?: string }): IssueResult | null => {
  if (e.code === '42501') return { ok: false, code: 'permission_denied' };
  if (e.code === 'P0002') return { ok: false, code: 'project_not_found' };
  if (e.code === '22023') return { ok: false, code: 'invalid_input' };
  return null;
};

export async function issuePermitSet(
  client: Client,
  input: {
    projectId: string;
    description: string | null;
    electrical: ElectricalCalcInput | null;
    ip: string | null;
  },
): Promise<IssueResult> {
  const { data, error } = await client.rpc('issue_permit_set', {
    p_project: input.projectId,
    p_description: input.description as string,
    p_electrical: input.electrical as Json,
    p_ip: input.ip as string,
  });
  if (error) {
    const r = refused(error);
    if (r !== null) return r;
    throw error;
  }
  const d = data as { permit_revision_id: string; rev_no: number; model_version_id: string; issued_at: string };
  return {
    ok: true,
    permitRevisionId: d.permit_revision_id,
    revNo: d.rev_no,
    modelVersionId: d.model_version_id,
    issuedAt: d.issued_at,
  };
}

export async function attachRevisionExport(client: Client, revisionId: string, jobId: string): Promise<void> {
  const { error } = await client.rpc('attach_permit_revision_export', { p_revision: revisionId, p_job: jobId });
  if (error) throw error;
}

export type IssuedPdf = {
  revNo: number;
  status: 'none' | 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  // The first file's download name and a signed link (15 minutes), once the job is done.
  file: { name: string; url: string } | null;
};

type ExportResult = { files?: { name?: unknown; bucket?: unknown; path?: unknown }[] };

// The issued revision `revNo` of the project, or null when RLS shows none.
export async function issuedPdf(client: Client, projectId: string, revNo: number): Promise<IssuedPdf | null> {
  const rev = await client
    .from('permit_revision')
    .select('rev_no, export_job_id')
    .eq('project_id', projectId)
    .eq('rev_no', revNo)
    .maybeSingle();
  if (rev.error) throw rev.error;
  if (rev.data === null) return null;
  if (rev.data.export_job_id === null) return { revNo, status: 'none', progress: 0, file: null };
  const job = await client
    .from('job')
    .select('status, progress, result')
    .eq('id', rev.data.export_job_id)
    .maybeSingle();
  if (job.error) throw job.error;
  if (job.data === null) return { revNo, status: 'none', progress: 0, file: null };
  const status = job.data.status as IssuedPdf['status'];
  if (status !== 'done') return { revNo, status, progress: job.data.progress, file: null };
  const first = (job.data.result as ExportResult | null)?.files?.[0];
  if (
    first === undefined ||
    typeof first.name !== 'string' ||
    first.bucket !== 'exports' ||
    typeof first.path !== 'string'
  )
    return { revNo, status, progress: 100, file: null };
  const url = await signedDownloadUrl(client, { bucket: 'exports', path: first.path });
  return { revNo, status, progress: 100, file: { name: first.name, url } };
}
