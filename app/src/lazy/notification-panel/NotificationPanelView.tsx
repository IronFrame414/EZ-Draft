'use client';

import { useT } from '../../lib/messages';
import { notificationIcon, notificationTitle } from '../../lib/notifications/kinds';
import type { NotificationItem } from '../../lib/notifications/kinds';
import type { NotificationState } from '../../lib/notifications/store';
import { formatNotificationTime } from '../../lib/notifications/time';
import { Icon } from '../../components/icon/Icon';
import { InlineError } from '../../components/states/InlineError';
import { NotificationListSkeleton } from '../../components/notifications/NotificationListSkeleton';
import styles from '../../components/notifications/NotificationBell.module.css';

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
      <span
        className={
          item.kind === 'sync_conflict' ? `${styles.iconBox} ${styles.iconBoxWarn}` : styles.iconBox
        }
      >
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
    body = <NotificationListSkeleton />;
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
