// EZD-717 (S13 Controls "Issue Rev n": "Runs the code check, generates the PDF, freezes the version, numbers the
// revision, updates revision blocks. Result shows the PDF link with Copy link. Disabled while a gate is open. Hidden
// without Issue permit sets (Rev 0) or Issue revisions (Rev 1+)"; W11 3-4; 09h Revision rules; AC-EZD-717-1).
// - POST (Issue permit sets or Issue revisions; the database function checks which one the next number needs, under
//   the edit_lock row lock): body { description?, electrical? }. The browser has drained its outbox first, so the saved
//   working copy is what issues. In order: the code check runs on the saved working copy when the caller may run it
//   (Run code check), with the earlier acceptances carried; the issue checklist (server/sheets/issue-checklist) is read
//   and a blocked one is 409 issue_blocked with its gates (a check not run, or older than the last save, is a gate
//   here, so a caller without Run code check cannot issue unchecked); then public.issue_permit_set freezes the checkpoint as
//   "Rev N" and writes permit_revision, electrical_calc and the plan_set.issued event_log row; then one export job
//   prints the frozen version with that revision and is recorded on the revision. 201 { revNo, permitRevisionId,
//   modelVersionId, issuedAt, jobId }; jobId is null when the job could not be queued (the issue stands, reported).
//   Project status is not changed (Q-0199, Q-0700 05). The Q-0209 tick is EZD-736's.
// - GET (View projects): 200 { revisions, nextRev, canIssue }: the issued revisions oldest first, the number the next
//   issue gives and whether the caller holds its permission. GET ?rev=N: 200 { pdf } with the issue's export job
//   state and, once done, the first file's name and a signed link; ?rev=N&download=1 redirects (302) to that link, so
//   Copy link copies a link that stays good for anyone signed in who can see the project. 404 when no such revision.
// Order: 401, 403 (the key), 404 (a malformed id or a project out of scope), 400 (body or query), then the session
// client, whose RLS and definer functions check again. Any other failure is 500 after reportRouteFailure.
import type { ModelObject } from '@ezdraft/geometry';
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import { carryAcceptances, checkProject } from '../../../../../server/code-check/check-run';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { requestIp } from '../../../../../server/events/event-log';
import { enqueueJob } from '../../../../../server/jobs/enqueue';
import { loadModel } from '../../../../../server/model/model';
import { loadIssueChecklist } from '../../../../../server/sheets/issue-checklist';
import {
  attachRevisionExport,
  issuedPdf,
  issuePermitSet,
  loadPermitRevisions,
} from '../../../../../server/sheets/issue-revision';
import { can, requireApiPermission, requirePermission } from '../../../../../server/permissions';
import { issuePermission, nextRevision } from '../../../../../lib/sheets/revisions';
import type { PermissionKey } from '../../../../../lib/permissions/catalog';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/issue';
const MAX_BODY_CHARS = 70000;
const ISSUE_KEYS = ['issue_permit_sets', 'issue_revisions'] as const satisfies readonly PermissionKey[];

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const bodySchema = z.strictObject({
  description: z.string().trim().min(1).max(500).optional(),
  electrical: z
    .strictObject({
      case: z.enum(['existing', 'proposed']),
      method: z.enum(['standard', 'optional']),
      inputs: z.record(z.string(), z.unknown()),
      results: z.record(z.string(), z.unknown()),
    })
    .optional(),
});

const revQuery = z.coerce.number().int().min(0).max(999);

type Ctx = { params: Promise<{ id: string }> };

async function failed(e: unknown): Promise<Response> {
  const ended = await endedSessionResponse(e);
  if (ended) return ended;
  await reportRouteFailure(e, ROUTE);
  return fail(500, 'db_unavailable');
}

async function quietly<T>(fn: () => Promise<T>, failure: string): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    try {
      await reportError(new Error(failure), {
        source: 'function',
        location: ROUTE,
        tags: { 'ezd.cause': errorType(e) },
      });
    } catch {
      /* reportError never throws; guarded as route-failure.ts does */
    }
    return null;
  }
}

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    const client = createSessionClient();
    const query = new URL(request.url).searchParams;
    const revText = query.get('rev');
    if (revText !== null) {
      const rev = revQuery.safeParse(revText);
      if (!rev.success) return fail(400, 'invalid_input');
      const pdf = await issuedPdf(client, id, rev.data);
      if (pdf === null) return fail(404, 'revision_not_found');
      if (query.get('download') === '1') {
        if (pdf.file === null) return fail(409, 'pdf_not_ready');
        return new Response(null, { status: 302, headers: { ...headers, Location: pdf.file.url } });
      }
      return Response.json({ pdf }, { status: 200, headers });
    }
    const project = await client.from('project').select('id').eq('id', id).maybeSingle();
    if (project.error) throw project.error;
    if (project.data === null) return fail(404, 'project_not_found');
    const revisions = await loadPermitRevisions(client, id);
    const nextRev = nextRevision(revisions);
    return Response.json(
      { revisions, nextRev, canIssue: can(p.ctx, issuePermission(nextRev), { projectId: id }) },
      { status: 200, headers },
    );
  } catch (e) {
    return failed(e);
  }
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission(ISSUE_KEYS);
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const held = ISSUE_KEYS.find((k) => p.ctx.permissions.has(k))!;
    const denied = requirePermission(p.ctx, held, { projectId: id });
    if (denied) return denied;
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return fail(400, 'invalid_input');
    let raw: unknown = {};
    if (text.trim() !== '') {
      try {
        raw = JSON.parse(text);
      } catch {
        return fail(400, 'invalid_input');
      }
    }
    const body = bodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const client = createSessionClient();
    // Issuing runs the code check (S13 Validation) on the saved working copy, when the caller may run it.
    if (can(p.ctx, 'run_code_check', { projectId: id })) {
      const loaded = await loadModel(client, id, p.ctx);
      if (loaded === null) return fail(404, 'project_not_found');
      const objects = loaded.objects.map((o) => ({ id: o.id, type: o.type, data: o.data }) as ModelObject);
      const checked = await checkProject(client, { projectId: id, model: { objects } });
      if (checked === null) return fail(404, 'project_not_found');
      await quietly(() => carryAcceptances(client, checked.runId), 'code_check_carry_failed');
    }
    const out = await loadIssueChecklist(client, id, p.ctx, p.session);
    if (out === null) return fail(404, 'project_not_found');
    // A code check not run, or run before the last save, is a checklist warning on screen; at issue it holds the set,
    // so no set issues unchecked (S13 Validation "Issuing runs the code check automatically").
    const gates = [...out.checklist.gates];
    if (out.facts.codeCheck.state !== 'run' && !gates.includes('code_check')) gates.push('code_check');
    if (gates.length > 0)
      return Response.json(
        { error: { code: 'issue_blocked', message_key: 'error.issue_blocked' }, gates },
        { status: 409, headers },
      );

    const issued = await issuePermitSet(client, {
      projectId: id,
      description: body.data.description ?? null,
      electrical: body.data.electrical ?? null,
      ip: await requestIp(),
    });
    if (!issued.ok) {
      if (issued.code === 'permission_denied') return fail(403, 'permission_denied', 'error.not_authorized');
      if (issued.code === 'project_not_found') return fail(404, 'project_not_found');
      return fail(400, 'invalid_input');
    }
    const job = await quietly(
      () =>
        enqueueJob(client, {
          kind: 'export',
          projectId: id,
          payload: { set: 'permit', revision: issued.revNo, modelVersionId: issued.modelVersionId },
        }),
      'issue_export_enqueue_failed',
    );
    if (job !== null)
      await quietly(() => attachRevisionExport(client, issued.permitRevisionId, job.id), 'issue_export_attach_failed');
    return Response.json(
      {
        revNo: issued.revNo,
        permitRevisionId: issued.permitRevisionId,
        modelVersionId: issued.modelVersionId,
        issuedAt: issued.issuedAt,
        jobId: job?.id ?? null,
      },
      { status: 201, headers },
    );
  } catch (e) {
    return failed(e);
  }
}
