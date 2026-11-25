// EZD-1402 (11 Operations "browser uploads go straight to Storage with resumable signed uploads"): signs the upload
// of a queued field action's photo. POST { id, kind, photo } → 200 { upload } (null when the photo is already
// stored). Order: server/outbox/field-action-route.ts.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import {
  fieldFail,
  fieldHeaders,
  fieldRefused,
  fieldRouteFailed,
  readFieldBody,
} from '../../../../../../server/outbox/field-action-route';
import { photoBodySchema, startFieldPhoto } from '../../../../../../server/outbox/field-actions';
import type { DbClient } from '../../../../../../server/storage/objects';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';
import { FIELD_ACTION_PERMISSION } from '../../../../../../lib/outbox/field-action';

export const dynamic = 'force-dynamic';

const ROUTE = '/api/projects/[id]/field-actions/photo';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const read = await readFieldBody(request, photoBodySchema);
    if (read instanceof Response) return read;
    const { body } = read;
    const key = FIELD_ACTION_PERMISSION[body.kind];
    const p = await requireApiPermission(key);
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fieldFail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, key, { projectId: id });
    if (denied) return denied;

    const r = await startFieldPhoto(createSessionClient() as unknown as DbClient, id, body);
    if (!r.ok) return fieldRefused(r.code);
    return Response.json({ upload: r.upload }, { status: 200, headers: fieldHeaders });
  } catch (e) {
    return fieldRouteFailed(e, ROUTE);
  }
}
