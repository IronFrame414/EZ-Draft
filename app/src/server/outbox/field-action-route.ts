// EZD-1402 (03c offline_change; Q-0503; vault/build/assumptions.md EZD-1402): the parts the two field-action routes
// share. Order in each route: a send from another sign-in 401, a body that is not JSON or not an action 400, 401 and
// 403 for the kind's switch (10 Permissions), 404 (a malformed id or a project out of scope), then the definer
// function under the member's session.
import type { z } from 'zod';
import { endedSessionResponse } from '../auth/ended-session';
import { reportRouteFailure } from '../errors/route-failure';
import { getPermissionContext } from '../permissions';
import { MEMBERSHIP_HEADER } from '../../lib/outbox/outbox';
import type { FieldActionRefusal } from './field-actions';

export const fieldHeaders = { 'Cache-Control': 'no-store' };
const MAX_BODY_CHARS = 70000;

export const fieldFail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers: fieldHeaders });

export function fieldRefused(code: FieldActionRefusal): Response {
  if (code === 'permission_denied') return fieldFail(403, 'permission_denied', 'error.not_authorized');
  if (code === 'project_not_found') return fieldFail(404, 'project_not_found');
  if (code === 'photo_missing') return fieldFail(409, 'photo_missing', 'error.invalid_input');
  return fieldFail(400, 'invalid_input');
}

// The parsed body, or the 401 (another sign-in) or 400 answer.
export async function readFieldBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ body: z.infer<S> } | Response> {
  const ctx = await getPermissionContext();
  if (ctx !== null && request.headers.get(MEMBERSHIP_HEADER) !== ctx.membershipId) {
    return fieldFail(401, 'not_signed_in');
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return fieldFail(400, 'invalid_input');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fieldFail(400, 'invalid_input');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fieldFail(400, 'invalid_input');
  return { body: parsed.data };
}

export async function fieldRouteFailed(e: unknown, route: string): Promise<Response> {
  const ended = await endedSessionResponse(e);
  if (ended) return ended;
  await reportRouteFailure(e, route);
  return fieldFail(500, 'db_unavailable');
}
