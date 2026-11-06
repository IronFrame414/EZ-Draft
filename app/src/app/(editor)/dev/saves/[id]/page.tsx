// EZD-120d Build step 19 (vault/plans/EZD-120d.md Decided "Test page"; Q-0505): the save test page for one project
// at /dev/saves/<project id>. Not found in production. Pattern: app/src/app/(office)/dev/settings/page.tsx.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { StateHost } from '../../../../../components/states/StateHost';
import { MessagesProvider } from '../../../../../lib/messages';
import { requireSession } from '../../../../../server/auth/session';
import { catalogFor } from '../../../../../server/messages/catalog';
import { SaveBench } from './SaveBench';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  if (process.env.VERCEL_ENV === 'production') notFound();
  await connection();
  await requireSession();
  const { id } = await params;
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <SaveBench projectId={id} />
      </StateHost>
    </MessagesProvider>
  );
}
