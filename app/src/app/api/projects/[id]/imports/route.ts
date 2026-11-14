// EZD-301 (S01 Continue to review; Events emitted import.started): start an import from uploaded originals of the
// project. Emits import.started { projectId, sourceFileIds } and answers 202; detection is EZD-302's job and
// Import review is EZD-307's (vault/build/assumptions.md EZD-301). Order: 401, 403 without Edit model, 404 for a
// malformed project id, 403 outside the caller's scope, 400 for an unreadable body, 404 for a project RLS hides,
// 400 for a file that is not this project's or not uploaded; any other failure is 500 after reportRouteFailure.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { checkImportFiles } from '../../../../../server/imports/start-import';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/imports';

// One import takes at most this many files (the wizard's list; no spec limit, see assumptions).
export const IMPORT_MAX_FILES = 20;

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({
  sourceFileIds: z
    .array(z.uuid())
    .min(1)
    .max(IMPORT_MAX_FILES)
    .refine((ids) => new Set(ids.map((i) => i.toLowerCase())).size === ids.length),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, 'invalid_input');
    const { sourceFileIds } = body.data;
    const checked = await checkImportFiles(createSessionClient(), id, sourceFileIds);
    if (!checked.ok) {
      return checked.code === 'project_not_found'
        ? fail(404, 'project_not_found')
        : fail(400, checked.code, 'error.invalid_input');
    }
    await emit(
      'import.started',
      { projectId: id, sourceFileIds },
      { tenantId: checked.tenantId, projectId: id, actorId: p.session.appUserId },
    );
    return Response.json({ projectId: id, sourceFileIds }, { status: 202, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
