'use client';
// EZD-110b Step 20 (vault/plans/EZD-110b.md Decided D16-D24, B1, B4, B5, B7; board 01c, S01): the bell with
// its unread dot and the notification list. NotificationPanelView is pure; NotificationBell wires it to the
// store, the user channel and the router. Needs MessagesProvider (office) and StateHost above it.
import { Popover } from 'radix-ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useT } from '../../lib/messages';
import type { MessageParams } from '../../lib/messages';
import { notificationIcon, notificationTitle } from '../../lib/notifications/kinds';
import type { NotificationItem } from '../../lib/notifications/kinds';
import {
  createNotificationStore,
  notificationHttpApi,
  type NotificationState,
  type NotificationStore,
} from '../../lib/notifications/store';
import { formatNotificationTime } from '../../lib/notifications/time';
import { getRealtimeHub } from '../../lib/realtime';
import type { UserHandle } from '../../lib/realtime';
import type { MessageKey } from '../../server/messages/catalog';
import { Icon } from '../icon/Icon';
import { InlineError } from '../states/InlineError';
import { Skeleton, SkeletonGroup } from '../states/Skeleton';
import { useToast } from '../states/ToastProvider';
import touch from '../../styles/touch.module.css';
import styles from './NotificationBell.module.css';

export function bellLabel(unreadCount: number): { key: MessageKey; params?: MessageParams } {
  return unreadCount > 0
    ? { key: 'office.notifications.bell_unread', params: { count: unreadCount } }
    : { key: 'office.notifications.bell' };
}

export type NotificationPanelViewProps = {
  state: NotificationState;
  now: Date;
  timeZone?: string;
  onOpenItem(id: string): void;
  onMarkAllRead(): void;
  onShowOlder(): void;
  onRetry(): void;
  onRetryOlder(): void;
};

function Row({
  item,
  now,
  timeZone,
  onOpen,
}: {
  item: NotificationItem;
  now: Date;
  timeZone?: string;
  onOpen(id: string): void;
}) {
  const t = useT();
  const title = notificationTitle(item.kind, item.params);
  const time = formatNotificationTime(item.createdAt, now, timeZone);
  const unread = item.readAt === null;
  const projectLine =
    item.projectName === null
      ? null
      : item.clientName
        ? t('office.notifications.project_line', {
            project: item.projectName,
            client: item.clientName,
          })
        : item.projectName;
  return (
    <button
      type="button"
      className={`${styles.row} ${unread ? styles.unread : ''}`}
      data-testid="notification-item"
      data-notification-id={item.id}
      data-unread={unread ? 'true' : 'false'}
      onClick={() => onOpen(item.id)}
    >
      <span className={styles.iconBox}>
        <Icon name={notificationIcon(item.kind, item.params)} size={18} />
      </span>
      <span className={styles.text}>
        <span className={styles.title} data-testid="notification-item-title">
          {t(title.key, title.params)}
        </span>
        {projectLine === null ? null : (
          <span className={styles.project} data-testid="notification-item-project">
            {projectLine}
          </span>
        )}
        <span className={styles.time} data-testid="notification-item-time">
          {t(time.key, time.params)}
        </span>
      </span>
      <span
        className={styles.dot}
        data-testid="notification-item-dot"
        role="img"
        aria-label={t(unread ? 'office.notifications.unread' : 'office.notifications.read')}
      />
    </button>
  );
}

export function NotificationPanelView(props: NotificationPanelViewProps) {
  const { state, now, timeZone } = props;
  const t = useT();
  let body;
  if (state.status === 'error') {
    body = (
      <div data-testid="notification-error">
        <InlineError message="office.notifications.load_failed" onRetry={props.onRetry} />
      </div>
    );
  } else if (state.items.length === 0 && state.status !== 'ready') {
    body = (
      <div data-testid="notification-loading" className={styles.list}>
        <SkeletonGroup count={3}>
          <div className={styles.skeletonRow}>
            <Skeleton height="56px" radius="md" />
          </div>
        </SkeletonGroup>
      </div>
    );
  } else if (state.items.length === 0) {
    body = (
      <div className={styles.empty} data-testid="notification-empty">
        <Icon name="notifications_off" size={28} />
        <span>{t('office.notifications.empty')}</span>
      </div>
    );
  } else {
    body = (
      <div className={styles.list}>
        {state.items.map((item) => (
          <Row key={item.id} item={item} now={now} timeZone={timeZone} onOpen={props.onOpenItem} />
        ))}
      </div>
    );
  }
  const showFooter = state.hasMore || state.olderStatus === 'error';
  return (
    <>
      <div className={styles.header}>
        <h2 className={styles.heading}>{t('office.notifications.title')}</h2>
        {state.unreadCount > 0 ? (
          <button
            type="button"
            className={styles.link}
            data-testid="notification-mark-all"
            onClick={() => props.onMarkAllRead()}
          >
            {t('office.notifications.mark_all_read')}
          </button>
        ) : null}
      </div>
      <div className={styles.body}>{body}</div>
      {showFooter ? (
        <div className={styles.footer}>
          {state.olderStatus === 'error' ? (
            <div data-testid="notification-older-error" className={styles.olderError}>
              <InlineError
                message="office.notifications.load_failed"
                onRetry={props.onRetryOlder}
              />
            </div>
          ) : (
            <button
              type="button"
              className={styles.link}
              data-testid="notification-show-older"
              onClick={() => props.onShowOlder()}
            >
              {t('office.notifications.show_older')}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}

// D16 (amended 2026-11-03): mount refresh, event and resync wiring. The hub's resync runs on every
// subscribed, the first join included (EZD-318), so it covers the gap between the mount fetch and the first join.
export function connectNotificationBell(store: NotificationStore, h: UserHandle): () => void {
  void store.refresh();
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

export function NotificationBell() {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const [store] = useState(() => createNotificationStore(notificationHttpApi));
  const [open, setOpen] = useState(false);
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);

  useEffect(() => connectNotificationBell(store, getRealtimeHub().user()), [store]);

  function onOpenChange(next: boolean) {
    setOpen(next);
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
          <NotificationPanelView
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
