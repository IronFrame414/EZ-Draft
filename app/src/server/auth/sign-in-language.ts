// EZD-007d Step 4 (vault/plans/EZD-007d.md; Q-0047 (a); Q-0029 (a)): the language of the signed-out
// sign-in pages only. Signed-in surfaces use app_user.language (docs/architecture.md Messages and language).
import { cookies } from 'next/headers';
import type { Language } from '../../lib/messages';

export async function getSignInLanguage(): Promise<Language> {
  return (await cookies()).get('ezd_sign_in_lang')?.value === 'es' ? 'es' : 'en';
}
