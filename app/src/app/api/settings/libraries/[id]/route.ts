// EZD-131 (S15h Controls, Decisions 1, Events emitted): change or delete one library item. Abbreviations take a
// new name and meaning; saved groups are renamed (their group data is kept). Order: 401, 403 (no Libraries
// switch), 404 for a malformed id, 400 (body), 404 when no visible row (another company's item included),
// 400 `library_item_read_only` for a kind this page does not edit, then the write. Nothing changed is 200
// with no write and no event. Each write emits its library.item_* event after it commits.
import { z } from 'zod';
import { EDITABLE_KINDS, type LibraryItem } from '../../../../../lib/libraries/libraries';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { currentTenantId } from '../../../../../server/company/company';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import {
  LIBRARY_COLUMNS,
  dataFor,
  isAbbreviationTaken,
  parseLibraryPatch,
  toLibraryItem,
} from '../../../../../server/libraries/libraries';
import { requireApiPermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/settings/libraries/[id]';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Client = ReturnType<typeof createSessionClient>;

async function readItem(client: Client, id: string): Promise<LibraryItem | null> {
  const { data, error } = await client
    .from('library_item')
    .select(LIBRARY_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toLibraryItem(data) : null;
}

async function reportEmitFailure(code: string, e: unknown) {
  await reportError(new Error(code), {
    source: 'function',
    location: ROUTE,
    tags: { 'ezd.cause': errorType(e) },
  });
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_libraries');
    if (p instanceof Response) return p;
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return fail(404, 'library_item_not_found');

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }

    const client = createSessionClient();
    const before = await readItem(client, id);
    if (before === null) return fail(404, 'library_item_not_found');
    if (!EDITABLE_KINDS.includes(before.kind)) return fail(400, 'library_item_read_only');
    const parsed = parseLibraryPatch(raw, before.kind);
    if (!parsed.ok) return fail(400, parsed.code);

    const fields: ('name' | 'data')[] = [];
    if (parsed.value.name !== before.name) fields.push('name');
    if (before.kind === 'abbreviation' && parsed.value.meaning !== before.meaning)
      fields.push('data');
    if (fields.length === 0) return Response.json({ item: before }, { status: 200, headers });

    const update =
      before.kind === 'abbreviation'
        ? { name: parsed.value.name, data: dataFor(parsed.value) }
        : { name: parsed.value.name };
    const { data, error } = await client
      .from('library_item')
      .update(update)
      .eq('id', id)
      .select(LIBRARY_COLUMNS)
      .single();
    if (error) {
      if (isAbbreviationTaken(error)) return fail(400, 'library_abbreviation_taken');
      throw error;
    }

    try {
      const tenantId = await currentTenantId(client);
      if (tenantId === null) throw new Error('library_tenant_missing');
      await emit(
        'library.item_updated',
        { itemId: id, kind: before.kind, fields },
        { tenantId, actorId: p.session.appUserId },
      );
    } catch (e) {
      // The update is committed; a failed emit does not fail the save.
      await reportEmitFailure('library_item_updated_event_failed', e);
    }

    return Response.json({ item: toLibraryItem(data) }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_libraries');
    if (p instanceof Response) return p;
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return fail(404, 'library_item_not_found');

    const client = createSessionClient();
    const before = await readItem(client, id);
    if (before === null) return fail(404, 'library_item_not_found');
    if (!EDITABLE_KINDS.includes(before.kind)) return fail(400, 'library_item_read_only');
    // The event names the company; read it before the row is gone.
    const tenantId = await currentTenantId(client);

    const { data, error } = await client.from('library_item').delete().eq('id', id).select('id');
    if (error) throw error;
    if (data.length === 0) return fail(404, 'library_item_not_found');

    try {
      if (tenantId === null) throw new Error('library_tenant_missing');
      await emit(
        'library.item_deleted',
        { itemId: id, kind: before.kind, name: before.name },
        { tenantId, actorId: p.session.appUserId },
      );
    } catch (e) {
      // The delete is committed; a failed emit does not fail it.
      await reportEmitFailure('library_item_deleted_event_failed', e);
    }

    return Response.json({ deleted: id }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
