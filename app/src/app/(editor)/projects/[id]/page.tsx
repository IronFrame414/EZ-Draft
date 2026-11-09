// EZD-120c Build step 7 (vault/plans/EZD-120c.md section 3 route; Decided "Page"; Q-0500; ARCH Entry points): the
// editor for one project at /projects/[id]. It requires a session (signed out goes to /sign-in); the browser loads
// the project through the model route, which checks the permission. The test hook is off in production.
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { StateHost } from '../../../../components/states/StateHost';
import { ProjectEditor } from '../../../../editor/ProjectEditor';
import { MessagesProvider } from '../../../../lib/messages';
import { requireSession } from '../../../../server/auth/session';
import { catalogFor } from '../../../../server/messages/catalog';

// EZD-299 Build step 10 (vault/plans/EZD-299.md Decided D-Page; C14): `?conflicts=open` opens the conflict list.
export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  // Render per request, as the Projects page does (app/src/app/(office)/page.tsx).
  await connection();
  await requireSession();
  const { id } = await params;
  const query = searchParams === undefined ? undefined : await searchParams;
  const open = query?.conflicts === 'open' ? { conflictsOpen: true } : {};
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <ProjectEditor
          projectId={id}
          devHooks={process.env.VERCEL_ENV !== 'production'}
          {...open}
        />
      </StateHost>
    </MessagesProvider>
  );
}
