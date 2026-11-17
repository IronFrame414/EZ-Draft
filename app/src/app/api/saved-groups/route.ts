// EZD-233 (S03 Decisions "Save as group"; R26 Saved section of the Fixtures panel; 03e library_item;
// vault/build/assumptions.md EZD-233): the Plan editor lists the company's saved groups and saves a new one. Both need
// Edit model (the Settings > Libraries switch is not needed: the group is made and placed in the editor). Order: 401,
// 403, 400 (body), then the session client (RLS: the claim tenant). `library.item_created` is emitted after the
// insert; a failed emit does not fail the save.
import { endedSessionResponse } from '../../../server/auth/ended-session';
import { createSessionClient } from '../../../server/auth/supabase-server';
import { currentTenantId } from '../../../server/company/company';
import { errorType } from '../../../server/errors/fingerprint';
import { reportError } from '../../../server/errors/report';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { emit } from '../../../server/events';
import {
  SAVED_GROUP_BODY_MAX,
  listSavedGroups,
  parseSavedGroupCreate,
  toJson,
} from '../../../server/libraries/saved-groups';
import { requireApiPermission } from '../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/saved-groups';
const EMIT_FAILED = 'library_item_created_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(): Promise<Response> {
  try {
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    const groups = await listSavedGroups(createSessionClient());
    return Response.json({ groups }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;

    let raw: unknown;
    try {
      const text = await request.text();
      if (text.length > SAVED_GROUP_BODY_MAX) return fail(400, 'invalid_input');
      raw = JSON.parse(text);
    } catch {
      return fail(400, 'invalid_input');
    }
    const parsed = parseSavedGroupCreate(raw);
    if (!parsed.ok) return fail(400, parsed.code);

    const client = createSessionClient();
    const tenantId = await currentTenantId(client);
    if (tenantId === null) return fail(403, 'permission_denied', 'error.not_authorized');

    const { data, error } = await client
      .from('library_item')
      .insert({
        tenant_id: tenantId,
        kind: 'saved_group',
        name: parsed.value.name,
        data: toJson(parsed.value.data),
      })
      .select('id, name')
      .single();
    if (error) throw error;

    try {
      await emit(
        'library.item_created',
        { itemId: data.id, kind: 'saved_group' },
        { tenantId, actorId: p.session.appUserId },
      );
    } catch (e) {
      await reportError(new Error(EMIT_FAILED), {
        source: 'function',
        location: ROUTE,
        tags: { 'ezd.cause': errorType(e) },
      });
    }

    return Response.json({ group: { id: data.id, name: data.name } }, { status: 201, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
