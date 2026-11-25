// EZD-1404 (S17 Field pack (phone); Permissions "View field pack, all tabs ...: View projects (scoped to assigned
// projects)", "Photo + note: Photo notes", "Controls the user lacks are hidden"; Data shown "Language from the user's
// setting"): the phone field pack at /projects/[id]/field. It requires a session (signed out goes to /sign-in) and
// View projects for this project; a project that is missing or out of scope is not found. Text is the field surface
// in the user's language, with the disclaimer line last (EZD-136). The pack itself loads in the browser
// (FieldPackScreen) so the phone keeps a copy for offline use; the service worker keeps this page.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { OutboxDrain } from '../../../../../components/outbox/OutboxDrain';
import { StateHost } from '../../../../../components/states/StateHost';
import { FieldPackScreen } from '../../../../../field-pack/FieldPackScreen';
import { MessagesProvider } from '../../../../../lib/messages';
import type { Language } from '../../../../../lib/messages/types';
import { requireSession } from '../../../../../server/auth/session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { loadOutboxActor } from '../../../../../server/outbox/actor';
import { catalogFor } from '../../../../../server/messages/catalog';
import { can, getPermissionContext } from '../../../../../server/permissions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FieldPackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  await connection();
  const session = await requireSession();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await getPermissionContext();
  if (ctx === null || !can(ctx, 'view_projects', { projectId: id })) notFound();
  const client = createSessionClient();
  const project = await client.from('project').select('id').eq('id', id).maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) notFound();
  const user = await client
    .from('app_user')
    .select('language')
    .eq('id', session.appUserId)
    .maybeSingle();
  const language: Language = user.data?.language === 'es' ? 'es' : 'en';
  const actor = await loadOutboxActor();
  return (
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <StateHost>
        <OutboxDrain actor={actor}>
          <FieldPackScreen
            projectId={id}
            language={language}
            canPhoto={can(ctx, 'photo_notes', { projectId: id })}
          />
        </OutboxDrain>
      </StateHost>
    </MessagesProvider>
  );
}
