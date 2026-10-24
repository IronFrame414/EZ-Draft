import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import type { Language } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../../components/states/StateHost';
import { StatesDemo } from './StatesDemo';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { lang } = await searchParams;
  const language: Language = lang === 'es' ? 'es' : 'en';
  return (
    <MessagesProvider language={language} messages={catalogFor('dev', language)}>
      <StateHost>
        <StatesDemo />
      </StateHost>
    </MessagesProvider>
  );
}
