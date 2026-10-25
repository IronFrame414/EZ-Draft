// EZD-102 Step 15 (vault/plans/EZD-102.md): the permissions test page. Not found in production. The server
// loads the member's set once (getPermissionContext) and passes it to the browser as `initial`; the
// project list is read only with View projects (RLS scopes it to listed projects for a scoped member,
// Q-0202; at most 50 rows, 11 rule 9). Office English (Q-0121 (a)). Values only, no interface text.
// Patterns: app/src/app/page.tsx, app/src/app/dev/realtime/page.tsx.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { MessagesProvider } from '../../../lib/messages';
import { PermissionsProvider } from '../../../lib/permissions/PermissionsProvider';
import { requireSession } from '../../../server/auth/session';
import { createSessionClient } from '../../../server/auth/supabase-server';
import { catalogFor } from '../../../server/messages/catalog';
import { can, getPermissionContext, permissionList } from '../../../server/permissions';
import { PermissionsProbe } from './PermissionsProbe';

export default async function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  // Render per request: without Supabase settings at build time requireSession() never reads the
  // cookies, so Next.js would otherwise prerender a permanent redirect to /sign-in.
  await connection();
  await requireSession();
  const ctx = await getPermissionContext();
  let projects: { id: string; name: string }[] | null = null;
  if (can(ctx, 'view_projects')) {
    const { data, error } = await createSessionClient()
      .from('project')
      .select('id, name')
      .order('name')
      .limit(50);
    if (error) throw error;
    projects = data;
  }
  return (
    <main>
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <PermissionsProvider initial={permissionList(ctx)}>
          <PermissionsProbe projects={projects} />
        </PermissionsProvider>
      </MessagesProvider>
    </main>
  );
}
