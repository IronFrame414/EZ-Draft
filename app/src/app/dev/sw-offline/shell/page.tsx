// EZD-164 Step 6 (vault/plans/EZD-164.md D-Page): the page the spike reloads offline. Not found in production.
import { notFound } from 'next/navigation';
import { SwOfflineProbe } from '../SwOfflineProbe';

export const dynamic = 'force-dynamic';

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <main data-testid="sw-offline-page" data-render-id={crypto.randomUUID()}>
      <SwOfflineProbe />
    </main>
  );
}
