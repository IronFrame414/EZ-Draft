// EZD-026b Step 1 (vault/plans/EZD-026b.md): the language of the current request, from the signed-in
// user's record (R26 R17). Read at most once per request; never a claim, cookie or cross-request cache.
import { cache } from 'react';
import { languageFor } from '../../lib/messages/language';
import type { Language, Surface } from '../../lib/messages/types';
import { getSession } from '../auth/session';
import { createSessionClient } from '../auth/supabase-server';

export class NotSignedInError extends Error {
  constructor() {
    super('not_signed_in');
    this.name = 'NotSignedInError';
  }
}

export const getRequestLanguage = cache(
  async (surface: Exclude<Surface, 'sign_in'>): Promise<Language> => {
    if (surface === 'office' || surface === 'client') return 'en';
    const session = await getSession();
    if (session === null) throw new NotSignedInError();
    const { data, error } = await createSessionClient()
      .from('app_user')
      .select('language')
      .eq('id', session.appUserId)
      .single();
    if (error) throw error;
    return languageFor(surface, { language: data.language as Language });
  },
);
