// EZD-304 (S01 PDF: scale calibration "Click two points on the page, type the real distance | Required before
// tracing. Stored in source_file.scale_calibration"; Q-0203 the scale can be added later): the scale of one uploaded
// PDF. GET: its scale and a short-lived link to the original (See projects), for the set-scale step and the plan
// underlay. POST { scaleCalibration }: stores the scale (Edit model). Order: 401, 403 without the permission, 404 for
// a malformed id, a file the caller's client cannot read (RLS: another company, an unlisted project), a file that is
// not a PDF or not finished uploading, 400 for an unreadable body or a calibration that cannot measure; any other
// failure is 500 after reportRouteFailure.
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { readPdfScale, setPdfScale, StorageError } from '../../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/source-files/[id]/scale';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const notFound = () => fail(404, 'source_file_not_found', 'error.invalid_input');

async function failed(e: unknown): Promise<Response> {
  const ended = await endedSessionResponse(e);
  if (ended) return ended;
  await reportRouteFailure(e, ROUTE);
  return fail(500, 'db_unavailable');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    try {
      const { url, ...sourceFile } = await readPdfScale(createSessionClient(), id);
      return Response.json({ sourceFile, url }, { status: 200, headers });
    } catch (e) {
      if (
        e instanceof StorageError &&
        (e.code === 'source_file_not_found' || e.code === 'object_not_found')
      ) {
        return notFound();
      }
      throw e;
    }
  } catch (e) {
    return failed(e);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    const body = (await request.json().catch(() => null)) as { scaleCalibration?: unknown } | null;
    if (
      body === null ||
      typeof body !== 'object' ||
      Object.keys(body).join() !== 'scaleCalibration'
    ) {
      return fail(400, 'invalid_input');
    }
    try {
      const sourceFile = await setPdfScale(createSessionClient(), id, body.scaleCalibration);
      return Response.json({ sourceFile }, { status: 200, headers });
    } catch (e) {
      if (e instanceof StorageError && e.code === 'source_file_not_found') return notFound();
      if (e instanceof StorageError && e.code === 'invalid_input')
        return fail(400, 'invalid_input');
      throw e;
    }
  } catch (e) {
    return failed(e);
  }
}
