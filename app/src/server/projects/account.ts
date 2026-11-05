// EZD-117b Build step 8 (vault/plans/EZD-117b.md Decided "loadProjectsAccount", "Page server part"; ARCH Errors
// and logging): the signed-in user's name, email and initials for the Projects header's avatar menu, read through
// the session client (RLS). A failed read is reported and shows the email-based initials.
import type { SupabaseClient } from '@supabase/supabase-js';
import { initialsFor } from '../../lib/users/initials';
import type { Session } from '../auth/session';
import type { Database } from '../db/database.types';
import { reportError } from '../errors/report';

export type ProjectsAccountData = { name: string | null; email: string; initials: string };

export async function loadProjectsAccount(
  client: SupabaseClient<Database>,
  session: Session,
): Promise<ProjectsAccountData> {
  const { data, error } = await client
    .from('app_user')
    .select('name')
    .eq('id', session.appUserId)
    .maybeSingle();
  let name: string | null = null;
  if (error) {
    await reportError(new Error('projects_account_load_failed'), {
      source: 'function',
      location: 'projects.account',
    });
  } else {
    name = data?.name ?? null;
  }
  return { name, email: session.email, initials: initialsFor(name, session.email) };
}
