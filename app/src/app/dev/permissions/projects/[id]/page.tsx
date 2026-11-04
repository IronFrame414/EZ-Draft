// EZD-102 Step 17 (vault/plans/EZD-102.md; AC-EZD-102-3, AC-EZD-102-5): one project, opened only with View
// projects for that project (a scoped member passes only for listed projects, Q-0202). Anything else shows
// NoAccess in place with HTTP 200 and no redirect (Q-0214; Q-0232), and does not reveal whether the project
// exists. Not found in production. Pattern: ../../page.tsx.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { z } from 'zod';
// From its own file, not the states barrel: that barrel also exports hooks with no 'use client' directive
// (use-async.ts), which a Server Component page cannot import.
import { NoAccess } from '../../../../../components/states/NoAccess';
import { MessagesProvider } from '../../../../../lib/messages';
import { PermissionsProvider } from '../../../../../lib/permissions/PermissionsProvider';
import { requireSession } from '../../../../../server/auth/session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { catalogFor } from '../../../../../server/messages/catalog';
import { can, getPermissionContext, permissionList } from '../../../../../server/permissions';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  await connection();
  await requireSession();
  const { id } = await params;
  const ctx = await getPermissionContext();
  let project: { id: string; name: string } | null = null;
  if (z.uuid().safeParse(id).success && can(ctx, 'view_projects', { projectId: id })) {
    const { data, error } = await createSessionClient()
      .from('project')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    project = data;
  }
  return (
    <main>
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <PermissionsProvider initial={permissionList(ctx)}>
          {project === null ? (
            <NoAccess />
          ) : (
            <h1 data-testid="perm-project" data-project-id={project.id}>
              {project.name}
            </h1>
          )}
        </PermissionsProvider>
      </MessagesProvider>
    </main>
  );
}
