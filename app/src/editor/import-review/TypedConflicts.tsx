'use client';

// EZD-310 (S02 Controls "Typed or laser input: Type or laser a length; it overrides the scan. Accepts 12'6",
// 12' 6 1/2", 150", 12.5'. Laser in keyboard mode types into the focused field", "Scan reads: Display only",
// Conflict list ("Typed wins. This creates") "Lists every conflict the typed value creates ... Red icon for errors,
// amber for warnings. Click a line to zoom to it"; board S02 inspector): the typed and scan fields side by side and
// the conflict list. The typed value commits on Enter (a keyboard-mode laser ends with Enter) and when the field
// loses focus; an empty field takes the typed value off.
import { useState, type ReactElement } from 'react';
import { formatLength, parseLength, DETAIL_DISPLAY_DENOMINATOR } from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { itemLabel, type ReviewItem } from '../../lib/imports/review';
import { type Conflict, type Corner } from '../../lib/imports/review-conflicts';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './ImportReview.module.css';

const CORNER_WORD: Record<Corner, MessageKey> = {
  northeast: 'office.review.corner_northeast',
  northwest: 'office.review.corner_northwest',
  southeast: 'office.review.corner_southeast',
  southwest: 'office.review.corner_southwest',
};

/** Amounts show to 1/16" (a 5/8" gap must not read 1/2"). */
export const amount = (inches: number): string => formatLength(inches, DETAIL_DISPLAY_DENOMINATOR);

export function TypedField({
  item,
  typed,
  scan,
  disabled,
  onCommit,
}: {
  item: ReviewItem;
  /** The typed value now kept (in), or null. */
  typed: number | null;
  /** What the scan reads, as shown. */
  scan: string;
  disabled: boolean;
  /** A new typed value (in), or null to take it off. */
  onCommit: (inches: number | null) => void;
}): ReactElement {
  const t = useT();
  const shown = typed === null ? '' : amount(typed);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  const [refused, setRefused] = useState(false);
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
    setRefused(false);
  }
  const commit = () => {
    if (text.trim() === '') {
      setRefused(false);
      if (typed !== null) onCommit(null);
      return;
    }
    const r = parseLength(text, item.type === 'wall' ? 'wall_room' : 'positive');
    if (!r.ok) {
      setRefused(true);
      return;
    }
    setRefused(false);
    if (r.inches !== typed) onCommit(r.inches);
    else setText(shown);
  };
  return (
    <>
      <div className={styles.fieldPair}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('office.review.typed')}</span>
          <input
            className={styles.typedInput}
            data-testid="import-review-typed"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            value={text}
            disabled={disabled}
            aria-invalid={refused || undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>{t('office.review.scan_reads')}</span>
          <span className={styles.scanValue} data-testid="import-review-scan">
            {scan}
          </span>
        </div>
      </div>
      {refused ? (
        <p className={styles.typedRefused} role="alert" data-testid="import-review-typed-refused">
          {t('office.length.refused')}
        </p>
      ) : null}
    </>
  );
}

export function ConflictList({
  conflicts,
  items,
  onZoom,
}: {
  conflicts: readonly Conflict[];
  /** The items, for opening names. */
  items: readonly ReviewItem[];
  onZoom: (c: Conflict) => void;
}): ReactElement | null {
  const t = useT();
  if (conflicts.length === 0) return null;
  return (
    <section className={styles.conflicts} data-testid="import-review-conflicts">
      <h3 className={styles.sectionTitle}>{t('office.review.typed_wins')}</h3>
      <ul className={styles.conflictList}>
        {conflicts.map((c) => {
          const item = items.find((i) => i.id === c.id);
          const text =
            c.kind === 'gap'
              ? t('office.review.conflict_gap', {
                  gap: amount(c.inches),
                  corner: t(CORNER_WORD[c.corner]),
                })
              : t('office.review.conflict_offset', {
                  name: item ? itemLabel(item, items) : c.id,
                  amount: amount(c.inches),
                });
          return (
            <li key={`${c.kind}:${c.id}`}>
              <button
                type="button"
                className={styles.conflictRow}
                data-testid="import-review-conflict"
                data-severity={c.severity}
                data-kind={c.kind}
                data-id={c.id}
                onClick={() => onZoom(c)}
              >
                <span className={c.severity === 'error' ? styles.conflictError : styles.conflictWarning}>
                  <Icon name={c.severity === 'error' ? 'error' : 'report'} size={18} />
                </span>
                <span>{text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
