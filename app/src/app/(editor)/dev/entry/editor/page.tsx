// EZD-020 Step 1 (vault/plans/EZD-020.md): placeholder entry page for the editor entry (the /dev/shell tree),
// measured by the perf check until EZD-120b adds the editor route.
import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../../../lib/messages';
import { pageMessages } from '../../../../../server/messages/page-messages';
import { StateHost } from '../../../../../components/states/StateHost';
import { EmptyEditor, HeaderCard } from '../../../../../components/shell';

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <MessagesProvider language="en" messages={pageMessages('editor')}>
      <StateHost>
        <EmptyEditor header={<HeaderCard />} />
      </StateHost>
    </MessagesProvider>
  );
}
