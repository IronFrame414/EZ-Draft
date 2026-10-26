import { after } from 'next/server';
import { readHealth } from '../../../server/db/health';
import { reportRouteFailure } from '../../../server/errors/route-failure';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };
const ROUTE = '/api/health';

export async function GET(): Promise<Response> {
  try {
    const { status, schema_version } = await readHealth();
    return Response.json({ status, schema_version }, { status: 200, headers });
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
