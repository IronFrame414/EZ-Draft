// EZD-020 Step 1 (vault/plans/EZD-020.md): placeholder entry page for the client link, measured by the perf
// check until EZD-1202 adds the real page.
import { notFound } from 'next/navigation';
import { MessagesProvider } from '../../../../../lib/messages';
import { catalogFor } from '../../../../../server/messages/catalog';
import { StateHost } from '../../../../../components/states/StateHost';
import { PhoneFrame } from '../../../../../components/phone/PhoneFrame';
import { Disclaimer } from '../../../../../components/disclaimer/Disclaimer';

export default function Page() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <MessagesProvider language="en" messages={catalogFor('client', 'en')}>
      <StateHost>
        <PhoneFrame>
          <Disclaimer placement="page" />
        </PhoneFrame>
      </StateHost>
    </MessagesProvider>
  );
}
