import { after } from 'next/server';
import { maySeeSchemaVersion } from '../../../server/auth/health-caller';
import { readHealth } from '../../../server/db/health';
import { reportRouteFailure } from '../../../server/errors/route-failure';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/health';

// EZD-2022 (AC-EZD-2022-3; audit 2026-11-27 X7): the schema version only for the cron secret or a session; the
// caller check never throws, so a database failure still answers 500 below. Both start together.
export async function GET(request?: Request): Promise<Response> {
  try {
    const [{ status, schema_version }, full] = await Promise.all([
      readHealth(),
      maySeeSchemaVersion(request),
    ]);
    return Response.json(full ? { status, schema_version } : { status }, { status: 200, headers });
  } catch (e) {
    // EZD-169 (Q-0317 (a), Q-0285 (a)): the report runs after the 500, so a hung database (which also holds
    // the alert store) cannot delay it. after() throws outside a request scope; the report then starts unawaited.
    const report = () => reportRouteFailure(e, ROUTE);
    try {
      after(report);
    } catch {
      void report();
    }
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}
