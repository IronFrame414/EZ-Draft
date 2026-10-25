// EZD-009 Step 6 (vault/plans/EZD-009.md): enqueue the test job for the /dev/jobs test page. Not found in
// production (EZD-010 Step 5 rule). A scope refusal from the database (42501) answers 404 like the read
// route, so it does not reveal whether the project exists. Bad input (not JSON, schema failure,
// invalid_payload) is 400 invalid_input, with no row. EZD-145 (vault/plans/EZD-145.md; Q-0279 (b)): the
// caller needs Edit model on the project. Order: production 404, then 401, then 403 (no Edit model, before
// the body is read), then 400, then 404 project_not_found (a listed member's unlisted project), then enqueue.
import { z } from 'zod';
import type { PermissionKey } from '../../../../lib/permissions/catalog';
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { enqueueJob, JobError } from '../../../../server/jobs';
import { testJobHandler } from '../../../../server/jobs/handlers/test-job';
import {
  requireApiPermission,
  requirePermission,
  type Permitted,
} from '../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

const DEV_JOB_PERMISSION: PermissionKey = 'edit_model';

// The project id plus the test handler's own payload schema (Step 5).
const bodySchema = z.object({ projectId: z.uuid() }).and(testJobHandler.payload);

const invalidInput = () =>
  Response.json(
    { error: { code: 'invalid_input', message_key: 'error.invalid_input' } },
    { status: 400, headers },
  );

// A failed session read or database error (Q-0168 (b); architecture Errors and logging).
const dbUnavailable = () =>
  Response.json(
    { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
    { status: 500, headers },
  );

const notFound = () =>
  Response.json(
    { error: { code: 'job_not_found', message_key: 'error.job_not_found' } },
    { status: 404, headers },
  );

export async function POST(request: Request): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  let p: Permitted | Response;
  try {
    p = await requireApiPermission(DEV_JOB_PERMISSION);
  } catch {
    return dbUnavailable();
  }
  if (p instanceof Response) return p;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalidInput();
  const { projectId, ...payload } = body.data;
  const denied = requirePermission(p.ctx, DEV_JOB_PERMISSION, { projectId });
  if (denied) return denied;
  try {
    const job = await enqueueJob(createSessionClient(), { kind: 'test', projectId, payload });
    return Response.json({ job: { id: job.id, status: 'queued' } }, { status: 201, headers });
  } catch (e) {
    if (e instanceof JobError && e.code === 'invalid_payload') return invalidInput();
    if ((e as { code?: unknown }).code === '42501') return notFound();
    return dbUnavailable();
  }
}
