import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { NotificationsProbe } from './NotificationsProbe';

// EZD-110a Step 21 (vault/plans/EZD-110a.md Decided D25, "`?project=` value"): the notifications test page.
// Values only. ?project=<id> passes through unchanged; absent or repeated is ''.
const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : '');

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const query = await searchParams;
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <NotificationsProbe projectId={one(query.project)} />
    </MessagesProvider>
  );
}
