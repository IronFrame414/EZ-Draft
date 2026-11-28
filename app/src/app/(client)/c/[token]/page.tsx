// EZD-1202 (S18 Layout, States; AC-EZD-1202-1; vault/build/assumptions/EZD-1202.md Settled rows): the client link
// page, /c/<token>, in the client entry (no editor or 3D code; 11 Budgets 200 KB). Signed out: the link is the only
// key. The server reads the page's fixed field list (server/sends/client-page.ts, no cost data) and records
// share_link.viewed for the open. A failed read shows "Couldn't load this page." with Try again, never a blank
// screen (Q-0214). English only (architecture Messages and language).
import type { Metadata } from 'next';
import { MessagesProvider } from '../../../../lib/messages';
import { catalogFor } from '../../../../server/messages/catalog';
import { StateHost } from '../../../../components/states/StateHost';
import { ClientPage } from '../../../../components/client/ClientPage';
import type { ClientPageResult } from '../../../../components/client/client-page-model';
import { reportRouteFailure } from '../../../../server/errors/route-failure';
import { loadClientPage } from '../../../../server/sends/client-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let initial: ClientPageResult | null;
  try {
    initial = await loadClientPage(token, { view: true });
  } catch (e) {
    await reportRouteFailure(e, '/c/[token]');
    initial = null;
  }
  return (
    <MessagesProvider language="en" messages={catalogFor('client', 'en')}>
      <StateHost>
        <ClientPage token={token} initial={initial} />
      </StateHost>
    </MessagesProvider>
  );
}
