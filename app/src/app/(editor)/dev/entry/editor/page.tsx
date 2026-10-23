// EZD-020 Step 1 (vault/plans/EZD-020.md): placeholder entry page for the editor entry (the /dev/shell tree),
// measured by the perf check until EZD-120b adds the editor route.
import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../../../lib/messages';
import { catalogFor } from '../../../../../server/messages/catalog';
import { StateHost } from '../../../../../components/states/StateHost';
import { EmptyEditor, HeaderCard } from '../../../../../components/shell';

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <EmptyEditor header={<HeaderCard />} />
      </StateHost>
    </MessagesProvider>
  );
}
