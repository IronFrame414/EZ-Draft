// EZD-108 Step 5 (vault/plans/EZD-108.md Decided "Routes", "Password email"; S15 Avatar; Q-0392; Q-0412;
// Q-0096 P5): server-only helpers for the signed-in user's own profile. Reads and the write go through the
// caller's session client (RLS: the caller's own app_user row; update_my_profile and
// current_user_has_password touch only the caller's rows). The password email is English (Q-0121 (a)),
// sent by the system (no `company`), and a failed send does not fail the caller.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ipadDrawingOf,
  type IpadDrawing,
  type Language,
  type Profile,
} from '../../lib/profile/profile';
import type { Session } from '../auth/session';
import type { Database } from '../db/database.types';
import { sendEmail } from '../email/send';
import { appOrigin } from '../errors/app-origin';
import { reportError } from '../errors/report';
import { getT } from '../messages/get-t';

const languageOf = (v: string): Language => (v === 'es' ? 'es' : 'en');

export async function hasPassword(client: SupabaseClient<Database>): Promise<boolean> {
  const { data, error } = await client.rpc('current_user_has_password');
  if (error) throw error;
  return data === true;
}

export async function loadProfile(
  client: SupabaseClient<Database>,
  session: Session,
): Promise<Profile> {
  const { data, error } = await client
    .from('app_user')
    .select('name, email, language, ipad_input_mode')
    .eq('id', session.appUserId)
    .single();
  if (error) throw error;
  return {
    name: data.name,
    email: data.email,
    language: languageOf(data.language),
    ipadDrawing: ipadDrawingOf(data.ipad_input_mode),
    hasPassword: await hasPassword(client),
  };
}

export async function saveProfile(
  client: SupabaseClient<Database>,
  input: { language: Language; ipadDrawing: IpadDrawing },
): Promise<{ language: Language; ipadDrawing: IpadDrawing; languageChanged: boolean }> {
  const { data, error } = await client.rpc('update_my_profile', {
    p_language: input.language,
    p_ipad_input_mode: input.ipadDrawing,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error('update_my_profile_no_row');
  return {
    language: languageOf(row.saved_language),
    ipadDrawing: ipadDrawingOf(row.saved_ipad_input_mode),
    languageChanged: row.language_changed,
  };
}

export async function sendPasswordEmail(
  kind: 'changed' | 'set',
  to: string,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  const t = getT('office', 'en');
  const subject =
    kind === 'changed'
      ? t('office.profile.email_changed_subject')
      : t('office.profile.email_set_subject');
  const body =
    kind === 'changed'
      ? t('office.profile.email_changed_body', { email: to })
      : t('office.profile.email_set_body', { email: to });
  try {
    await sendEmail(
      {
        to,
        subject,
        paragraphs: [body],
        link: { url: appOrigin(env), label: t('office.profile.email_link') },
        lang: 'en',
      },
      { env },
    );
  } catch {
    // sendEmail reports a failed send itself; a refused input is reported here, by code only.
    await reportError(new Error('profile_password_email_failed'), {
      source: 'function',
      location: '/api/profile/password',
    });
  }
}
