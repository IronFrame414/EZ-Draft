// EZD-306 (S01 DXF: conversion choice "After upload, DXF only"; layer checklist): the layers of one uploaded DXF
// drawing (kind dxf) of the project, for the conversion choice. The names come from a raw scan of the file, not the
// DXF parser (docs/architecture.md DXF "Where parsing runs"). Reads go through the caller's client, so RLS hides
// another company's file. Order: 401, 403 without Edit model, 404 for a malformed id, 403 outside the caller's
// scope, 404 for a file RLS hides or of another project, 400 for a file that is not a DXF drawing or not uploaded,
// 400 with the reader's code for a file it cannot read; any other failure is 500 after reportRouteFailure.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../../server/errors/route-failure';
import { listDxfLayers } from '../../../../../../../server/jobs/polycam-dxf/layer-choice';
import { DxfReadError } from '../../../../../../../server/jobs/polycam-dxf/read-dxf';
import { requireApiPermission, requirePermission } from '../../../../../../../server/permissions';
import { readObject } from '../../../../../../../server/storage';
import { readReviewSourceFiles } from '../../../../../../../server/storage/source-files';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/source-files/[fileId]/layers';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  try {
    const { id, fileId } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    if (!z.uuid().safeParse(fileId).success) return fail(404, 'source_file_not_found', 'error.invalid_input');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;
    const client = createSessionClient();
    const file = (await readReviewSourceFiles(client, id, [fileId])).get(fileId.toLowerCase());
    if (!file) return fail(404, 'source_file_not_found', 'error.invalid_input');
    if (file.kind !== 'dxf' || !file.uploaded) return fail(400, 'invalid_input');
    const bytes = await readObject(client, { bucket: 'sources', path: file.storagePath });
    if (!bytes) return fail(404, 'source_file_not_found', 'error.invalid_input');
    try {
      return Response.json({ layers: listDxfLayers(bytes) }, { status: 200, headers });
    } catch (e) {
      if (e instanceof DxfReadError) return fail(400, e.code, 'error.invalid_input');
      throw e;
    }
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
