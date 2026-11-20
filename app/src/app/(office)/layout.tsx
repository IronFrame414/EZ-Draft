// EZD-020 Step 1 (vault/plans/EZD-020.md): the office entry point, Projects and Settings (11 Performance rule 7).
// EZD-120d Build step 9 (vault/plans/EZD-120d.md Decided "Layout"): loads who is signed in for the device
// outbox; a failed load is reported and the page still shows (no connection(): EZD-020 U2).
// EZD-134 (03b Architecture rule 12): the reload prompt for an outdated page, with only its own two strings.
import type { ReactNode } from 'react';
import { OutboxDrain } from '../../components/outbox/OutboxDrain';
import { ReloadPrompt } from '../../components/pwa/ReloadPrompt';
import { MessagesProvider } from '../../lib/messages';
import type { Actor } from '../../lib/outbox/outbox';
import { reportError } from '../../server/errors/report';
import { catalogFor, type MessageKey } from '../../server/messages/catalog';
import { loadOutboxActor } from '../../server/outbox/actor';

const PROMPT_KEYS: readonly MessageKey[] = ['office.app.reload_message', 'office.app.reload'];

function promptMessages() {
  const all = catalogFor('office', 'en');
  return Object.fromEntries(PROMPT_KEYS.map((k) => [k, all[k]]));
}

export default async function OfficeLayout({ children }: { children: ReactNode }) {
  let actor: Actor | null = null;
  try {
    actor = await loadOutboxActor();
  } catch (error) {
    await reportError(error, { source: 'function', location: 'office.outbox_actor' });
  }
  return (
    <div data-entry="office" style={{ display: 'contents' }}>
      <OutboxDrain
        actor={actor}
        notice={
          <MessagesProvider language="en" messages={promptMessages()}>
            <ReloadPrompt />
          </MessagesProvider>
        }
      >
        {children}
      </OutboxDrain>
    </div>
  );
}
