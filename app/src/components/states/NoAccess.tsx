'use client';
// EZD-102 Step 11 (vault/plans/EZD-102.md; AC-EZD-102-3): what a page shows in place when the user may not
// open it (Q-0214: "You don't have access to this. Ask your supervisor."; Q-0232: no redirect). Same
// surface as the S01 banner (OfflineBannerView), no icon. Placement is each screen's.
import { useT } from '../../lib/messages';
import styles from './banner.module.css';

export function NoAccess() {
  const t = useT();
  return (
    <div
      role="status"
      data-state="no-access"
      data-testid="no-access"
      className={`${styles.banner} ${styles.offline}`}
    >
      <span className={styles.text}>{t('common.no_access')}</span>
    </div>
  );
}
