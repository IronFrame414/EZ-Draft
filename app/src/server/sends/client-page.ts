// EZD-1202 (S18 Layout, States; AC-EZD-1202-1; Q-0700 03 row; 03b rule 11; vault/build/assumptions/EZD-1202.md
// Settled "Where the page and its data come from"): the signed-out client page's data. Two independent reads start
// together (CLAUDE.md rule 11): resolve_share_link for the status (expired with the company name, unavailable, not
// found; `view` records share_link.viewed on the page open) and client_page for the fixed field list. Only the
// fields of ClientPageView leave here: no money table is read and no cost field exists to send. The token never
// leaves here and nothing in this file logs.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientPageResult, ClientPageView } from '../../components/client/client-page-model';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { resolveShareLink } from '../share-links/share-links';
import { hashClientToken, isClientToken } from './token';

type Db = SupabaseClient<Database>;

const SIGNED_OUT_JAR: SessionCookieJar = { getAll: () => [], set: () => {}, isHttps: () => false };

type Row = {
  company: string;
  company_phone: string;
  company_email: string;
  project_name: string;
  project_type: string;
  version_no: number | null;
  rev_no: number | null;
  sent_at: string;
  expires_at: string;
  shares_sheets: boolean;
  reminder_lead: number;
};

function toView(row: Row): ClientPageView {
  return {
    company: row.company,
    contact: { phone: row.company_phone, email: row.company_email },
    project: { name: row.project_name, type: row.project_type },
    version:
      typeof row.rev_no === 'number'
        ? { kind: 'rev', no: row.rev_no, sentAt: row.sent_at }
        : { kind: 'version', no: row.version_no ?? 0, sentAt: row.sent_at },
    expiresAt: row.expires_at,
    reminderLeadDays: row.reminder_lead,
    sharesSheets: row.shares_sheets === true,
  };
}

export async function loadClientPage(
  token: unknown,
  opts: { view?: boolean; client?: Db } = {},
): Promise<ClientPageResult> {
  if (!isClientToken(token)) return { status: 'not_found' };
  const db = opts.client ?? createSessionClient(SIGNED_OUT_JAR);
  const [status, page] = await Promise.all([
    resolveShareLink(token, { view: opts.view ?? false, client: db }),
    db.rpc('client_page', { p_token_hash: hashClientToken(token) }),
  ]);
  if (page.error) throw page.error;
  if (status.status === 'expired') return { status: 'expired', company: status.company };
  if (status.status !== 'active') return { status: status.status };
  const row = page.data as Row | null;
  // The link turned off between the two reads.
  if (row === null || typeof row !== 'object') return { status: 'not_found' };
  return { status: 'active', page: toView(row) };
}
