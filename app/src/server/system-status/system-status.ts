// EZD-135 Build step 12 (vault/plans/EZD-135.md Decided "Job failures query", "Webhook failures query",
// "Backups"; Q-0664; Q-0672 (b)): reads through the caller's session client: failed jobs and webhook failures
// under RLS (the claim tenant), backup and drill rows through public.system_backup_status().
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '../db/database.types';
import {
  JOB_FAILURE_DAYS,
  SYSTEM_STATUS_PAGE_SIZE,
  type BackupStatus,
  type JobFailureRow,
  type StatusPage,
  type WebhookFailureRow,
} from '../../lib/system-status/system-status';

export type BackupStatusResult =
  { ok: true; status: BackupStatus } | { ok: false; code: 'permission_denied' };

const jobRows = z.array(
  z.strictObject({
    id: z.string(),
    kind: z.string(),
    error: z.string().nullable(),
    attempts: z.number().int().nonnegative(),
    finished_at: z.string(),
  }),
);
const webhookRows = z.array(
  z.strictObject({
    id: z.string(),
    title: z.string(),
    ref: z.string().nullable(),
    occurrences: z.number().int().positive(),
    last_seen_at: z.string(),
  }),
);
const backupRows = z.array(
  z.strictObject({
    kind: z.enum(['files', 'db_dump', 'restore_drill']),
    status: z.enum(['succeeded', 'failed']),
    finished_at: z.string(),
    bytes_copied: z.number().int().nonnegative(),
    location: z.string().nullable(),
  }),
);

const COUNT_FAILED = 'system_status_count_failed';
const BAD_REPLY = 'system_status_bad_reply';

function pastEnd(count: number | null, error: { code?: string } | null): number {
  if (error !== null || count === null) throw new Error(COUNT_FAILED);
  return count;
}

export async function loadJobFailures(
  client: SupabaseClient<Database>,
  page: number,
  now: Date = new Date(),
): Promise<StatusPage<JobFailureRow>> {
  const since = new Date(now.getTime() - JOB_FAILURE_DAYS * 86_400_000).toISOString();
  const from = (page - 1) * SYSTEM_STATUS_PAGE_SIZE;
  const to = from + SYSTEM_STATUS_PAGE_SIZE - 1;
  const { data, error, count } = await client
    .from('job')
    .select('id, kind, error, attempts, finished_at', { count: 'exact' })
    .eq('status', 'failed')
    .gte('finished_at', since)
    .order('finished_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (error) {
    if (error.code !== 'PGRST103') throw error;
    const head = await client
      .from('job')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('finished_at', since);
    return {
      rows: [],
      total: pastEnd(head.count, head.error),
      page,
      pageSize: SYSTEM_STATUS_PAGE_SIZE,
    };
  }
  if (count === null) throw new Error(COUNT_FAILED);
  const parsed = jobRows.safeParse(data);
  if (!parsed.success) throw new Error(BAD_REPLY);
  return {
    rows: parsed.data.map((r) => ({
      id: r.id,
      kind: r.kind,
      error: r.error,
      attempts: r.attempts,
      finishedAt: r.finished_at,
    })),
    total: count,
    page,
    pageSize: SYSTEM_STATUS_PAGE_SIZE,
  };
}

export async function loadWebhookFailures(
  client: SupabaseClient<Database>,
  page: number,
): Promise<StatusPage<WebhookFailureRow>> {
  const from = (page - 1) * SYSTEM_STATUS_PAGE_SIZE;
  const to = from + SYSTEM_STATUS_PAGE_SIZE - 1;
  const { data, error, count } = await client
    .from('error_alert')
    .select('id, title, ref, occurrences, last_seen_at', { count: 'exact' })
    .eq('kind', 'webhook_failed')
    .order('last_seen_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);
  if (error) {
    if (error.code !== 'PGRST103') throw error;
    const head = await client
      .from('error_alert')
      .select('id', { count: 'exact', head: true })
      .eq('kind', 'webhook_failed');
    return {
      rows: [],
      total: pastEnd(head.count, head.error),
      page,
      pageSize: SYSTEM_STATUS_PAGE_SIZE,
    };
  }
  if (count === null) throw new Error(COUNT_FAILED);
  const parsed = webhookRows.safeParse(data);
  if (!parsed.success) throw new Error(BAD_REPLY);
  return {
    rows: parsed.data.map((r) => ({
      id: r.id,
      title: r.title,
      ref: r.ref,
      occurrences: r.occurrences,
      lastSeenAt: r.last_seen_at,
    })),
    total: count,
    page,
    pageSize: SYSTEM_STATUS_PAGE_SIZE,
  };
}

export async function loadBackupStatus(
  client: SupabaseClient<Database>,
): Promise<BackupStatusResult> {
  const { data, error } = await client.rpc('system_backup_status');
  if (error) {
    if (error.code === '42501' && error.message === 'permission_denied')
      return { ok: false, code: 'permission_denied' };
    throw error;
  }
  const parsed = backupRows.safeParse(data);
  if (!parsed.success) throw new Error('system_backup_status_bad_reply');
  const status: BackupStatus = { files: null, dbDump: null, restoreDrill: null };
  const seen = new Set<string>();
  for (const r of parsed.data) {
    if (seen.has(r.kind)) throw new Error('system_backup_status_bad_reply');
    seen.add(r.kind);
    const row = { finishedAt: r.finished_at, bytesCopied: r.bytes_copied, location: r.location };
    if (r.kind === 'files') status.files = row;
    else if (r.kind === 'db_dump') status.dbDump = row;
    else status.restoreDrill = { ...row, status: r.status };
  }
  return { ok: true, status };
}
