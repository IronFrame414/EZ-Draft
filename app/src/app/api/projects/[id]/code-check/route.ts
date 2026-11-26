// EZD-612 (S03 Check; S06 Check, Check status pill; phase-06 EZD-612 row; AC-EZD-612-1..3): the project's code check.
// Order as the other project routes: 401, 403 (the key), 404 (a malformed id or a project out of scope), then the
// session client, whose RLS and definer functions check again.
// - GET (View projects): 200 { run, changedSinceRun, canRun, canAccept }; run is the latest stored run or null, and
//   changedSinceRun is true when an object was saved after it (S06 "Check not run since last change").
// - POST (Run code check; view only is fine, S06:100): checks the saved working copy (loadModel) with the project's
//   edition, records the run, carries the previous run's acceptances that still apply, and emits
//   code_check.completed with the counts. 200 { run, canRun, canAccept }. It never changes the model.
// - PATCH (Edit model; no lock): { runId, ruleId, objectId, note } accepts one warning with a note; 400 for a bad
//   body or a result that is not a failing warning, 409 run_not_latest, 403 refused. Emits code_warning.accepted with
//   ids only, never the note. 200 { run, canRun, canAccept }.
// A failed emit is reported and never fails the action (as the snapshot route).
import type { ModelObject } from '@ezdraft/geometry';
import { z } from 'zod';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../../server/auth/ended-session';
import {
  acceptCodeWarning,
  carryAcceptances,
  checkProject,
  latestCodeCheckRun,
  modelChangedSince,
  openWarningCount,
  type StoredCodeCheckRun,
} from '../../../../../server/code-check/check-run';
import { errorType } from '../../../../../server/errors/fingerprint';
import { reportError } from '../../../../../server/errors/report';
import { reportRouteFailure } from '../../../../../server/errors/route-failure';
import { emit } from '../../../../../server/events';
import { loadModel } from '../../../../../server/model/model';
import {
  can,
  requireApiPermission,
  requirePermission,
  type Permitted,
} from '../../../../../server/permissions';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/projects/[id]/code-check';
const MAX_BODY_CHARS = 8192;

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

type Ctx = { params: Promise<{ id: string }> };

const acceptBodySchema = z.object({
  runId: z.uuid(),
  ruleId: z.string().min(1).max(32),
  objectId: z.uuid(),
  note: z.string().max(4000),
});

async function failed(e: unknown): Promise<Response> {
  const ended = await endedSessionResponse(e);
  if (ended) return ended;
  await reportRouteFailure(e, ROUTE);
  return fail(500, 'db_unavailable');
}

async function emitQuietly(fn: () => Promise<unknown>, failure: string): Promise<void> {
  try {
    await fn();
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
  }
}

async function answer(p: Permitted, id: string, run: StoredCodeCheckRun | null): Promise<Response> {
  const changedSinceRun =
    run === null ? false : await modelChangedSince(createSessionClient(), id, run.createdAt);
  return Response.json(
    {
      run,
      changedSinceRun,
      canRun: can(p.ctx, 'run_code_check', { projectId: id }),
      canAccept: can(p.ctx, 'edit_model', { projectId: id }),
    },
    { status: 200, headers },
  );
}

async function projectTenant(id: string): Promise<string | null> {
  const { data, error } = await createSessionClient()
    .from('project')
    .select('tenant_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.tenant_id ?? null;
}

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('view_projects');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'view_projects', { projectId: id });
    if (denied) return denied;
    if ((await projectTenant(id)) === null) return fail(404, 'project_not_found');
    return await answer(p, id, await latestCodeCheckRun(createSessionClient(), id));
  } catch (e) {
    return failed(e);
  }
}

export async function POST(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('run_code_check');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'run_code_check', { projectId: id });
    if (denied) return denied;

    const client = createSessionClient();
    const loaded = await loadModel(client, id, p.ctx);
    if (loaded === null) return fail(404, 'project_not_found');
    const objects = loaded.objects.map(
      (o) => ({ id: o.id, type: o.type, data: o.data }) as ModelObject,
    );
    const checked = await checkProject(client, { projectId: id, model: { objects } });
    if (checked === null) return fail(404, 'project_not_found');
    // A failed carry is reported; the run stands and the earlier notes stay on the earlier run.
    await emitQuietly(() => carryAcceptances(client, checked.runId), 'code_check_carry_failed');
    const run = await latestCodeCheckRun(client, id);
    const results = run?.results ?? checked.results;
    await emitQuietly(
      () =>
        emit(
          'code_check.completed',
          {
            runId: checked.runId,
            edition: checked.edition,
            warningCount: openWarningCount(results, run?.accepted ?? []),
            resultCount: results.length,
          },
          { tenantId: loaded.viewer.tenantId, projectId: id, actorId: p.session.appUserId },
        ),
      'code_check_completed_event_failed',
    );
    return await answer(p, id, run);
  } catch (e) {
    return failed(e);
  }
}

export async function PATCH(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const { id } = await params;
    const p = await requireApiPermission('edit_model');
    if (p instanceof Response) return p;
    if (!z.uuid().safeParse(id).success) return fail(404, 'project_not_found');
    const denied = requirePermission(p.ctx, 'edit_model', { projectId: id });
    if (denied) return denied;
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return fail(400, 'invalid_input');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return fail(400, 'invalid_input');
    }
    const body = acceptBodySchema.safeParse(raw);
    if (!body.success) return fail(400, 'invalid_input');

    const client = createSessionClient();
    const tenantId = await projectTenant(id);
    if (tenantId === null) return fail(404, 'project_not_found');
    const latest = await latestCodeCheckRun(client, id);
    // A run of another project is refused as not this project's latest.
    if (latest === null || latest.runId !== body.data.runId) return fail(409, 'run_not_latest');
    const out = await acceptCodeWarning(client, body.data);
    if (!out.ok) {
      if (out.code === 'permission_denied')
        return fail(403, 'permission_denied', 'error.not_authorized');
      if (out.code === 'run_not_latest') return fail(409, 'run_not_latest');
      return fail(400, 'invalid_input');
    }
    await emitQuietly(
      () =>
        emit(
          'code_warning.accepted',
          { runId: body.data.runId, ruleId: body.data.ruleId, objectId: body.data.objectId },
          { tenantId, projectId: id, actorId: p.session.appUserId },
        ),
      'code_warning_accepted_event_failed',
    );
    return await answer(p, id, await latestCodeCheckRun(client, id));
  } catch (e) {
    return failed(e);
  }
}
