'use client';

// EZD-127 (04 Header card "N to review" pill (amber), "Hidden when N = 0"; Q-0037 (b) the text in the darker amber
// --ez-amber-text, the dot in the spec amber --ez-amber; mockups S14 and S20 `.rev`): the header's review pill.
// It opens the review list (ReviewList); the editor owns the open state and the count.
import type { Ref } from 'react';
import { useT } from '../../lib/messages';
import styles from './ReviewPill.module.css';

export type ReviewPillProps = {
  count: number;
  open: boolean;
  onToggle: () => void;
  listId?: string;
  ref?: Ref<HTMLButtonElement>;
};

export function ReviewPill({ count, open, onToggle, listId, ref }: ReviewPillProps) {
  const t = useT();
  if (!Number.isInteger(count) || count <= 0) return null;
  return (
    <button
      ref={ref}
      type="button"
      className={styles.pill}
      data-testid="review-pill"
      data-count={count}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      onClick={onToggle}
    >
      <span className={styles.dot} aria-hidden="true" />
      {t('office.review_list.pill', { count })}
    </button>
  );
}
