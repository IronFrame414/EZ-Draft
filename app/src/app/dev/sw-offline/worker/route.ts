// EZD-164 Step 3 (vault/plans/EZD-164.md D-Route): serves the throwaway worker script. Not found in production.
import { SW_OFFLINE_WORKER_SOURCE } from '../worker-source';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  if (process.env.VERCEL_ENV === 'production') return new Response(null, { status: 404 });
  return new Response(SW_OFFLINE_WORKER_SOURCE, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
