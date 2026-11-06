'use client';
// EZD-120d Build step 8 (vault/plans/EZD-120d.md section 3 and Decided "Office drain", "check()", "Dialog";
// Q-0503; Q-0507): sends one person's queued edits from any office page, and holds the sign-out check. The
// drain module is loaded only when something is queued (or the count cannot be read). Without a provider,
// the check passes.
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
import { ConfirmDialog } from '../states/ConfirmDialog';
import { createConfirmController } from '../states/confirm-controller';

type DrainContext = { actor: Actor | null; handle(): DrainHandle | null };

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

export function OutboxDrain({ actor, children }: { actor: Actor | null; children: ReactNode }) {
  const handleRef = useRef<DrainHandle | null>(null);
  const appUserId = actor?.appUserId;
  const tenantId = actor?.tenantId;
  const membershipId = actor?.membershipId;
  const value = useMemo<DrainContext>(
    () => ({
      actor:
        appUserId === undefined || tenantId === undefined || membershipId === undefined
          ? null
          : { appUserId, tenantId, membershipId },
      handle: () => handleRef.current,
    }),
    [appUserId, tenantId, membershipId],
  );

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
    })();
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [appUserId, tenantId, membershipId]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useOutboxSignOut(): { check(): Promise<boolean>; dialog: ReactElement | null } {
  const ctx = useContext(Context);
  const [controller] = useState(() => createConfirmController());
  const request = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => null);

  const check = async (): Promise<boolean> => {
    const actor = ctx?.actor ?? null;
    if (ctx === null || actor === null) return true;
    if ((await countQueued(actor.appUserId, actor.tenantId)) === 0) return true;
    const drain = await loadOfficeDrain();
    if (drain !== null && (await drain.sendBeforeSignOut(actor, ctx.handle())) === 'sent') return true;
    const choice = await controller.open({
      title: 'office.outbox.sign_out_title',
      message: 'office.outbox.sign_out_message',
      confirmLabel: 'office.outbox.sign_out_confirm',
      cancelLabel: 'common.cancel',
      tone: 'danger',
    });
    return choice === 'confirm';
  };

  const dialog = request ? (
    <ConfirmDialog key={request.id} request={request} onChoose={controller.choose} />
  ) : null;
  return { check, dialog };
}
