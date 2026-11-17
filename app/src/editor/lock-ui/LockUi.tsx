'use client';
// EZD-126 (S06 Layout and Controls lines 75-81; board S06 lines 54, 86-91, 209-211, 256; Q-0697 decisions 05;
// Q-0206; Q-0214): the edit lock on screen. Each part reads the lock UI store; the editor places them through
// `LockPart` (header avatars and Stop editing, the banner in the canvas state column, the save and lock-lost
// banners, the canvas toasts and holder prompt, View only in the status bar). Loaded with the lock UI's lazy
// module.
import { useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { HeaderButton } from '../../components/shell/HeaderButton';
import bannerStyles from '../../components/states/banner.module.css';
import { StateButton } from '../../components/states/StateButton';
import type { ToastStore } from '../../components/states/toast-store';
import toastStyles from '../../components/states/Toast.module.css';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import type { OutboxSync } from '../../lib/outbox/outbox-sync';
import type { MessageKey } from '../../server/messages/catalog';
import { useStore } from 'zustand';
import { SaveFailedBanner } from '../SaveStatus';
import { formatClock } from '../save-state';
import { HolderPrompt } from './HolderPrompt';
import { SwitcherPart, type SessionSwitcher } from '../switcher/ProjectSwitcher';
import type { LockLost, LockUiState, LockUiStore } from './lock-ui-store';
import styles from './LockUi.module.css';

export function LockBanner(p: {
  state: LockUiState;
  offline: boolean;
  onRequest: () => void;
  onCancel: () => void;
  timeZone?: string;
}): ReactElement | null {
  const t = useT();
  const { banner, canEdit } = p.state;
  if (banner === null) return null;
  const clock = (iso: string) => formatClock(Date.parse(iso), p.timeZone);
  const name = banner.holderName ?? t('office.lock.someone');
  const { request } = banner;
  return (
    <div role="status" data-testid="lock-banner" className={styles.banner}>
      <Icon name="lock" size={20} />
      <span className={styles.bannerText}>
        <span className={styles.bannerStrong}>
          {t('office.lock.banner_holder', { name, time: clock(banner.since) })}
        </span>
        {' · '}
        {t('office.lock.banner_view_only')}
      </span>
      <span className={styles.bannerHint}>{t('office.lock.banner_hint')}</span>
      {!canEdit ? null : request.kind === 'requested' ? (
        <>
          <StateButton compact className={styles.lockButton} data-testid="lock-requested" disabled>
            {t('office.lock.requested', { time: clock(request.requestedAt) })}
          </StateButton>
          <StateButton
            compact
            className={styles.lockButton}
            data-testid="lock-cancel-request"
            onClick={p.onCancel}
          >
            {t('office.lock.cancel_request')}
          </StateButton>
        </>
      ) : (
        <StateButton
          compact
          className={styles.lockButton}
          data-testid="lock-request-edit"
          disabled={request.kind === 'busy' || p.offline}
          onClick={p.onRequest}
        >
          <Icon name="front_hand" size={17} />
          {t('office.lock.request_edit')}
        </StateButton>
      )}
    </div>
  );
}

export function StopEditingButton(p: { busy: boolean; onStop: () => void }): ReactElement {
  const t = useT();
  return (
    <HeaderButton icon="edit" data-testid="stop-editing" disabled={p.busy} onClick={p.onStop}>
      {t('office.lock.stop_editing')}
    </HeaderButton>
  );
}

export function ViewOnlyStatus(): ReactElement {
  const t = useT();
  return (
    <div data-testid="lock-view-only" className={styles.viewOnly}>
      <Icon name="lock" size={14} />
      <span>{t('office.lock.view_only')}</span>
    </div>
  );
}

export function PresenceAvatars(p: {
  avatars: LockUiState['avatars'];
  people: LockUiState['people'];
  holderName: string | null;
}): ReactElement | null {
  const t = useT();
  const { shown, overflow } = p.avatars;
  if (shown.length === 0) return null;
  return (
    <div
      data-testid="presence-avatars"
      role="group"
      aria-label={t('office.lock.presence_label')}
      className={styles.avatars}
    >
      {shown.map(({ appUserId, holder }) => {
        const person = p.people.get(appUserId);
        const name =
          person?.name ?? (holder ? p.holderName : null) ?? t('office.lock.someone');
        const label = t(holder ? 'office.lock.presence_editing' : 'office.lock.presence_viewing', {
          name,
        });
        return (
          <span
            key={appUserId}
            data-testid="presence-avatar"
            data-app-user-id={appUserId}
            data-holder={holder ? '' : undefined}
            className={holder ? `${styles.avatar} ${styles.holder}` : styles.avatar}
            title={label}
            aria-label={label}
          >
            {person?.initials ?? ''}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span
          data-testid="presence-overflow"
          className={`${styles.avatar} ${styles.overflow}`}
          title={t('office.lock.presence_more', { count: overflow })}
        >
          {t('office.lock.presence_overflow', { count: overflow })}
        </span>
      ) : null}
    </div>
  );
}

const LOST_KEY: Record<LockLost, MessageKey> = {
  auto: 'office.lock.auto_released',
  other_device: 'office.lock.other_device_released',
  released: 'office.lock.released',
};

// The error look of InlineError (banner.module.css), with a Close when the notice can be put away.
export function LockLostBanner(p: {
  reason: string;
  message: MessageKey;
  onClose?: () => void;
}): ReactElement {
  const t = useT();
  return (
    <div
      role="alert"
      data-testid="lock-lost-banner"
      data-reason={p.reason}
      className={`${bannerStyles.banner} ${bannerStyles.error}`}
    >
      <span className={bannerStyles.icon}>
        <Icon name="error" size={20} />
      </span>
      <span className={bannerStyles.text}>{t(p.message)}</span>
      {p.onClose ? (
        <StateButton
          variant="icon"
          aria-label={t('common.close')}
          title={t('common.close')}
          onClick={p.onClose}
        >
          <Icon name="close" size={18} />
        </StateButton>
      ) : null}
    </div>
  );
}

// AC-EZD-126-7 (Q-0206; Q-0502; Q-0697 decisions 05): a save refused for an old lock epoch says why, in place of
// "Changes not saved": the request timer released this person's lock, their own other device or tab did, or
// someone else is editing. A retry cannot succeed with that epoch, so there is no Retry. Any other failed save
// keeps the save-failed banner; the lock-lost notice shows below it until closed.
export function LockAwareSaveBanner(p: {
  sync: OutboxSync;
  lockLost: LockLost | null;
  staleKey: () => MessageKey;
  onCloseLockLost: () => void;
}): ReactElement | null {
  const status = useStore(p.sync, (s) => s.status);
  const problem = useStore(p.sync, (s) => s.problem);
  if (status === 'error' && problem === 'stale_lock_epoch') {
    const key =
      p.lockLost === 'auto'
        ? LOST_KEY.auto
        : p.lockLost === 'other_device'
          ? 'error.lock_released_other_device'
          : p.staleKey();
    return <LockLostBanner reason={p.lockLost ?? 'stale'} message={key} />;
  }
  const lost = p.lockLost ? (
    <LockLostBanner reason={p.lockLost} message={LOST_KEY[p.lockLost]} onClose={p.onCloseLockLost} />
  ) : null;
  return status === 'error' ? (
    <>
      <SaveFailedBanner sync={p.sync} />
      {lost}
    </>
  ) : (
    lost
  );
}

// The lock toasts (board S06 lines 209-211): ToastList's markup and look (Toast.module.css, EZD-015b), placed at the
// canvas's bottom right, the Available toast (tone success) green with the lock_open icon. Kept here, not in ToastList, so the
// editor's first download stays inside its budget (11 Budgets).
export function LockToasts(p: { toasts: ToastStore }): ReactElement {
  const t = useT();
  const list = useSyncExternalStore(p.toasts.subscribe, p.toasts.getSnapshot, p.toasts.getSnapshot);
  return (
    <div
      data-toast-viewport=""
      data-placement="canvas"
      role="status"
      aria-live="polite"
      className={`${toastStyles.viewport} ${styles.toasts}`}
    >
      {list.map((toast) => (
        <div
          key={toast.id}
          data-toast=""
          className={
            toast.tone === 'success' ? `${toastStyles.toast} ${styles.success}` : toastStyles.toast
          }
        >
          {toast.tone === 'success' ? (
            <span className={styles.toastIcon}>
              <Icon name="lock_open" size={18} />
            </span>
          ) : null}
          <span className={toastStyles.text}>{t(toast.message, toast.params)}</span>
          {toast.action ? (
            <StateButton
              compact
              data-toast-action=""
              onClick={() => p.toasts.press(toast.id)}
            >
              {t(toast.action.label)}
            </StateButton>
          ) : null}
          <StateButton
            variant="icon"
            aria-label={t('common.close')}
            title={t('common.close')}
            onClick={() => p.toasts.dismiss(toast.id)}
          >
            <Icon name="close" size={18} />
          </StateButton>
        </div>
      ))}
    </div>
  );
}

// What the editor holds once the lock UI has loaded for its session (use-lock-ui.ts createLockUi).
export type LockUi = {
  store: LockUiStore;
  toasts: ToastStore;
  sync: OutboxSync | null;
  staleKey: () => MessageKey;
  // EZD-128: the header project name's switcher (its leave runs Stop editing).
  switcher: SessionSwitcher;
  dispose(): void;
};

export type LockPartName =
  | 'presence'
  | 'stop'
  | 'banner'
  | 'save'
  | 'canvas'
  | 'status'
  // EZD-128: the project switcher's panel.
  | 'switcher'
  // EZD-225 (S06:48; board S06 line 100; Q-0740 (a), vault/build/assumptions.md EZD-225): the note under the banner
  // while the drawing tools are paused; the editor asks for it only then.
  | 'paused';

export function LockPart({ ui, part }: { ui: LockUi; part: LockPartName }): ReactElement | null {
  const { store } = ui;
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const online = useOnline();
  switch (part) {
    case 'presence':
      return (
        <PresenceAvatars
          avatars={state.avatars}
          people={state.people}
          holderName={state.banner?.holderName ?? null}
        />
      );
    case 'stop':
      return state.isHolder ? (
        <StopEditingButton busy={state.stopBusy} onStop={() => void store.stopEditing()} />
      ) : null;
    case 'paused':
      return <ToolsPausedNote />;
    case 'banner':
      return (
        <LockBanner
          state={state}
          offline={!online}
          onRequest={() => void store.requestEdit()}
          onCancel={() => void store.cancelRequest()}
        />
      );
    case 'save':
      return ui.sync ? (
        <LockAwareSaveBanner
          sync={ui.sync}
          lockLost={state.lockLost}
          staleKey={ui.staleKey}
          onCloseLockLost={store.closeLockLost}
        />
      ) : state.lockLost ? (
        <LockLostBanner
          reason={state.lockLost}
          message={LOST_KEY[state.lockLost]}
          onClose={store.closeLockLost}
        />
      ) : null;
    case 'canvas':
      return (
        <>
          <LockToasts toasts={ui.toasts} />
          {state.prompt ? (
            <HolderPrompt
              prompt={state.prompt}
              onRelease={() => void store.release()}
              onKeep={() => void store.keepEditing()}
            />
          ) : null}
        </>
      );
    case 'status':
      return state.viewOnly ? <ViewOnlyStatus /> : null;
    case 'switcher':
      return <SwitcherPart switcher={ui.switcher} />;
  }
}

function ToolsPausedNote(): ReactElement {
  const t = useT();
  return (
    <p className={styles.pausedNote} data-testid="tools-paused-note">
      {t('office.lock.tools_paused')}
    </p>
  );
}
