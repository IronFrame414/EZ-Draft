'use client';
// EZD-120d Build step 8 (vault/plans/EZD-120d.md section 3 and Decided "Office drain", "check()", "Dialog";
// Q-0503; Q-0507): sends one person's queued edits from any office page, and holds the sign-out check. The
// drain module is loaded only when something is queued (or the count cannot be read). Without a provider,
// the check passes.
// EZD-1402 (phase-14 EZD-1402; Q-0503; Q-0507 "the outbox drains whenever the app is open"): the page's one field
// sender. It starts with the drain when something is queued, or on first use (useFieldSync), and sign-out sends
// queued field actions too.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { countQueued } from '../../lib/outbox/device-db';
import type { Actor } from '../../lib/outbox/outbox';
import type { DrainHandle } from '../../lib/outbox/office-drain';
import type { FieldDrainHandle } from '../../lib/outbox/field-drain';
import type { FieldSync } from '../../lib/outbox/field-sync';
import { createConfirmController } from '../states/confirm-controller';
import { lazyModule } from '../../lib/lazy/lazy-module';

// EZD-1998 (AC-EZD-1998-2; 11 rule 7): the sign-out dialog and its Radix AlertDialog are not in the first download
// of a page with nothing queued (the field pages and the office). They are fetched when the page opens with
// something queued (the dialog may be needed offline, EZD-120d B3) and on the first press or key (as
// ConfirmProvider, EZD-215), so they are there before the person can go offline and sign out; the check loads them
// too. If they still cannot load, the answer is Cancel: the person stays signed in and nothing queued is lost.
const dialogModule = lazyModule(() => import('../../lazy/confirm-dialog'));

type DrainContext = {
  actor: Actor | null;
  handle(): DrainHandle | null;
  field(): FieldDrainHandle | null;
  // Starts the field sender if it is not running; null without an actor or when the module cannot load.
  startField(): Promise<FieldDrainHandle | null>;
};

const Context = createContext<DrainContext | null>(null);

type OfficeDrainModule = typeof import('../../lib/outbox/office-drain');

// Decided "Office drain": a failed import (a lost chunk) answers null and never rejects.
export async function loadOfficeDrain(
  load: () => Promise<OfficeDrainModule> = () => import('../../lib/outbox/office-drain'),
): Promise<OfficeDrainModule | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

type FieldDrainModule = typeof import('../../lib/outbox/field-drain');

// EZD-1998 (AC-EZD-1998-2; audit F7): the field sender alone, so a field page that starts it on first use does not
// also load the office autosave. As loadOfficeDrain, a failed import answers null and never rejects.
export async function loadFieldDrain(
  load: () => Promise<FieldDrainModule> = () => import('../../lib/outbox/field-drain'),
): Promise<FieldDrainModule | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

// EZD-134: `notice` (the reload prompt) renders after the page, inside the provider.
export function OutboxDrain({
  actor,
  children,
  notice,
}: {
  actor: Actor | null;
  children: ReactNode;
  notice?: ReactNode;
}) {
  const handleRef = useRef<DrainHandle | null>(null);
  const fieldRef = useRef<FieldDrainHandle | null>(null);
  const appUserId = actor?.appUserId;
  const tenantId = actor?.tenantId;
  const membershipId = actor?.membershipId;
  const value = useMemo<DrainContext>(() => {
    const who: Actor | null =
      appUserId === undefined || tenantId === undefined || membershipId === undefined
        ? null
        : { appUserId, tenantId, membershipId };
    return {
      actor: who,
      handle: () => handleRef.current,
      field: () => fieldRef.current,
      async startField() {
        if (who === null) return null;
        if (fieldRef.current !== null) return fieldRef.current;
        const drain = await loadFieldDrain();
        if (drain === null) return null;
        fieldRef.current ??= drain.startFieldDrain(who);
        return fieldRef.current;
      },
    };
  }, [appUserId, tenantId, membershipId]);

  useEffect(() => {
    if (appUserId === undefined || tenantId === undefined || membershipId === undefined) return;
    const who: Actor = { appUserId, tenantId, membershipId };
    let cancelled = false;
    void (async () => {
      const queued = await countQueued(appUserId, tenantId);
      if (cancelled || queued === 0) return;
      const drain = await loadOfficeDrain();
      if (cancelled || drain === null) return;
      handleRef.current = drain.startDrain(who);
      fieldRef.current ??= drain.startFieldDrain(who);
    })();
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
      fieldRef.current?.dispose();
      fieldRef.current = null;
    };
  }, [appUserId, tenantId, membershipId]);

  return (
    <Context.Provider value={value}>
      {children}
      {notice}
    </Context.Provider>
  );
}

export function useOutboxSignOut(): { check(): Promise<boolean>; dialog: ReactElement | null } {
  const ctx = useContext(Context);
  const [controller] = useState(() => createConfirmController());
  const request = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => null);
  const appUserId = ctx?.actor?.appUserId;
  const tenantId = ctx?.actor?.tenantId;

  useEffect(() => {
    if (appUserId === undefined || tenantId === undefined || dialogModule.peek() !== undefined)
      return;
    let live = true;
    void countQueued(appUserId, tenantId).then((n) => {
      // null: the count could not be read, so something may be queued (as the drain above).
      if (live && n !== 0) dialogModule.preload();
    });
    const on = () => {
      off();
      dialogModule.preload();
    };
    const off = () => {
      window.removeEventListener('pointerdown', on, true);
      window.removeEventListener('keydown', on, true);
    };
    window.addEventListener('pointerdown', on, true);
    window.addEventListener('keydown', on, true);
    return () => {
      live = false;
      off();
    };
  }, [appUserId, tenantId]);

  const check = async (): Promise<boolean> => {
    const actor = ctx?.actor ?? null;
    if (ctx === null || actor === null) return true;
    if ((await countQueued(actor.appUserId, actor.tenantId)) === 0) return true;
    const drain = await loadOfficeDrain();
    if (
      drain !== null &&
      (await drain.sendBeforeSignOut(actor, ctx.handle(), undefined, ctx.field())) === 'sent'
    )
      return true;
    const loaded = await dialogModule.load().then(
      () => true,
      () => false,
    );
    if (!loaded) return false;
    const choice = await controller.open({
      title: 'office.outbox.sign_out_title',
      message: 'office.outbox.sign_out_message',
      confirmLabel: 'office.outbox.sign_out_confirm',
      cancelLabel: 'common.cancel',
      tone: 'danger',
    });
    return choice === 'confirm';
  };

  const ConfirmDialog = dialogModule.peek()?.ConfirmDialog;
  const dialog =
    request && ConfirmDialog ? (
      <ConfirmDialog key={request.id} request={request} onChoose={controller.choose} />
    ) : null;
  return { check, dialog };
}

// EZD-2025 (audit 2026-11-27 A4, A6; AC-EZD-2025-2, -4; Q-0903): whether the page's field sender has started.
// starting: the first try is under way; ready: it runs; failed: it could not start (its file did not load on this
// phone, or the member could not be read).
export type FieldSenderState = 'starting' | 'ready' | 'failed';

export type FieldSender = { sync: FieldSync | null; state: FieldSenderState };

// Calls `cb` each time the network comes back; answers the stop function.
const whenOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  return () => window.removeEventListener('online', cb);
};

/**
 * Starts the field sender and tells `report` how it went; after a failure the start is tried again each time the
 * network comes back (AC-EZD-2025-4). Answers the stop function.
 */
export function watchFieldStart(
  start: () => Promise<FieldDrainHandle | null>,
  report: (s: FieldSender) => void,
  onOnline: (cb: () => void) => () => void = whenOnline,
): () => void {
  let live = true;
  // True while a start is under way or once it has worked: no other start is needed.
  let busy = false;
  const attempt = () => {
    busy = true;
    void start()
      .catch(() => null)
      .then((h) => {
        busy = h !== null;
        if (live) report({ sync: h?.sync ?? null, state: h ? 'ready' : 'failed' });
      });
  };
  const off = onOnline(() => {
    if (!live || busy) return;
    report({ sync: null, state: 'starting' });
    attempt();
  });
  attempt();
  return () => {
    live = false;
    off();
  };
}

// EZD-1402: the page's field sender (queue a field action with `add`); sync is null outside a provider, without an
// actor, or until it has started. EZD-2025: with the state of its start.
export function useFieldSender(): FieldSender {
  const ctx = useContext(Context);
  const [sender, setSender] = useState<FieldSender>({ sync: null, state: 'starting' });
  useEffect(() => {
    if (ctx === null) {
      queueMicrotask(() => setSender({ sync: null, state: 'failed' }));
      return;
    }
    return watchFieldStart(() => ctx.startField(), setSender);
  }, [ctx]);
  return sender;
}

export function useFieldSync(): FieldSync | null {
  return useFieldSender().sync;
}

// EZD-134: who is signed in for the outbox, or null outside a provider or without a loaded actor.
export function useOutboxActor(): Actor | null {
  return useContext(Context)?.actor ?? null;
}

// EZD-134 (03b Architecture rule 10 "The Projects page and sign-out warn when this device holds unsynced
// changes"): how many of this person's edits are queued on this device, read now and every `pollMs` while
// `enabled`. null until read, while not enabled, outside a provider or when the count cannot be read.
export const QUEUED_POLL_MS = 2000;

export function useQueuedCount(enabled = true, pollMs: number = QUEUED_POLL_MS): number | null {
  const actor = useOutboxActor();
  const [count, setCount] = useState<number | null>(null);
  const appUserId = actor?.appUserId;
  const tenantId = actor?.tenantId;
  useEffect(() => {
    if (!enabled || appUserId === undefined || tenantId === undefined) return;
    let live = true;
    const read = () => {
      void countQueued(appUserId, tenantId).then((n) => {
        if (live) setCount(n);
      });
    };
    read();
    // eslint-disable-next-line no-restricted-globals -- display-only: re-reads this device's IndexedDB count (no request), since another tab's editor can queue or send edits
    const timer = setInterval(read, pollMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled, appUserId, tenantId, pollMs]);
  return actor === null || !enabled ? null : count;
}
