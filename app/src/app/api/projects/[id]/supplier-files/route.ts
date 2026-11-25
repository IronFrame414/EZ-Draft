// EZD-914 (S12 Permissions "View: View projects. Upload: Upload references"; Upload; Q-0323; EZD-322): the Supplier files
// panel's list (GET) and the start of one supplier file's upload (POST). The row comes first, then the browser sends
// the bytes straight to Storage with the signed upload (EZD-132) and finishes at /api/supplier-files/[id]/complete.
// Supplier files are cost files: both need the caller's See company costs (the helpers check it, 403).
// Order: 401, 403 without the route's switch, 404 for a malformed project id, 403 when the project is outside the
// caller's scope, 400 for an unreadable body, then the helper (403 without See company costs, 400 for its input codes);
// any other failure is 500 after reportRouteFailure.
import { z } from 'zod';
import { SUPPLIER_UPLOAD_KINDS } from '../../../../../lib/imports/supplier-upload';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { StorageError } from '../../../../../server/storage';
import { listSupplierFiles, startSourceFileUpload } from '../../../../../server/storage/source-files';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/supplier-files';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({
  kind: z.enum(SUPPLIER_UPLOAD_KINDS),
  originalName: z.string(),
  contentType: z.string(),
  size: z.number(),
  supplierName: z.string().trim().min(1),
  supplierContactEmail: z.string().trim().nullable().optional(),
});

const INPUT_CODES = new Set(['invalid_input', 'project_not_found', 'upload_refused']);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    try {
      const files = await listSupplierFiles(createSessionClient(), p.session.appUserId, id);
      return Response.json({ files }, { status: 200, headers });
    } catch (e) {
      if (e instanceof StorageError && e.code === 'permission_denied') {
        return fail(403, 'permission_denied', 'error.not_authorized');
      }
      throw e;
    }
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('upload_references');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'upload_references', { projectId: id });
    if (denied) return denied;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return fail(400, 'invalid_input');
    const email = body.data.supplierContactEmail;
    try {
      const { sourceFile, upload } = await startSourceFileUpload(createSessionClient(), {
        kind: body.data.kind,
        originalName: body.data.originalName,
        contentType: body.data.contentType,
        size: body.data.size,
        supplierName: body.data.supplierName,
        supplierContactEmail: email === undefined || email === null || email === '' ? null : email,
        projectId: id,
        uploadedBy: p.session.appUserId,
      });
      return Response.json({ sourceFile, upload }, { status: 201, headers });
    } catch (e) {
      if (e instanceof StorageError && e.code === 'permission_denied') {
        return fail(403, 'permission_denied', 'error.not_authorized');
      }
      if (e instanceof StorageError && INPUT_CODES.has(e.code)) {
        return fail(400, e.code, 'error.invalid_input');
      }
      throw e;
    }
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
