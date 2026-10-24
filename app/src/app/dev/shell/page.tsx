import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { EmptyEditor, HeaderCard } from '../../../components/shell';

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <EmptyEditor header={<HeaderCard />} />
    </MessagesProvider>
  );
}
