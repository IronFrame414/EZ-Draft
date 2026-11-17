// EZD-301 (S01 Start from a file flow; 03c source_file): finish one original's upload. The database stamps
// uploaded_at once the object is in Storage with the declared size (EZD-132); the original is never changed.
// Order: 401, 403 without Edit model, 404 for a malformed id, then the helper's 400s; any other failure is 500
// after reportRouteFailure. RLS on source_file applies the project scope.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { completeSourceFileUpload, StorageError } from '../../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/source-files/[id]/complete';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const INPUT_CODES = new Set([
  'invalid_input',
  'source_file_not_found',
  'upload_refused',
  'upload_missing',
  'upload_size_mismatch',
]);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success)
      return fail(404, 'source_file_not_found', 'error.invalid_input');
    try {
      const sourceFile = await completeSourceFileUpload(createSessionClient(), id);
      return Response.json({ sourceFile }, { status: 200, headers });
    } catch (e) {
      if (e instanceof StorageError && INPUT_CODES.has(e.code)) {
        return fail(400, e.code, 'error.invalid_input');
      }
      throw e;
    }
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
