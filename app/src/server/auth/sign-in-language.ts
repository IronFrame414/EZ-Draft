// EZD-007d Step 4 (vault/plans/EZD-007d.md; Q-0047 (a); Q-0029 (a)): the language of the signed-out
// sign-in pages only. Signed-in surfaces use app_user.language (docs/architecture.md Messages and language).
// EZD-342 (vault/plans/EZD-342.md; Q-0600): read through request-cookies.ts, so on https only the prefixed name counts.
import { SIGN_IN_LANG_COOKIE } from '../../lib/auth/cookie-names';
import type { Language } from '../../lib/messages';
import { readAppCookie } from './request-cookies';

export async function getSignInLanguage(): Promise<Language> {
  return (await readAppCookie(SIGN_IN_LANG_COOKIE)) === 'es' ? 'es' : 'en';
}
