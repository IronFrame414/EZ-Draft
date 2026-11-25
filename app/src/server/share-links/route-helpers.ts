// EZD-1201: the share link routes' shared answers. Every body is { error: { code, message_key } } or the
// result, never the token.
import type { ShareLinkError } from './share-links';

export const SHARE_LINK_HEADERS = { 'Cache-Control': 'no-store' };

export const fail = (status: number, code: string, messageKey = `error.${code}`) =>
  Response.json({ error: { code, message_key: messageKey } }, { status, headers: SHARE_LINK_HEADERS });

export function shareLinkFailure(code: ShareLinkError): Response {
  if (code === 'permission_denied') return fail(403, 'permission_denied', 'error.not_authorized');
  if (code === 'revoked') return fail(409, 'share_link_revoked', 'error.share_link_revoked');
  if (code === 'invalid_input') return fail(400, 'invalid_input', 'error.invalid_input');
  return fail(404, 'share_link_not_found', 'error.share_link_not_found');
}
