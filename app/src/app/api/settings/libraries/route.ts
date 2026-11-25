// EZD-131 (S15h Controls, Permissions, Events emitted; 03e library_item): list one library tab's items and add
// an abbreviation or (EZD-714) a note. Order: 401, 403 (no Libraries switch), 400 (query or body), then the session client (RLS:
// the claim tenant). A duplicate abbreviation in the company is 400 `library_abbreviation_taken`.
// `library.item_created` is emitted after the insert; a failed emit does not fail the save.
// EZD-1408 (S15h Permissions "Edit field tasks may also edit field task templates"): field task templates are
// listed and added with the Libraries switch or Edit field tasks; a second template for a room type is 400
// `task_template_exists`.
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
  isTemplateTaken,
  listLibraryItems,
  parseKindQuery,
  parseLibraryCreate,
  toLibraryItem,
} from '../../../../server/libraries/libraries';
import { can, getPermissionContext, requireApiPermission } from '../../../../server/permissions';
import type { PermissionKey } from '../../../../lib/permissions/catalog';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/libraries';
const EMIT_FAILED = 'library_item_created_event_failed';

// EZD-1408: the switches that open one kind's items.
const TEMPLATE_PERMISSIONS: readonly [PermissionKey, ...PermissionKey[]] = [
  'settings_libraries',
  'edit_field_tasks',
];
const permissionsFor = (kind: unknown) =>
  kind === 'task_template' ? TEMPLATE_PERMISSIONS : ('settings_libraries' as const);

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(request: Request): Promise<Response> {
  try {
    const kind = parseKindQuery(new URL(request.url).searchParams);
    // EZD-714 (S15c Required notes: a multi-select from the notes library): the Sheet presets switch also
    // reads the notes.
    if (kind === 'note') {
      const ctx = await getPermissionContext();
      if (ctx !== null && can(ctx, 'settings_sheet_presets') && !can(ctx, 'settings_libraries')) {
        const items = await listLibraryItems(createSessionClient(), kind);
        return Response.json({ items }, { status: 200, headers });
      }
    }
    const p = await requireApiPermission(permissionsFor(kind));
    if (p instanceof Response) return p;
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
    let raw: unknown;
    let badJson = false;
    try {
      raw = await request.json();
    } catch {
      badJson = true;
    }
    const rawKind =
      raw !== null && typeof raw === 'object' ? (raw as { kind?: unknown }).kind : undefined;
    const p = await requireApiPermission(permissionsFor(rawKind));
    if (p instanceof Response) return p;
    if (badJson) return fail(400, 'invalid_input');
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
      if (isTemplateTaken(error)) return fail(400, 'task_template_exists');
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
