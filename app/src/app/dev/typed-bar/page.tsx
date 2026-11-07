import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { TypedBarDemo } from './TypedBarDemo';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { edit } = await searchParams;
  const canEdit = edit !== '0';
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <TypedBarDemo canEdit={canEdit} />
    </MessagesProvider>
  );
}
