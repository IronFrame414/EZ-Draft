// EZD-401 (AC-EZD-401-1): the catalog picker test page. Not found in production. The picker has no host screen
// until EZD-403 (line picker) and EZD-419 (selection tiles), so the browser test opens it here. Signed in;
// the picker reads GET /api/catalog (View projects). Office English (Q-0121 (a)).
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CatalogPicker } from '../../../components/catalog/CatalogPicker';
import { MessagesProvider } from '../../../lib/messages';
import { requireSession } from '../../../server/auth/session';
import { catalogFor } from '../../../server/messages/catalog';

export default async function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  // Render per request, as app/src/app/dev/permissions/page.tsx.
  await connection();
  await requireSession();
  return (
    <main style={{ padding: 16 }}>
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <CatalogPicker />
      </MessagesProvider>
    </main>
  );
}
