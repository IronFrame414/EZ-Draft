// EZD-1402 (vault/build/assumptions.md EZD-1402 "test page"): the field outbox test page for one project at
// /dev/field-outbox/<project id>, until the field pack's Tasks and Photo tabs (EZD-1409, EZD-1410) queue real
// actions. Its OutboxDrain is the page's field sender. Not found in production. Pattern:
// app/src/app/(editor)/dev/saves/[id]/page.tsx.
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactElement } from 'react';
import { OutboxDrain } from '../../../../components/outbox/OutboxDrain';
import { requireSession } from '../../../../server/auth/session';
import { loadOutboxActor } from '../../../../server/outbox/actor';
import { FieldOutboxBench } from './FieldOutboxBench';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  if (process.env.VERCEL_ENV === 'production') notFound();
  await connection();
  await requireSession();
  const { id } = await params;
  const actor = await loadOutboxActor();
  return (
    <OutboxDrain actor={actor}>
      <FieldOutboxBench projectId={id} />
    </OutboxDrain>
  );
}
