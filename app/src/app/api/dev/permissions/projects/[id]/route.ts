// EZD-102 Step 18 (vault/plans/EZD-102.md; AC-EZD-102-1): rename one project, the write path the browser
// tests exercise. Rename is allowed to anyone who can edit the project (Q-0202), so the check is
// requireApiPermission('edit_model', { projectId }): 403 without the switch, 404 outside a scoped member's
// list (the answer does not reveal whether the project exists). Not found in production. Order: production
// 404, then 401, then 404 for a malformed id, then the permission check, then 400. Pattern:
// app/src/app/api/dev/jobs/route.ts.
import { z } from 'zod';
import { requireApiSession } from '../../../../../../server/auth/session';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { reportError } from '../../../../../../server/errors/report';
import { requireApiPermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

const bodySchema = z.object({ name: z.string().trim().min(1) });

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
    { error: { code: 'project_not_found', message_key: 'error.project_not_found' } },
    { status: 404, headers },
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  try {
    const s = await requireApiSession();
    if (s instanceof Response) return s;
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return notFound();
    const permitted = await requireApiPermission('edit_model', { projectId: id });
    if (permitted instanceof Response) return permitted;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalidInput();
    const { data, error } = await createSessionClient()
      .from('project')
      .update({ name: body.data.name })
      .eq('id', id)
      .select('id, name')
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound();
    return Response.json({ project: { id: data.id, name: data.name } }, { status: 200, headers });
  } catch (e) {
    await reportError(e, { source: 'function', location: 'api.dev.permissions' });
    return dbUnavailable();
  }
}
