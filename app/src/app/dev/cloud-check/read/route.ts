// EZD-171 (vault/plans/EZD-171.md D7; Q-0306 (a)): what the sign-in limit would read on this request.
import { clientIp } from '../../../../server/auth/throttle';
import { readClaims, sessionFromClaims } from '../session-read';
import type { CloudCheckRead } from '../cloud-check';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const vercelEnv = process.env.VERCEL_ENV || null;
  const production = vercelEnv === 'production';
  const claims = await readClaims();
  if (production && claims.kind !== 'signed_in') return new Response(null, { status: 404 });
  const ip = clientIp(request.headers, process.env);
  const session = await sessionFromClaims(claims);
  const body: CloudCheckRead = { vercelEnv, clientIp: ip, session };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
