// EZD-132 Step 11 (vault/plans/EZD-132.md Decided Dev routes; section 3): start a source file upload for the
// /dev/storage test page. Not found in production (EZD-010 Step 5 rule). After the body parse the caller needs
// Edit model on the project (requireApiPermission, EZD-102 U8; Q-0202); RLS and the Storage policies stay the
// backstop. Order: production 404, then 401, then 400, then 403 or 404 (permission), then the helper's 400s,
// then 500. A 500 reports the error first (reportRouteFailure, EZD-169).
import { z } from 'zod';
import { SOURCE_FILE_KINDS } from '../../../../lib/storage/source-file-kinds';
import { requireApiSession } from '../../../../server/auth/session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission, type Permitted } from '../../../../server/permissions';
import { startSourceFileUpload, StorageError } from '../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

const ROUTE = '/api/dev/storage';

const bodySchema = z.object({
  projectId: z.uuid(),
  kind: z.enum(SOURCE_FILE_KINDS),
  originalName: z.string(),
  contentType: z.string(),
  size: z.number(),
});

// StorageError codes answered 400 with their own code (Decided Dev routes); every other error is 500.
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

// A failed session read or database error (Q-0168 (b); architecture Errors and logging).
const dbUnavailable = () =>
  Response.json(
    { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
    { status: 500, headers },
  );

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  let s: Awaited<ReturnType<typeof requireApiSession>>;
  try {
    s = await requireApiSession();
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return dbUnavailable();
  }
  if (s instanceof Response) return s;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalidInput();
  let permitted: Permitted | Response;
  try {
    permitted = await requireApiPermission('edit_model', { projectId: body.data.projectId });
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return dbUnavailable();
  }
  if (permitted instanceof Response) return permitted;
  try {
    const { sourceFile, upload } = await startSourceFileUpload(createSessionClient(), {
      ...body.data,
      uploadedBy: s.appUserId,
    });
    return Response.json({ sourceFile, upload }, { status: 201, headers });
  } catch (e) {
    if (e instanceof StorageError && INPUT_CODES.has(e.code)) return invalidInput(e.code);
    await reportRouteFailure(e, ROUTE);
    return dbUnavailable();
  }
}
