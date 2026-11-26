'use client';
// EZD-110b Step 20 (vault/plans/EZD-110b.md Decided D16-D24, B1, B4, B5, B7; board 01c, S01): the bell with
// its unread dot. The bell wires the store, the user channel and the router; NotificationPanelFallback and the
// loader live here too. The list itself is the lazy module app/src/lazy/notification-panel/ (EZD-332).
// Needs MessagesProvider (office) and StateHost above it.
import { Popover } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { useT } from '../../lib/messages';
import type { MessageParams } from '../../lib/messages';
import {
  createNotificationStore,
  notificationHttpApi,
  type NotificationStore,
} from '../../lib/notifications/store';
import { afterPageReady, loadRealtimeHub } from '../../lib/realtime/deferred';
import type { RealtimeHub, UserHandle } from '../../lib/realtime/hub';
import type { MessageKey } from '../../server/messages/catalog';
import { Icon } from '../icon/Icon';
import { InlineError } from '../states/InlineError';
import { useToast } from '../states/ToastProvider';
import touch from '../../styles/touch.module.css';
import type { NotificationPanelViewProps } from '../../lazy/notification-panel';
import { NotificationListSkeleton } from './NotificationListSkeleton';
import styles from './NotificationBell.module.css';

const panelModule = lazyModule(() => import('../../lazy/notification-panel'));

export function bellLabel(unreadCount: number): { key: MessageKey; params?: MessageParams } {
  return unreadCount > 0
    ? { key: 'office.notifications.bell_unread', params: { count: unreadCount } }
    : { key: 'office.notifications.bell' };
}

// What the bell's panel shows while the list code loads, or when that download failed (EZD-332). No Mark all
// read and no footer until the list is there.
export function NotificationPanelFallback(props: { failed: boolean; onRetry(): void }) {
  const t = useT();
  return (
    <>
      <div className={styles.header}>
        <h2 className={styles.heading}>{t('office.notifications.title')}</h2>
      </div>
      <div className={styles.body}>
        {props.failed ? (
          <div data-testid="notification-error">
            <InlineError message="office.notifications.load_failed" onRetry={props.onRetry} />
          </div>
        ) : (
          <NotificationListSkeleton />
        )}
      </div>
    </>
  );
}

// Loads the list module on first render (the panel opens), then renders it; a failed load shows the fallback
// with Retry. The module stays cached in panelModule, so a reopen renders it at once.
function NotificationPanelLoader(props: NotificationPanelViewProps) {
  const [mod, setMod] = useState(() => panelModule.peek());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (mod) return;
    let live = true;
    panelModule.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [mod, attempt]);
  if (mod) return <mod.NotificationPanelView {...props} />;
  return (
    <NotificationPanelFallback
      failed={failed}
      onRetry={() => {
        setFailed(false);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

// D16 (amended 2026-11-03): mount refresh, event and resync wiring. The hub's resync runs on every
// subscribed, the first join included (EZD-318), so it covers the gap between the mount fetch and the first join.
export function connectNotificationBell(store: NotificationStore, h: UserHandle): () => void {
  void store.refresh();
  return attachNotificationEvents(store, h);
}

function attachNotificationEvents(store: NotificationStore, h: UserHandle): () => void {
  const off1 = h.on('notification.created', () => void store.refresh());
  const off2 = h.on('notification.read', (p) => {
    store.applyRead(p.notificationId);
    void store.refresh();
  });
  const off3 = h.onResync(() => store.reset());
  return () => {
    off1();
    off2();
    off3();
    h.release();
  };
}

export type DeferredBellDeps = {
  loadHub: () => Promise<Pick<RealtimeHub, 'user'>>;
  schedule: (run: () => void) => () => void;
  onReady: () => void;
};

// EZD-1997 (AC-EZD-1997-1; audit F6): the bell without Realtime in the page's first load. The count is fetched at
// mount as before; the Realtime library is downloaded once the page has loaded and is idle (deps.schedule), then
// the user channel is wired as connectNotificationBell does. Its first-join resync is the second fetch, so the
// bell still makes the same two requests. onReady runs when the channel has joined. A failed download leaves the
// count from the mount fetch; retry() (the panel opens) tries again.
export function startNotificationBell(
  store: NotificationStore,
  deps: DeferredBellDeps,
): { stop(): void; retry(): void } {
  let live = true;
  let loading = false;
  let detach: (() => void) | null = null;
  void store.refresh();
  const connect = () => {
    if (!live || loading || detach) return;
    loading = true;
    deps.loadHub().then(
      (hub) => {
        loading = false;
        if (!live) return;
        const h = hub.user();
        detach = attachNotificationEvents(store, h);
        void h.ready.then((s) => {
          if (live && s === 'subscribed') deps.onReady();
        });
      },
      () => {
        loading = false;
      },
    );
  };
  const cancel = deps.schedule(connect);
  return {
    stop() {
      live = false;
      cancel();
      detach?.();
      detach = null;
    },
    retry: connect,
  };
}

export function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [store] = useState(() => createNotificationStore(notificationHttpApi));
  const [open, setOpen] = useState(false);
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const retryRealtime = useRef<() => void>(() => {});

  useEffect(() => {
    const bell = startNotificationBell(store, {
      loadHub: loadRealtimeHub,
      schedule: (run) => afterPageReady(run),
      onReady: () => setRealtimeReady(true),
    });
    retryRealtime.current = bell.retry;
    return bell.stop;
  }, [store]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) retryRealtime.current();
    if (next && (state.status === 'idle' || state.status === 'error')) void store.refresh();
  }

  async function onOpenItem(id: string) {
    const result = await store.open(id);
    if (result.ok) {
      setOpen(false);
      router.push(result.link);
    } else {
      toast.show({ message: result.messageKey });
    }
  }

  async function onMarkAllRead() {
    if (!(await store.markAllRead())) toast.show({ message: 'error.db_unavailable' });
  }

  const label = bellLabel(state.unreadCount);
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`${styles.bell} ${touch.target}`}
          data-testid="notification-bell"
          data-realtime={realtimeReady ? 'ready' : 'waiting'}
          aria-label={t(label.key, label.params)}
        >
          <Icon name="notifications" size={20} />
          {state.unreadCount > 0 ? (
            <span className={styles.bellDot} data-testid="notification-bell-dot" />
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.panel}
          data-testid="notification-panel"
          align="end"
          sideOffset={8}
          alignOffset={-30}
          collisionPadding={16}
        >
          <NotificationPanelLoader
            state={state}
            now={new Date()}
            onOpenItem={(id) => void onOpenItem(id)}
            onMarkAllRead={() => void onMarkAllRead()}
            onShowOlder={() => void store.loadOlder()}
            onRetry={() => void store.refresh()}
            onRetryOlder={() => void store.loadOlder()}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
