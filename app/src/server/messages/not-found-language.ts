// EZD-136 Step 16 (vault/plans/EZD-136.md; Q-0305 (c)): the language of the not-found page. With a session
// it is the person's app_user.language; signed out it is the device's sign-in cookie. A failed read other
// than "not signed in" is reported and falls back to the cookie, so the page still renders (404, never 500).
import type { Language } from '../../lib/messages/types';
import { getSignInLanguage } from '../auth/sign-in-language';
import { reportError } from '../errors/report';
import { getRequestLanguage, NotSignedInError } from './request-language';

export async function getNotFoundLanguage(): Promise<Language> {
  try {
    return await getRequestLanguage('field');
  } catch (error) {
    if (!(error instanceof NotSignedInError)) {
      await reportError(error, { source: 'function', location: 'not_found.language' });
    }
    return getSignInLanguage();
  }
}
