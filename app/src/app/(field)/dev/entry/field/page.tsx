// EZD-020 Step 1 (vault/plans/EZD-020.md): placeholder entry page for the phone field pack, measured by the
// perf check until EZD-1404 adds the real pages.
import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../../../lib/messages';
import { catalogFor } from '../../../../../server/messages/catalog';
import { StateHost } from '../../../../../components/states/StateHost';
import { PhoneFrame } from '../../../../../components/phone/PhoneFrame';

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <MessagesProvider language="en" messages={catalogFor('field', 'en')}>
      <StateHost>
        <PhoneFrame>{null}</PhoneFrame>
      </StateHost>
    </MessagesProvider>
  );
}
