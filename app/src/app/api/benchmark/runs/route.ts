// EZD-237 (vault/plans/EZD-237.md section 3 C4, Decided D-Route, D-Who; Q-0664; AC-EZD-237-1, -2): the company's
// benchmark runs. GET: 401, 403 without System status, 400 for a bad page, then one page newest first (50 per
// page). POST: 401, 403 without System status, 403 without Edit model, 400 for a body that is not a benchmark
// run, then 201 { run: { id } }. Every response is no-store.
import { createSessionClient } from '../../../../server/auth/supabase-server';
import { endedSessionResponse } from '../../../../server/auth/ended-session';
import { listBenchmarkRuns, recordBenchmarkRun } from '../../../../server/benchmark/benchmark-runs';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { requireApiPermission, requirePermission } from '../../../../server/permissions';
import { parseBenchmarkRunInput, parseRunsPage } from '../../../../lib/benchmark/benchmark-run';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/benchmark/runs';

const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

const noStore = (r: Response) => {
  r.headers.set('Cache-Control', 'no-store');
  return r;
};

export async function GET(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_system_status');
    if (p instanceof Response) return noStore(p);
    const page = parseRunsPage(new URL(request.url).searchParams);
    if (page === null) return fail(400, 'invalid_input');
    const result = await listBenchmarkRuns(createSessionClient(), page);
    if (!result.ok) return fail(403, 'permission_denied', 'error.not_authorized');
    return Response.json(result.page, { status: 200, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const p = await requireApiPermission('settings_system_status');
    if (p instanceof Response) return noStore(p);
    const denied = requirePermission(p.ctx, 'edit_model');
    if (denied !== null) return noStore(denied);
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return fail(400, 'invalid_input');
    }
    const input = parseBenchmarkRunInput(raw);
    if (!input.ok) return fail(400, 'invalid_input');
    const result = await recordBenchmarkRun(createSessionClient(), input.value);
    if (!result.ok) {
      return result.code === 'permission_denied'
        ? fail(403, 'permission_denied', 'error.not_authorized')
        : fail(400, 'invalid_input');
    }
    return Response.json({ run: { id: result.id } }, { status: 201, headers });
  } catch (e) {
    const ended = await endedSessionResponse(e);
    if (ended) return ended;
    await reportRouteFailure(e, ROUTE);
    return fail(500, 'db_unavailable');
  }
}
