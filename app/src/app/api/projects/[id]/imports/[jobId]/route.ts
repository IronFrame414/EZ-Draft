// EZD-307 (S02 Layout, Data shown; Permissions "View projects: view the review in read-only"): one import for Import
// review, read through the caller's session client so RLS decides what is visible (server/imports/review.ts).
// Order, as GET /api/jobs/[id]: 401, 403 without View projects, 404 for a malformed id, 403 for a project outside
// a listed member's projects, 404 for an import RLS hides or that is not this project's, then 200. Any other
// failure is 500 after reportRouteFailure.
// EZD-314: the 200 also carries canEdit (Edit model on this project) and viewerId (the caller's app user id).
// EZD-309 PATCH (S02 Permissions "Edit model: required for every accept, fix, delete"; phase-03 EZD-309 "each review
// action is saved as a per-item change, batched every 2 seconds"): one batch of review changes. Order: 401, 403
// without Edit model, 404 for a malformed id, 403 for a project outside the member's list, 400 for a body outside
// the rules, then save_import_review: 403 refused, 404 not this project's import, 400 an unknown item, 409
// lock_held when another user holds the edit lock, 409 import_closed after Finish or Cancel, else 200.
import { z } from 'zod';
import { createSessionClient } from '../../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../../server/auth/ended-session';
import { reportRouteFailure } from '../../../../../../server/errors/route-failure';
import {
  readImportReview,
  ReviewSaveError,
  saveImportReview,
} from '../../../../../../server/imports/review';
import { REVIEW_MODES } from '../../../../../../lib/imports/review';
import {
  MAX_CEILING_IN,
  MAX_PITCH,
  SLOPE_INPUTS,
} from '../../../../../../lib/imports/ceiling-slope';
import { requireApiPermission, requirePermission } from '../../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/imports/[jobId]';

const notFound = () =>
  Response.json(
    { error: { code: 'import_not_found', message_key: 'error.import_not_found' } },
    { status: 404, headers },
  );

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    const { id, jobId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(jobId).success) return notFound();
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const review = await readImportReview(createSessionClient(), id, jobId);
    if (!review) return notFound();
    // EZD-314 (S02 States Locked / view-only, Permission-denied): whether the viewer may change the import (Edit
    // model on this project) and who the viewer is, so the page can tell a lock another user holds.
    const viewer = {
      canEdit: requirePermission(p.ctx, 'edit_model', { projectId: id }) === null,
      viewerId: p.session.appUserId,
    };
    return Response.json({ review: { ...review, ...viewer } }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}

const pt = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
const fixSchema = z.union([
  // EZD-310: `typed` is the typed or laser value that set the fix.
  z
    .object({
      geometry: z.object({ start: pt, end: pt }).strict(),
      typed: z.number().finite().positive().max(2400).optional(),
    })
    .strict(),
  z
    .object({
      center: pt,
      width: z.number().finite().positive(),
      typed: z.number().finite().positive().max(2400).optional(),
    })
    .strict(),
  // EZD-311: `keep` is Keep the room out of square, with the gap it accepted.
  z
    .object({
      boundary: z.array(pt).min(1).max(200),
      keep: z.object({ gap: pt }).strict().optional(),
    })
    .strict(),
  // EZD-312: a ceiling slope fixed by heights at points, pitch, or the mesh (lib/imports/ceiling-slope.ts).
  z
    .object({
      input: z.enum(SLOPE_INPUTS),
      lowHeight: z.number().finite().positive().max(MAX_CEILING_IN),
      highHeight: z.number().finite().positive().max(MAX_CEILING_IN),
      pitchPer12: z.number().finite().min(0).max(MAX_PITCH),
    })
    .strict(),
]);
const bodySchema = z
  .object({
    mode: z
      .enum(REVIEW_MODES as [string, ...string[]])
      .nullable()
      .default(null),
    changes: z
      .array(
        z
          .object({
            item_id: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/),
            decision: z.enum(['accepted', 'rejected']).nullable(),
            fix: fixSchema.nullable(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()
  .refine((b) => b.mode !== null || b.changes.length > 0)
  .refine((b) => new Set(b.changes.map((c) => c.item_id)).size === b.changes.length);

const fail = (status: number, code: string, key: string) =>
  Response.json({ error: { code, message_key: key } }, { status, headers });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
): Promise<Response> {
  try {
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    const { id, jobId } = await params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(jobId).success) return notFound();
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input', 'error.invalid_input');
    }
    const body = bodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input', 'error.invalid_input');
    let status;
    try {
      status = await saveImportReview(createSessionClient(), id, jobId, {
        mode: body.data.mode as (typeof REVIEW_MODES)[number] | null,
        changes: body.data.changes,
      });
    } catch (e) {
      if (!(e instanceof ReviewSaveError)) throw e;
      if (e.code === 'not_found') return notFound();
      if (e.code === 'invalid_input') return fail(400, 'invalid_input', 'error.invalid_input');
      return fail(403, 'permission_denied', 'error.not_authorized');
    }
    if (status === 'locked') return fail(409, 'lock_held', 'error.lock_held');
    if (status === 'closed') return fail(409, 'import_closed', 'error.import_closed');
    return Response.json({ status }, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}
