// EZD-301 (S01 Continue to review; Events emitted import.started): start an import from uploaded originals of the
// project. Emits import.started { projectId, sourceFileIds } and answers 202; detection is EZD-302's job and
// Import review is EZD-307's (vault/build/assumptions.md EZD-301). Order: 401, 403 without Edit model, 404 for a
// malformed project id, 403 outside the caller's scope, 400 for an unreadable body, 404 for a project RLS hides,
// 400 for a file that is not this project's or not uploaded; any other failure is 500 after reportRouteFailure.
// EZD-302: when Polycam floor plan DXFs are among the files, an import job is queued for them after
// import.started (phase-03 EZD-302 "runs as a background job").
// EZD-307: the job payload also names the Polycam meshes (meshFileIds, only when there are any) so Import review can
// offer Show 3D mesh, and the answer carries jobId (null when nothing was queued) so Continue to review opens
// /projects/[id]/import/[jobId] (S02 Entry points).
// EZD-306 (S01 DXF: conversion choice): dxfLayers carries the layers chosen for conversion of each DXF drawing (kind
// dxf), with the role of each. A drawing it names is converted from those layers only; a drawing it leaves out is
// kept as reference only. An entry for a file that is not one of this import's dxf drawings is 400.
// EZD-901a (phase-09 EZD-901a "runs once per upload in a background job"; S01 "Original kept at full fidelity as
// reference_drawing"): every DXF drawing (kind dxf) of the import, converted or reference only, also queues one
// reference_convert job that turns it into the S11 reference. jobId stays the import job's (null when only references
// were queued), since Continue to review opens Import review for that job.
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { checkImportFiles } from '../../../../../server/imports/start-import';
import { enqueueJob } from '../../../../../server/jobs/enqueue';
import { MAX_PAYLOAD_BYTES } from '../../../../../server/jobs/payload-limit';
// One import takes at most this many files (the wizard's list; no spec limit, see assumptions).
import {
  IMPORT_MAX_FILES,
  importDxfFileSchema,
  type ImportPayload,
} from '../../../../../server/jobs/handlers/import';
import { requireApiPermission, requirePermission } from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/imports';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({
  sourceFileIds: z
    .array(z.uuid())
    .min(1)
    .max(IMPORT_MAX_FILES)
    .refine((ids) => new Set(ids.map((i) => i.toLowerCase())).size === ids.length),
  dxfLayers: z
    .array(importDxfFileSchema)
    .max(IMPORT_MAX_FILES)
    .refine(
      (d) => new Set(d.map((f) => f.sourceFileId.toLowerCase())).size === d.length,
    )
    .optional(),
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
    const dxfLayers = body.data.dxfLayers ?? [];
    const checked = await checkImportFiles(createSessionClient(), id, sourceFileIds);
    if (!checked.ok) {
      return checked.code === 'project_not_found'
        ? fail(404, 'project_not_found')
        : fail(400, checked.code, 'error.invalid_input');
    }
    const dxfIds = new Set((checked.dxfIds ?? []).map((i) => i.toLowerCase()));
    if (dxfLayers.some((d) => !dxfIds.has(d.sourceFileId.toLowerCase()))) {
      return fail(400, 'invalid_input');
    }
    // EZD-305: a PDF drawing is detected too (S01 PDF: detect type).
    const detectIds = [
      ...(checked.scanIds ?? []),
      ...dxfLayers.map((d) => d.sourceFileId),
      ...(checked.pdfIds ?? []),
    ];
    const meshIds = checked.meshIds ?? [];
    const payload: ImportPayload = { sourceFileIds: detectIds };
    if (meshIds.length > 0) payload.meshFileIds = meshIds;
    if (dxfLayers.length > 0) payload.dxfFiles = dxfLayers;
    // A layer choice too large for one job is refused before anything starts (enqueueJob's payload limit).
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
      return fail(400, 'too_many_layers', 'error.invalid_input');
    }
    await emit(
      'import.started',
      { projectId: id, sourceFileIds },
      { tenantId: checked.tenantId, projectId: id, actorId: p.session.appUserId },
    );
    let jobId: string | null = null;
    if (detectIds.length > 0) {
      const job = await enqueueJob(createSessionClient(), { kind: 'import', projectId: id, payload });
      jobId = job.id;
    }
    for (const sourceFileId of checked.dxfIds ?? []) {
      await enqueueJob(createSessionClient(), {
        kind: 'reference_convert',
        projectId: id,
        payload: { sourceFileId },
      });
    }
    return Response.json({ projectId: id, sourceFileIds, jobId }, { status: 202, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
