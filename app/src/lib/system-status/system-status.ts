// EZD-135 Build step 11 (vault/plans/EZD-135.md section 3; Q-0664): the System status constants, reply types and
// query parser shared by the route and EZD-135b's page. No React, no Supabase.

export const SYSTEM_STATUS_PAGE_SIZE = 50;
export const JOB_FAILURE_DAYS = 30;
export const SYSTEM_STATUS_PATH = '/settings/system-status';

export type StatusPart = 'jobs' | 'webhooks' | 'backups';
export type StatusQuery = { part: StatusPart; page: number };
export type StatusPage<T> = { rows: T[]; total: number; page: number; pageSize: number };
export type JobFailureRow = {
  id: string;
  kind: string;
  error: string | null;
  attempts: number;
  finishedAt: string;
};
export type WebhookFailureRow = {
  id: string;
  title: string;
  ref: string | null;
  occurrences: number;
  lastSeenAt: string;
};
export type BackupRow = { finishedAt: string; bytesCopied: number; location: string | null };
export type DrillRow = BackupRow & { status: 'succeeded' | 'failed' };
export type BackupStatus = {
  files: BackupRow | null;
  dbDump: BackupRow | null;
  restoreDrill: DrillRow | null;
};

const PAGE_PATTERN = /^[1-9][0-9]{0,5}$/;

export function parseStatusQuery(params: URLSearchParams): StatusQuery | null {
  const part = params.get('part');
  if (part !== 'jobs' && part !== 'webhooks' && part !== 'backups') return null;
  const pageRaw = params.get('page');
  let page = 1;
  if (pageRaw !== null) {
    if (!PAGE_PATTERN.test(pageRaw)) return null;
    page = Number(pageRaw);
  }
  return { part, page };
}
