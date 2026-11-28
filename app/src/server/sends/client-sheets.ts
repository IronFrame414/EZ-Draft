// EZD-2032 (AC-EZD-2032-2, -3; S18 Page tab: Plans, States; Q-0700 03 row; 03b rule 11; 11 Operations "files are
// served through short-lived signed links"): the signed-out client page's Plans tab. Two independent reads start
// together (CLAUDE.md rule 11): resolve_share_link for the status (expired with the company name, unavailable, not
// found) and client_sheets for the tab (none, preparing, or ready with the sheet list the client_sheet_images job
// wrote). Each ready sheet's image and thumbnail are signed for SIGNED_DOWNLOAD_SECONDS through the signed-out client,
// which the storage policy lets sign only a live client link's sheet images (20261128163212_client_sheet_images.sql).
// An expired, revoked or unknown link gets no link. Only the fields of ClientSheetsView leave here (no cost data);
// the token never leaves here and nothing in this file logs.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientSheetsResult, ClientSheetView } from '../../components/client/client-page-model';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';
import type { Database } from '../db/database.types';
import { clientSheetFiles, type ClientSheetImage } from '../jobs/client-sheet-images/paths';
import { resolveShareLink } from '../share-links/share-links';
import { SIGNED_DOWNLOAD_SECONDS, signedDownloadUrl } from '../storage/objects';
import { hashClientToken, isClientToken } from './token';

type Db = SupabaseClient<Database>;

const SIGNED_OUT_JAR: SessionCookieJar = { getAll: () => [], set: () => {}, isHttps: () => false };

type Row =
  | { status: 'none' }
  | { status: 'preparing' }
  | { status: 'ready'; dir: string; sheets: ClientSheetImage[] };

export async function loadClientSheets(token: unknown, opts: { client?: Db } = {}): Promise<ClientSheetsResult> {
  if (!isClientToken(token)) return { status: 'not_found' };
  const db = opts.client ?? createSessionClient(SIGNED_OUT_JAR);
  const [status, read] = await Promise.all([
    resolveShareLink(token, { view: false, client: db }),
    db.rpc('client_sheets', { p_token_hash: hashClientToken(token) }),
  ]);
  if (read.error) throw read.error;
  if (status.status === 'expired') return { status: 'expired', company: status.company };
  if (status.status !== 'active') return { status: status.status };
  const row = read.data as Row | null;
  // The link turned off between the two reads.
  if (row === null || typeof row !== 'object') return { status: 'not_found' };
  if (row.status === 'none') return { status: 'active', plans: { state: 'none' } };
  if (row.status !== 'ready') return { status: 'active', plans: { state: 'preparing' } };
  const sheets: ClientSheetView[] = await Promise.all(
    row.sheets.map(async (s, i) => {
      const files = clientSheetFiles(row.dir, i);
      const [src, thumbSrc] = await Promise.all([
        signedDownloadUrl(db, { bucket: 'exports', path: files.image }, { expiresIn: SIGNED_DOWNLOAD_SECONDS }),
        signedDownloadUrl(db, { bucket: 'exports', path: files.thumb }, { expiresIn: SIGNED_DOWNLOAD_SECONDS }),
      ]);
      return {
        number: s.number,
        title: s.title,
        src,
        width: s.width,
        height: s.height,
        thumb: { src: thumbSrc, width: s.thumbWidth, height: s.thumbHeight },
      };
    }),
  );
  return { status: 'active', plans: { state: 'ready', sheets } };
}
