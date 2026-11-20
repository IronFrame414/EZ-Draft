// EZD-220 (03c:15; Q-0704 10-permissions "Reading pins, photos and notes needs only seeing the project"; Q-0704
// 03-data-model "Downloads are signed from the row's own storage_path"; AC-EZD-220-2, -6): a short-lived link to one
// pin photo for its thumbnail. Order: 401, 403 without See projects, 404 for a malformed id, a file the caller's
// client cannot read (RLS: another company, an unlisted project), a file of another kind, an unfinished upload or a
// missing object; any other failure is 500 after reportRouteFailure.
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission } from '../../../../../server/permissions';
import { signPhotoLink, StorageError } from '../../../../../server/storage';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/source-files/[id]/link';

const notFound = () =>
  Response.json(
    { error: { code: 'source_file_not_found', message_key: 'error.invalid_input' } },
    { status: 404, headers },
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    try {
      const url = await signPhotoLink(createSessionClient(), id);
      return Response.json({ url }, { status: 200, headers });
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
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}
