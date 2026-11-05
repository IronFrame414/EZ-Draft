import type { ReactElement } from 'react';
import { Skeleton, SkeletonGroup } from '../states/Skeleton';
import styles from './NotificationBell.module.css';

export function NotificationListSkeleton(): ReactElement {
  return (
    <div data-testid="notification-loading" className={styles.list}>
      <SkeletonGroup count={3}>
        <div className={styles.skeletonRow}>
          <Skeleton height="56px" radius="md" />
        </div>
      </SkeletonGroup>
    </div>
  );
}
