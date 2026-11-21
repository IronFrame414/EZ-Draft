// EZD-1415 (S17b Field measure; Permissions "Send field measurement to create and send; View projects to view"):
// the phone screen at /projects/[id]/field-measure. It requires a session (signed out goes to /sign-in) and View
// projects for this project; a project that is missing or out of scope is not found. Text is the field surface in
// the user's language (S17 phone screens follow the user's language), with the disclaimer line last (EZD-136).
// The entry from the project is EZD-1419.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { Disclaimer } from '../../../../../components/disclaimer/Disclaimer';
import { PhoneFrame } from '../../../../../components/phone/PhoneFrame';
import { StateHost } from '../../../../../components/states/StateHost';
import { FieldMeasureScreen } from '../../../../../field-measure/FieldMeasureScreen';
import { MessagesProvider } from '../../../../../lib/messages';
import type { Language } from '../../../../../lib/messages/types';
import { requireSession } from '../../../../../server/auth/session';
import { createSessionClient } from '../../../../../server/auth/supabase-server';
import { readFieldMeasure } from '../../../../../server/field-measure/session';
import { catalogFor } from '../../../../../server/messages/catalog';
import { can, getPermissionContext } from '../../../../../server/permissions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FieldMeasurePage({
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
  const view = await readFieldMeasure(client, id);
  if (view === null) notFound();
  const user = await client.from('app_user').select('language').eq('id', session.appUserId).maybeSingle();
  const language: Language = user.data?.language === 'es' ? 'es' : 'en';
  return (
    <MessagesProvider language={language} messages={catalogFor('field', language)}>
      <StateHost>
        <PhoneFrame>
          <FieldMeasureScreen
            projectId={id}
            projectName={view.projectName}
            initialRooms={view.rooms}
            canEdit={can(ctx, 'send_field_measurement', { projectId: id })}
          />
          <Disclaimer placement="page" />
        </PhoneFrame>
      </StateHost>
    </MessagesProvider>
  );
}
