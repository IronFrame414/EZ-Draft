// EZD-009 Step 6 (vault/plans/EZD-009.md): the once-a-minute sweep, called by the Vercel Cron entry in
// app/vercel.json with `Authorization: Bearer <CRON_SECRET>`. It is a job runner, not a user request path,
// so the runner's secret key is allowed here. maxDuration is the function time limit (Q-0027 (a)), written
// as a literal; config.test.ts (T9) keeps it equal to JOB_FUNCTION_MAX_SECONDS.
import { timingSafeEqual } from 'node:crypto';
import { reportError } from '../../../../server/errors/report';
import { rewrapStaleAiKeys } from '../../../../server/jobs/ai-key-rewrap';
import { defaultJobHooks } from '../../../../server/jobs/default-hooks';
import { runJobs } from '../../../../server/jobs/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const headers = { 'Cache-Control': 'no-store' };

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '', 'utf8');
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return Response.json(
      { error: { code: 'not_authorized', message_key: 'error.not_authorized' } },
      { status: 401, headers },
    );
  }
  const summary = await runJobs({ ...defaultJobHooks() });
  // EZD-5601 Step 17 ("D-Rewrap"; Q-0638 rotation): one pass of the AI key rewrap per sweep; a failure is
  // reported by code and does not change the answer.
  try {
    await rewrapStaleAiKeys();
  } catch {
    await reportError(new Error('ai_key_rewrap_failed'), {
      source: 'job',
      location: '/api/jobs/sweep',
    });
  }
  return Response.json({ ran: summary.claimed }, { status: 200, headers });
}
