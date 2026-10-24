import { notFound } from 'next/navigation';
import { getRequestLanguage, NotSignedInError } from '../../../server/messages/request-language';
import { MessagesSample } from './MessagesSample';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  let language;
  try {
    language = await getRequestLanguage('dev');
  } catch (error) {
    if (error instanceof NotSignedInError) notFound();
    throw error;
  }
  return <MessagesSample user={{ language }} />;
}
