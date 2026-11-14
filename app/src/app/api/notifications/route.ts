// EZD-110a Step 13 (vault/plans/EZD-110a.md Decided D8, D9; Q-0425): one page of the caller's notifications,
// newest first, with the unread count. Order: 401, 403 (no View projects; the bell is part of the Projects
// page), 400 for a malformed cursor, then the session client (RLS: the caller's own rows in scope).
import { z } from 'zod';
import type { NotificationCursor } from '../../../lib/notifications/kinds';
import { createSessionClient } from '../../../server/auth/supabase-server';
import { reportRouteFailure } from '../../../server/errors/route-failure';
import { listNotifications } from '../../../server/notifications/notifications';
import { requireApiPermission } from '../../../server/permissions';
import { endedSessionResponse } from '../../../server/auth/ended-session';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/notifications';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const beforeSchema = z.iso.datetime({ offset: true });
const beforeIdSchema = z.uuid();

// Both absent: the first page. Both present and well formed: the page after that item. Else null.
function parseCursor(params: URLSearchParams): { cursor: NotificationCursor | null } | null {
  const before = params.get('before');
  const beforeId = params.get('beforeId');
  if (before === null && beforeId === null) return { cursor: null };
  if (!beforeSchema.safeParse(before).success || !beforeIdSchema.safeParse(beforeId).success)
    return null;
  return { cursor: { createdAt: before as string, id: beforeId as string } };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const parsed = parseCursor(new URL(request.url).searchParams);
    if (parsed === null) return fail(400, 'invalid_input');
    const page = await listNotifications(createSessionClient(), parsed.cursor);
    return Response.json(page, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
