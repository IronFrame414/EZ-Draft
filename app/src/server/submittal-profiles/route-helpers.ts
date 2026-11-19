// EZD-712 (S15c Events emitted): the shared parts of the /api/settings/sheet-presets routes. A failed emit is
// reported and never fails the write (the code-edition route pattern).
import type { EventName, EventPayloads } from '../../lib/events/registry';
import { errorType } from '../errors/fingerprint';
import { reportError } from '../errors/report';
import { emit } from '../events';
import type { ProfileFailure } from './submittal-profiles';

export const headers = { 'Cache-Control': 'no-store' };

export const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers });

// The HTTP answer of a refused write.
export function failureResponse(code: ProfileFailure): Response {
  switch (code) {
    case 'permission_denied':
      return fail(403, 'permission_denied', 'error.not_authorized');
    case 'name_taken':
      return fail(409, 'name_taken', 'office.sheet_presets.name_taken');
    case 'not_found':
      return fail(404, 'not_found');
    case 'is_default':
      return fail(409, 'profile_is_default', 'office.sheet_presets.default_locked');
    default:
      return fail(400, 'invalid_input');
  }
}

export async function emitProfileEvent<K extends Extract<EventName, `submittal_profile.${string}`>>(
  name: K,
  payload: EventPayloads[K],
  ctx: { tenantId: string; actorId: string },
  location: string,
): Promise<void> {
  try {
    await emit(name, payload as never, ctx);
  } catch (e) {
    try {
      await reportError(new Error('submittal_profile_event_failed'), {
        source: 'function',
        location,
        tags: { 'ezd.cause': errorType(e) },
      });
    } catch {
      /* reportError never throws; guarded as route-failure.ts does */
    }
  }
}
