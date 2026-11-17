// EZD-125 (ARCH Errors and logging; the EZD-120a Route order): the shared answers of the lock routes under
// /api/projects/[id]/lock. Each route runs, in order: 401, 403 (the route's switch), 404 (a malformed id or a
// project out of scope), then its function under the member's session. A thrown error is reported and answers
// 500 db_unavailable. Every answer is `Cache-Control: no-store`; a failure is `{ error: { code, message_key } }`.
import { z } from 'zod';
import { endedSessionResponse } from '../auth/ended-session';
import { reportRouteFailure } from '../errors/route-failure';

export const LOCK_HEADERS = { 'Cache-Control': 'no-store' };

export const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers: LOCK_HEADERS });

export const ok = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: LOCK_HEADERS });

export const isProjectId = (id: string) => z.uuid().safeParse(id).success;

// The answer for a refusal from the database function.
export function refusedResponse(
  code: 'permission_denied' | 'project_not_found' | 'invalid_input',
): Response {
  if (code === 'permission_denied') return fail(403, 'permission_denied', 'error.not_authorized');
  if (code === 'invalid_input') return fail(400, 'invalid_input');
  return fail(404, 'project_not_found');
}

export async function failedResponse(e: unknown, route: string): Promise<Response> {
  const ended = await endedSessionResponse(e);
  if (ended) return ended;
  await reportRouteFailure(e, route);
  return fail(500, 'db_unavailable');
}

// A JSON body checked by the schema; null for bad JSON or a body the schema refuses. An empty body is {}.
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T | null> {
  let raw: unknown = {};
  const text = await request.text();
  if (text.trim() !== '') {
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
