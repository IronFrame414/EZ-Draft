'use client';

// EZD-127 (04 Header card: the pill "Opens a review list: renders needing approval, unreviewed translations, field
// conflicts, field measurements, client comments, open code warnings, orphan flags"): the review list, one line per
// source with open items, in the 04 row's order, each with its count. Placed below the pill when it opens, as the
// project switcher panel (EZD-128); Escape, a press or focus outside, or a resize closes it. The editor loads the
// groups (the list is the only place the open items are read; the pill shows the stored count).
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactElement, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../lib/messages';
import { REVIEW_SOURCE_LABEL_KEYS, type ReviewGroup } from '../../lib/review/sources';
import styles from './ReviewList.module.css';

export type ReviewListState =
  { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; groups: readonly ReviewGroup[] };

export type ReviewListProps = {
  state: ReviewListState;
  anchorRef: RefObject<HTMLElement | null>;
  id?: string;
  onClose: () => void;
  onRetry: () => void;
};

const GAP = 8;
const MARGIN = 16;

export function ReviewList({
  state,
  anchorRef,
  id,
  onClose,
  onRetry,
}: ReviewListProps): ReactElement {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel === null) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    const top = rect ? rect.bottom + GAP : GAP;
    panel.style.top = `${top}px`;
    const right = rect ? Math.max(MARGIN, window.innerWidth - rect.right) : MARGIN;
    panel.style.right = `${right}px`;
    panel.style.maxHeight = `calc(100vh - ${top}px - ${MARGIN}px)`;
  }, [anchorRef]);

  useEffect(() => {
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node) ||
      !(
        (panelRef.current?.contains(target) ?? false) ||
        (anchorRef.current?.contains(target) ?? false)
      );
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
      anchorRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (outside(e.target)) onClose();
    };
    const onFocusIn = (e: FocusEvent) => {
      if (outside(e.target)) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <ReviewListPanel state={state} id={id} panelRef={panelRef} onRetry={onRetry} />,
    document.body,
  );
}

// The panel's markup alone (no portal, no effects).
export function ReviewListPanel({
  state,
  id,
  panelRef,
  onRetry,
}: {
  state: ReviewListState;
  id?: string;
  panelRef?: RefObject<HTMLDivElement | null>;
  onRetry: () => void;
}): ReactElement {
  const t = useT();
  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label={t('office.review_list.list')}
      className={styles.panel}
      data-testid="review-list"
      data-state={state.kind}
    >
      <div className={styles.title}>{t('office.review_list.list')}</div>
      {state.kind === 'loading' ? (
        <div className={styles.note} role="status">
          {t('office.review_list.loading')}
        </div>
      ) : state.kind === 'failed' ? (
        <div className={styles.note} role="alert">
          {t('office.review_list.load_failed')}
          <button type="button" className={styles.retry} onClick={onRetry}>
            {t('office.review_list.retry')}
          </button>
        </div>
      ) : state.groups.length === 0 ? (
        <div className={styles.note}>{t('office.review_list.empty')}</div>
      ) : (
        <ul className={styles.list}>
          {state.groups.map((g) => (
            <li
              key={g.source}
              className={styles.row}
              data-testid="review-group"
              data-source={g.source}
            >
              <span className={styles.dot} aria-hidden="true" />
              {g.href !== undefined ? (
                // EZD-1418: field measurements open Import review of the rooms sent from the phone.
                <a className={styles.label} href={g.href} data-testid="review-group-link">
                  {t(REVIEW_SOURCE_LABEL_KEYS[g.source])}
                </a>
              ) : (
                <span className={styles.label}>{t(REVIEW_SOURCE_LABEL_KEYS[g.source])}</span>
              )}
              <span className={styles.count}>{g.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
