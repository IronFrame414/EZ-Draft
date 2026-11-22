// EZD-711 (S01 Property appraiser link "Paste link; app reads ...; On read failure, offer 'Paste page text' or 'Paste
// screenshot' for AI extraction"; S13 Controls "Property appraiser import ... Edit model"; S13 Decision 9): starts a
// read. JSON `{ projectId, url }` or `{ projectId, text }`, or a form with `projectId` and a `screenshot` file.
// `projectId` is null in the New project wizard (no project yet), which also needs Create projects; enqueue_job
// allows a job with no project only to an all-projects member (vault/build/assumptions.md EZD-711).
// Order: 401, 403 (no Edit model), 400 (an unreadable or invalid body), 403 / 404 (no Create projects in the wizard,
// project out of scope), then 202 `{ jobId }` (follow it at /api/jobs/[id]) or, for a link the server may not
// fetch, 200 `{ output: { status: 'unreadable' } }`.
import { z } from 'zod';
import {
  PASTED_TEXT_MAX_BYTES,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
  type ScreenshotType,
} from '../../../../lib/property-record/property-record';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../server/permissions';
import { APPRAISER_URL_MAX } from '../../../../server/property-record/appraiser-hosts';
import { startAppraiserRead, type ReadSource } from '../../../../server/property-record/read-job';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/property-records/read';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const jsonSchema = z.union([
  z.object({ projectId: z.uuid().nullable(), url: z.string().trim().min(1).max(APPRAISER_URL_MAX) }).strict(),
  z
    .object({
      projectId: z.uuid().nullable(),
      text: z
        .string()
        .refine((t) => t.trim() !== '')
        .refine((t) => Buffer.byteLength(t, 'utf8') <= PASTED_TEXT_MAX_BYTES),
    })
    .strict(),
]);

type Parsed = { projectId: string | null; source: ReadSource };

async function parseBody(request: Request): Promise<Parsed | null> {
  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return null;
    }
    const rawProject = form.get('projectId');
    const projectId = rawProject === null || rawProject === '' ? null : rawProject;
    if (projectId !== null && (typeof projectId !== 'string' || !z.uuid().safeParse(projectId).success)) return null;
    const file = form.get('screenshot');
    if (!(file instanceof Blob)) return null;
    if (!(SCREENSHOT_TYPES as readonly string[]).includes(file.type)) return null;
    if (file.size === 0 || file.size > SCREENSHOT_MAX_BYTES) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    return { projectId, source: { kind: 'screenshot', bytes, mediaType: file.type as ScreenshotType } };
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return null;
  }
  const body = jsonSchema.safeParse(raw);
  if (!body.success) return null;
  const d = body.data;
  return 'url' in d
    ? { projectId: d.projectId, source: { kind: 'link', url: d.url } }
    : { projectId: d.projectId, source: { kind: 'text', text: d.text } };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    const parsed = await parseBody(request);
    if (parsed === null) return fail(400, 'invalid_input');
    if (parsed.projectId === null) {
      const denied = requirePermission(p.ctx, 'create_projects');
      if (denied) return denied;
    } else {
      const denied = requirePermission(p.ctx, 'edit_model', { projectId: parsed.projectId });
      if (denied) return denied;
    }
    const started = await startAppraiserRead(createSessionClient(), parsed.projectId, parsed.source);
    if ('unreadable' in started) {
      return Response.json({ output: { status: 'unreadable' } }, { status: 200, headers });
    }
    return Response.json({ jobId: started.jobId }, { status: 202, headers });
  } catch (e) {
    if (e !== null && typeof e === 'object' && (e as { code?: unknown }).code === '42501') {
      const ended = await endedSessionResponse(e);
      return ended ?? fail(403, 'permission_denied', 'error.not_authorized');
    }
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
