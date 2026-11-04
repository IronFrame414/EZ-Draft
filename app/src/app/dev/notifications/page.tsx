import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { NotificationBell } from '../../../components/notifications/NotificationBell';
import { HeaderCard } from '../../../components/shell/HeaderCard';
import { StateHost } from '../../../components/states/StateHost';
import { NotificationsProbe } from './NotificationsProbe';
import styles from './page.module.css';

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
      <StateHost>
        <HeaderCard>
          <span className={styles.spacer} />
          <NotificationBell />
          <span className={styles.gear} />
          <span className={styles.avatar} />
        </HeaderCard>
        <NotificationsProbe projectId={one(query.project)} />
      </StateHost>
    </MessagesProvider>
  );
}
