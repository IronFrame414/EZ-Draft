import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import type { Language } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { DeviceDemo } from './DeviceDemo';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string | string[] }>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const { lang } = await searchParams;
  const phoneLanguage: Language = lang === 'es' ? 'es' : 'en';
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <DeviceDemo
        phoneLanguage={phoneLanguage}
        phoneMessages={catalogFor('field', phoneLanguage)}
      />
    </MessagesProvider>
  );
}
