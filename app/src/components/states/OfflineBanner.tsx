'use client';
// "Offline" banner (vault/plans/EZD-015a.md Step 4; S01 banner). Placement is each screen's.
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageParams } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './banner.module.css';

export type OfflineBannerProps = { message?: MessageKey; params?: MessageParams };

export function OfflineBannerView({ message = 'common.offline', params }: OfflineBannerProps) {
  const t = useT();
  return (
    <div role="status" data-state="offline" className={`${styles.banner} ${styles.offline}`}>
      <span className={styles.icon}>
        <Icon name="cloud_off" size={20} />
      </span>
      <span className={styles.text}>{t(message, params)}</span>
    </div>
  );
}

export function OfflineBanner(props: OfflineBannerProps) {
  return useOnline() ? null : <OfflineBannerView {...props} />;
}
