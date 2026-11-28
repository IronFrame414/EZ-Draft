// EZD-1201 (S18 States "Expired: ... Contractor renews for 30 days"; 03c share_link; 11 Security "random token,
// 30-day expiry, renewable, revocable"; 07 share_link.expiring; Q-0700 03 and 10 rows; Q-0213): the share link
// server side. The share link is the client sent_package row (20261121130000_share_links.sql). Every write runs
// through a definer function that checks Send to client and project scope again. The token never leaves here:
// only its SHA-256 goes to the database, and nothing in this file logs.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { requestIp } from '../events/event-log';
import { shareLinkExpiryDays } from '../sends/sends';
import { hashClientToken, isClientToken } from '../sends/token';

type Db = SupabaseClient<Database>;

export type ShareLinkStatus =
  | {
      status: 'active';
      sentPackageId: string;
      tenantId: string;
      projectId: string;
      modelVersionId: string;
      kind: 'client' | 'permit' | 'co' | 'supplier';
      expiresAt: string;
      company: string;
    }
  // S18 "This link has expired. Ask [Company] to renew it.": the company name and nothing else.
  | { status: 'expired'; company: string }
  | { status: 'not_found' }
  // EZD-1711 (Q-0795): the company stopped paying more than 14 days ago.
  | { status: 'unavailable' };

const SIGNED_OUT_JAR: SessionCookieJar = { getAll: () => [], set: () => {}, isHttps: () => false };

// The client link's status for the signed-out client page (EZD-1202). A value that is not a token shape is
// not_found without a database call. `view` records share_link.viewed for an active link (the page open, not
// every data request).
export async function resolveShareLink(
  token: unknown,
  opts: { view?: boolean; client?: Db } = {},
): Promise<ShareLinkStatus> {
  if (!isClientToken(token)) return { status: 'not_found' };
  const db = opts.client ?? createSessionClient(SIGNED_OUT_JAR);
  const { data, error } = await db.rpc('resolve_share_link', {
    p_token_hash: hashClientToken(token),
    p_view: opts.view ?? false,
  });
  if (error) throw error;
  const row = data as Record<string, unknown>;
  if (row.status === 'expired') return { status: 'expired', company: String(row.company) };
  if (row.status === 'unavailable') return { status: 'unavailable' };
  if (row.status !== 'active') return { status: 'not_found' };
  return {
    status: 'active',
    sentPackageId: String(row.sent_package_id),
    tenantId: String(row.tenant_id),
    projectId: String(row.project_id),
    modelVersionId: String(row.model_version_id),
    kind: row.kind as 'client' | 'permit' | 'co' | 'supplier',
    expiresAt: String(row.expires_at),
    company: String(row.company),
  };
}

export type ShareLinkError = 'permission_denied' | 'not_found' | 'revoked' | 'invalid_input';

function errorCode(error: { code?: string; message?: string }): ShareLinkError | null {
  if (error.code === '42501') return 'permission_denied';
  if (error.code === 'P0002') return 'not_found';
  if (error.code === 'P0001' && error.message === 'share_link_revoked') return 'revoked';
  if (error.code === '22023') return 'invalid_input';
  return null;
}

export type RenewOutcome =
  | { ok: true; link: { id: string; expiresAt: string; renewedAt: string } }
  | { ok: false; code: ShareLinkError };

// Renew: the same token works again for the Defaults "Share link expiry" (30 days) from now.
export async function renewShareLink(
  client: Db,
  sentPackageId: string,
  deps: { requestIp?: () => Promise<string | null> } = {},
): Promise<RenewOutcome> {
  const days = await shareLinkExpiryDays(client);
  const { data, error } = await client.rpc('renew_share_link', {
    p_sent_package: sentPackageId,
    p_expiry_days: days,
    p_ip: (await (deps.requestIp ?? requestIp)()) as string,
  });
  if (error) {
    const code = errorCode(error);
    if (code) return { ok: false, code };
    throw error;
  }
  const row = data as { id: string; expires_at: string; renewed_at: string };
  return { ok: true, link: { id: row.id, expiresAt: row.expires_at, renewedAt: row.renewed_at } };
}

export type RevokeOutcome =
  | { ok: true; link: { id: string; revokedAt: string } }
  | { ok: false; code: ShareLinkError };

export async function revokeShareLink(client: Db, sentPackageId: string): Promise<RevokeOutcome> {
  const { data, error } = await client.rpc('revoke_share_link', { p_sent_package: sentPackageId });
  if (error) {
    const code = errorCode(error);
    if (code) return { ok: false, code };
    throw error;
  }
  const row = data as { id: string; revoked_at: string };
  return { ok: true, link: { id: row.id, revokedAt: row.revoked_at } };
}

export type ShareLinkRow = {
  id: string;
  versionNo: number | null;
  recipient: { name: string; email: string };
  emailSentAt: string | null;
  createdAt: string;
  expiresAt: string;
  renewedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'expired' | 'revoked';
};

export type ListOutcome = { ok: true; links: ShareLinkRow[] } | { ok: false; code: ShareLinkError };

// The Share panel rows (Q-0213): on or off, who it was sent to, expiry. Newest first; no token or hash.
export async function listShareLinks(client: Db, projectId: string): Promise<ListOutcome> {
  const { data, error } = await client.rpc('list_share_links', { p_project: projectId });
  if (error) {
    const code = errorCode(error);
    if (code) return { ok: false, code };
    throw error;
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    ok: true,
    links: rows.map((r) => ({
      id: String(r.id),
      versionNo: typeof r.version_no === 'number' ? r.version_no : null,
      recipient: r.recipient as { name: string; email: string },
      emailSentAt: (r.email_sent_at as string | null) ?? null,
      createdAt: String(r.created_at),
      expiresAt: String(r.expires_at),
      renewedAt: (r.renewed_at as string | null) ?? null,
      revokedAt: (r.revoked_at as string | null) ?? null,
      status: r.status as ShareLinkRow['status'],
    })),
  };
}

// The reminder pass (07 share_link.expiring) with the given service-role client: each live link within its
// company's Defaults "Share link reminder" lead (7 days) of expiry is stamped and logged once. Returns the number
// reminded.
export async function sweepShareLinkRemindersWith(db: Db): Promise<number> {
  const { data, error } = await db.rpc('sweep_share_link_reminders');
  if (error) throw new Error('share_link_reminder_sweep_failed');
  return Number(data ?? 0);
}
