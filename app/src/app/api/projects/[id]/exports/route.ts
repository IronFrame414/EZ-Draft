// EZD-715 (phase-07 EZD-715 "Background job: writes the PDF ..."; 08 Exports Permit set; assumptions EZD-721 "Permit
// set (PDF) ... hidden without Export"): start a PDF export of the project's permit or client set. Body
// { set: 'permit' | 'client', split?: 'set' | 'sheet' }; queues one export job (server/jobs/handlers/pdf-export.ts) and
// answers 202 { jobId }. The job's progress, files and names are read with GET /api/jobs/[id]. Order: 401, 403
// without Export, 404 for a malformed project id, 403 outside the caller's scope, 400 for an unreadable body, 404 for
// a project RLS hides; any other failure is 500 after reportRouteFailure. The Q-0209 responsibility tick before an
// export is EZD-736's; the Export menu entry is EZD-721's.
import { z } from 'zod';
import { SHEET_SET_KINDS } from '@ezdraft/geometry';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { enqueueJob } from '../../../../../server/jobs/enqueue';
import { EXPORT_SPLITS } from '../../../../../server/jobs/pdf-export/file-name';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/exports';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({
  set: z.enum(SHEET_SET_KINDS),
  split: z.enum(EXPORT_SPLITS).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('export');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'export', { projectId: id });
    if (denied) return denied;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, 'invalid_input');
    const client = createSessionClient();
    const project = await client.from('project').select('id').eq('id', id).maybeSingle();
    if (project.error) throw project.error;
    if (project.data === null) return fail(404, 'project_not_found');
    const job = await enqueueJob(client, { kind: 'export', projectId: id, payload: body.data });
    return Response.json({ jobId: job.id }, { status: 202, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
