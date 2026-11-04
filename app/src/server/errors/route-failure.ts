// EZD-169 (vault/plans/EZD-169.md; Q-0268): a route catch that answers 500 reports the failure. It reports
// a code only (`db_unavailable`, the code the response carries) with the route pattern as location and the
// caught error's name as a tag, never its message, stack or fields. It never throws.
import { errorType } from './fingerprint';
import { reportError } from './report';

export async function reportRouteFailure(error: unknown, route: string): Promise<void> {
  try {
    await reportError(new Error('db_unavailable'), {
      source: 'function',
      location: route,
      tags: { 'ezd.cause': errorType(error) },
    });
  } catch {
    /* reportError never throws; guarded all the same */
  }
}
