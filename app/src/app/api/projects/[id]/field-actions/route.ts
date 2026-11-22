// EZD-1402 (03c offline_change; phase-14 EZD-1402 "offline_change.synced"): records one queued field action.
// POST { id, deviceId, kind, ops, baseVersionId, queuedAt, photo } → 200 { status: 'synced' | 'duplicate',
// syncedAt }. Order: server/outbox/field-action-route.ts. A recorded action emits offline_change.synced once (a
// duplicate resend does not); a failed emit is reported and the action stands.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { emit } from '../../../../../server/events';
import {
  fieldFail,
  fieldHeaders,
  fieldRefused,
  fieldRouteFailed,
  readFieldBody,
} from '../../../../../server/outbox/field-action-route';
import { syncBodySchema, syncFieldAction } from '../../../../../server/outbox/field-actions';
import type { DbClient } from '../../../../../server/storage/objects';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { FIELD_ACTION_PERMISSION } from '../../../../../lib/outbox/field-action';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/projects/[id]/field-actions';
const EMIT_FAILED = 'offline_change_event_failed';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const read = await readFieldBody(request, syncBodySchema);
    if (read instanceof Response) return read;
    const { body } = read;
    const key = FIELD_ACTION_PERMISSION[body.kind];
    const p = await requireApiPermission(key);
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fieldFail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, key, { projectId: id });
    if (denied) return denied;

    const r = await syncFieldAction(createSessionClient() as unknown as DbClient, id, body);
    if (!r.ok) return fieldRefused(r.code);
    if (r.status === 'synced') {
      try {
        await emit(
          'offline_change.synced',
          { id: body.id, kind: body.kind },
          { tenantId: r.tenantId, projectId: id, actorId: p.session.appUserId },
        );
      } catch (e) {
        try {
          await reportError(new Error(EMIT_FAILED), {
            source: 'function',
            location: ROUTE,
            tags: { 'ezd.cause': errorType(e) },
          });
        } catch {
          /* reportError never throws; guarded as route-failure.ts does */
        }
      }
    }
    return Response.json(
      { status: r.status, syncedAt: r.syncedAt },
      { status: 200, headers: fieldHeaders },
    );
  } catch (e) {
    return fieldRouteFailed(e, ROUTE);
  }
}
