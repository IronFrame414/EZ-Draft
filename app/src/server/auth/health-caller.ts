// EZD-2022 (AC-EZD-2022-3; audit 2026-11-27 X7): who may read the schema version on /api/health. The cron secret
// (`Authorization: Bearer <CRON_SECRET>`, compared in constant time as the sweep route does; the release check
// sends it) or a signed-in session. Anyone else gets only { status }. A session error counts as signed out.
import { timingSafeEqual } from 'node:crypto';
import { getSession } from './session';

export function carriesCronSecret(request: Request | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || request === undefined) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '', 'utf8');
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function maySeeSchemaVersion(request: Request | undefined): Promise<boolean> {
  if (carriesCronSecret(request)) return true;
  // Next always passes the request; a call without one (a unit test) has no request scope and no session.
  if (request === undefined) return false;
  try {
    return (await getSession()) !== null;
  } catch {
    return false;
  }
}
