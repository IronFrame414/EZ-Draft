// EZD-299 Build step 7 (vault/plans/EZD-299.md section 3 C6, C11; Decided D-Banner, D-CSS; Q-0511 a; board S03b
// banner, P1-P3): the editor banner under the header card when changes of the open project could not be saved.
// Pure; the editor decides when it shows.
import type { ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import styles from './ConflictBanner.module.css';

export type ConflictBannerProps = {
  count: number;
  projectName: string;
  othersSaved: boolean;
  expanded: boolean;
  onReview(): void;
};

export function ConflictBanner({
  count,
  projectName,
  othersSaved,
  expanded,
  onReview,
}: ConflictBannerProps): ReactElement {
  const t = useT();
  return (
    <div role="status" className={styles.banner} data-testid="conflict-banner">
      <span className={styles.icon}>
        <Icon name="sync_problem" size={20} />
      </span>
      <span className={styles.title} data-testid="conflict-banner-title">
        {t('office.conflicts.banner.title', { count, project: projectName })}
      </span>
      {othersSaved ? (
        <span className={styles.saved} data-testid="conflict-banner-saved">
          {t('office.conflicts.banner.others_saved')}
        </span>
      ) : null}
      <span className={styles.spacer} />
      <button
        type="button"
        className={`${styles.button} ${touch.target}`}
        data-testid="conflict-review"
        aria-expanded={expanded}
        aria-controls="changes-not-saved"
        onClick={() => onReview()}
      >
        {t('office.conflicts.banner.review')}
      </button>
    </div>
  );
}
