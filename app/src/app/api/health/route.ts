import { readHealth } from '../../../server/db/health';

export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'no-store' };

export async function GET(): Promise<Response> {
  try {
    const { status, schema_version } = await readHealth();
    return Response.json({ status, schema_version }, { status: 200, headers });
  } catch {
    return Response.json(
      { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } },
      { status: 500, headers },
    );
  }
}
