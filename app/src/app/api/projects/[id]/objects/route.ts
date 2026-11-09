// EZD-120a Build step 7 (vault/plans/EZD-120a.md Decided "Route order", "Error mapping", "Event"; section 3;
// AC-EZD-120a-1 to -3, -5, -6): save a batch of changed objects to the working copy. Order: 401, 403 (no Edit
// model switch), 404 (a malformed id or a project out of scope), 400 (bad JSON or body), then `save_objects`
// under the member's session (it checks the switch and scope again). 200 `{ objects }`; 409 for a stale lock
// generation or a sequence conflict. `model.saved` is emitted only on a save; a failed emit is reported
// (EZD-283) and does not fail the save.
// EZD-205b Build step 10 (vault/plans/EZD-205b.md Decided "Emit"; S02 Events; Q-0570): after `model.saved`, one
// `room.closure_overridden` per room whose closure override is new or changed, in change order; a failed emit is
// reported and does not fail the save.
// EZD-299a Build step 9 (vault/plans/EZD-299a.md Decided D-Order, D-Resolves; Q-0626): after the body is parsed, a
// save from an older app build is 409 `app_outdated` with the server's build in `x-ezdraft-app-build`; a save
// naming `resolves` answers which recorded refused changes it removed.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { parseSaveRequest, saveObjects } from '../../../../../server/model/model';
import { APP_BUILD_HEADER, appBuild, isOlderBuild } from '../../../../../lib/app-version';
import { MEMBERSHIP_HEADER } from '../../../../../lib/outbox/outbox';
import {
  getPermissionContext,
  requireApiPermission,
  requirePermission,
} from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/objects';
const EMIT_FAILED = 'model_saved_event_failed';
const CLOSURE_EMIT_FAILED = 'room_closure_overridden_event_failed';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    // EZD-120d Decided "Membership check": a save from a device whose signed-in person is not the one that
    // queued it is refused before anything else.
    const ctx = await getPermissionContext();
    if (ctx !== null && request.headers.get(MEMBERSHIP_HEADER) !== ctx.membershipId) {
      return fail(401, 'not_signed_in');
    }
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const req = parseSaveRequest(raw);
    if (req === null) return fail(400, 'invalid_input');

    // EZD-299a Decided D-Order (Q-0626): a save from an older app build is refused before anything is written.
    if (isOlderBuild(request.headers.get(APP_BUILD_HEADER), appBuild())) {
      return Response.json(
        { error: { code: 'app_outdated', message_key: 'error.app_outdated' } },
        { status: 409, headers: { ...headers, [APP_BUILD_HEADER]: String(appBuild()) } },
      );
    }

    const result = await saveObjects(createSessionClient(), id, req, p.session.appUserId);
    if (!result.ok) {
      switch (result.code) {
        case 'permission_denied':
          return fail(403, 'permission_denied', 'error.not_authorized');
        case 'project_not_found':
          return fail(404, 'project_not_found');
        case 'invalid_input':
          return fail(400, 'invalid_input');
        case 'invalid_object':
          // EZD-202 section 3: the refused objects and why, under the invalid-input wording.
          return Response.json(
            {
              error: { code: 'invalid_object', message_key: 'error.invalid_input' },
              invalid: result.invalid,
            },
            { status: 400, headers },
          );
        case 'stale_lock_epoch':
          return fail(409, 'stale_lock_epoch', 'error.stale_lock_epoch');
        case 'save_conflict':
          return Response.json(
            {
              error: { code: 'save_conflict', message_key: 'error.save_conflict' },
              conflicts: result.conflicts,
            },
            { status: 409, headers },
          );
      }
    }

    try {
      await emit(
        'model.saved',
        { objectIds: result.objects.map((o) => o.id) },
        { tenantId: result.tenantId, projectId: id, actorId: p.session.appUserId },
      );
    } catch (e) {
      // EZD-283: the save is committed; a failed emit is reported and does not fail the save.
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

    for (const o of result.overridden) {
      try {
        await emit(
          'room.closure_overridden',
          { roomId: o.roomId, gapIn: o.gapIn, userId: p.session.appUserId },
          { tenantId: result.tenantId, projectId: id, actorId: p.session.appUserId },
        );
      } catch (e) {
        try {
          await reportError(new Error(CLOSURE_EMIT_FAILED), {
            source: 'function',
            location: ROUTE,
            tags: { 'ezd.cause': errorType(e) },
          });
        } catch {
          /* reportError never throws; guarded as route-failure.ts does */
        }
      }
    }

    // EZD-299a section 3: `resolved` only when the request named `resolves`.
    return Response.json(
      req.resolves === undefined
        ? { objects: result.objects }
        : { objects: result.objects, resolved: result.resolved ?? [] },
      { status: 200, headers },
    );
  } catch (e) {
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
