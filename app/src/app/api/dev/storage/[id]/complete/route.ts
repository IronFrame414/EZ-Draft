// EZD-132 Step 12 (vault/plans/EZD-132.md Decided Dev routes; section 3): finish a source file upload for the
// /dev/storage test page and answer a 900 s download link. Not found in production. The body is ignored; the
// id comes from the path. After the id parse the caller needs Edit model (requireApiPermission with no target,
// EZD-102 U8; Q-0202): the path names a source_file row, whose RLS applies the project scope. Order: production
// 404, then 401, then 400, then 403 (permission), then the helper's 400s, then 500. A 500 reports the error
// first (reportRouteFailure, EZD-169).
import { z } from 'zod';
import { requireApiSession } from '../../../../../../server/auth/session';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import { requireApiPermission, type Permitted } from '../../../../../../server/permissions';
import {
  completeSourceFileUpload,
  signedDownloadUrl,
  StorageError,
} from '../../../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

const ROUTE = '/api/dev/storage/[id]/complete';

const INPUT_CODES = new Set([
  'invalid_input',
  'project_not_found',
  'source_file_not_found',
  'upload_refused',
  'upload_missing',
  'upload_size_mismatch',
]);

const invalidInput = (code = 'invalid_input') =>
  Response.json({ error: { code, message_key: 'error.invalid_input' } }, { status: 400, headers });

const dbUnavailable = () =>
  Response.json(
    { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
    { status: 500, headers },
  );

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  let s: Awaited<ReturnType<typeof requireApiSession>>;
  try {
    s = await requireApiSession();
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return dbUnavailable();
  }
  if (s instanceof Response) return s;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return invalidInput();
  let permitted: Permitted | Response;
  try {
    permitted = await requireApiPermission('edit_model');
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return dbUnavailable();
  }
  if (permitted instanceof Response) return permitted;
  try {
    const client = createSessionClient();
    const sourceFile = await completeSourceFileUpload(client, id);
    const downloadUrl = await signedDownloadUrl(client, {
      bucket: 'sources',
      path: sourceFile.storagePath,
    });
    return Response.json({ sourceFile, downloadUrl }, { status: 200, headers });
  } catch (e) {
    if (e instanceof StorageError && INPUT_CODES.has(e.code)) return invalidInput(e.code);
    await reportRouteFailure(e, ROUTE);
    return dbUnavailable();
  }
}
