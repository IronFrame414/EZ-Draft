// EZD-020 Step 1 (vault/plans/EZD-020.md): the office entry point, Projects and Settings (11 Performance rule 7).
// EZD-120d Build step 9 (vault/plans/EZD-120d.md Decided "Layout"): loads who is signed in for the device
// outbox; a failed load is reported and the page still shows (no connection(): EZD-020 U2).
import type { ReactNode } from 'react';
import { OutboxDrain } from '../../components/outbox/OutboxDrain';
import type { Actor } from '../../lib/outbox/outbox';
import { reportError } from '../../server/errors/report';
import { loadOutboxActor } from '../../server/outbox/actor';

export default async function OfficeLayout({ children }: { children: ReactNode }) {
  let actor: Actor | null = null;
  try {
    actor = await loadOutboxActor();
  } catch (error) {
    await reportError(error, { source: 'function', location: 'office.outbox_actor' });
  }
  return (
    <div data-entry="office" style={{ display: 'contents' }}>
      <OutboxDrain actor={actor}>{children}</OutboxDrain>
    </div>
  );
}
