// EZD-1998 (AC-EZD-1998-2; 11 rule 7; audit F7): the sign-out check's dialog (Radix AlertDialog) is not part of a
// page's first load: OutboxDrain loads it only when the check has to ask, as ConfirmProvider does (EZD-215). If it
// cannot load, the answer is Cancel, so the person stays signed in with their queued changes. The dialog shown once
// it loads is covered by e2e/sign-out-outbox.spec.ts. Static rendering, as the other component tests (no DOM).
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ dialogImported: 0, queued: 1 }));

vi.mock('../../lazy/confirm-dialog', () => {
  state.dialogImported += 1;
  throw new Error('lost chunk');
});
vi.mock('../../lib/outbox/device-db', () => ({ countQueued: async () => state.queued }));
vi.mock('../../lib/outbox/office-drain', () => ({
  startDrain: () => null,
  startFieldDrain: () => null,
  sendBeforeSignOut: async () => 'failed',
}));

import { OutboxDrain, useOutboxSignOut } from './OutboxDrain';

const ACTOR = { appUserId: 'u1', tenantId: 't1', membershipId: 'm1' };

function captureCheck(): () => Promise<boolean> {
  let check: (() => Promise<boolean>) | null = null;
  function Probe() {
    check = useOutboxSignOut().check;
    return null;
  }
  renderToStaticMarkup(
    <OutboxDrain actor={ACTOR}>
      <Probe />
    </OutboxDrain>,
  );
  return check!;
}

describe('EZD-1998 the sign-out dialog loads when it is needed', () => {
  it('rendering the drain does not load the dialog', () => {
    captureCheck();
    expect(state.dialogImported).toBe(0);
  });

  it('nothing queued: sign-out goes ahead without loading the dialog', async () => {
    state.queued = 0;
    await expect(captureCheck()()).resolves.toBe(true);
    expect(state.dialogImported).toBe(0);
    state.queued = 1;
  });

  it('queued and not sent: the dialog is loaded, and a failed load answers Cancel (stay signed in)', async () => {
    await expect(captureCheck()()).resolves.toBe(false);
    expect(state.dialogImported).toBeGreaterThanOrEqual(1);
  });
});
