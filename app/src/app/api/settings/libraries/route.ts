// EZD-131 (S15h Controls, Permissions, Events emitted; 03e library_item): list one library tab's items and add
// an abbreviation. Order: 401, 403 (no Libraries switch), 400 (query or body), then the session client (RLS:
// the claim tenant). A duplicate abbreviation in the company is 400 `library_abbreviation_taken`.
// `library.item_created` is emitted after the insert; a failed emit does not fail the save.
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { currentTenantId } from '../../../../server/company/company';
import { errorType } from '../../../../server/errors/fingerprint';
import { reportError } from '../../../../server/errors/report';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { emit } from '../../../../server/events';
import {
  LIBRARY_COLUMNS,
  dataFor,
  isAbbreviationTaken,
  listLibraryItems,
  parseKindQuery,
  parseLibraryCreate,
  toLibraryItem,
} from '../../../../server/libraries/libraries';
import { requireApiPermission } from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/libraries';
const EMIT_FAILED = 'library_item_created_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_libraries');
    if (p instanceof Response) return p;
    const kind = parseKindQuery(new URL(request.url).searchParams);
    if (kind === null) return fail(400, 'invalid_input');
    const items = await listLibraryItems(createSessionClient(), kind);
    return Response.json({ items }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_libraries');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseLibraryCreate(raw);
    if (!parsed.ok) return fail(400, parsed.code);

    const client = createSessionClient();
    const tenantId = await currentTenantId(client);
    if (tenantId === null) return fail(403, 'permission_denied', 'error.not_authorized');

    const { data, error } = await client
      .from('library_item')
      .insert({
        tenant_id: tenantId,
        kind: parsed.value.kind,
        name: parsed.value.name,
        data: dataFor(parsed.value),
      })
      .select(LIBRARY_COLUMNS)
      .single();
    if (error) {
      if (isAbbreviationTaken(error)) return fail(400, 'library_abbreviation_taken');
      throw error;
    }

    try {
      await emit(
        'library.item_created',
        { itemId: data.id, kind: parsed.value.kind },
        { tenantId, actorId: p.session.appUserId },
      );
    } catch (e) {
      // The insert is committed; a failed emit does not fail the save.
      await reportError(new Error(EMIT_FAILED), {
        source: 'function',
        location: ROUTE,
        tags: { 'ezd.cause': errorType(e) },
      });
    }

    return Response.json({ item: toLibraryItem(data) }, { status: 201, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
