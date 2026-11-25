'use client';
// Status bar and its readout item (vault/plans/EZD-012b.md Step 2; 04 Status bar).
import type { ReactNode } from 'react';
import { useT } from '../../lib/messages';
import { Disclaimer } from '../disclaimer/Disclaimer';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './StatusBar.module.css';

export function StatusBar({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  return (
    <footer className={styles.bar} data-shell-region="status-bar">
      <div className={styles.start} data-status="start">
        {start}
      </div>
      <div className={styles.end} data-status="end">
        {end}
      </div>
      <Disclaimer placement="bar" />
    </footer>
  );
}

// EZD-1981 (AC-EZD-1981-1; audit F5): every cell stays on one line. A cell given `title` (its full value text) is
// one of the long ones that may be cut with an ellipsis when the bar runs out of room; the title is its tooltip.
export function StatusItem({
  label,
  title,
  children,
}: {
  label: MessageKey;
  title?: string;
  children?: ReactNode;
}) {
  const t = useT();
  const fit = title !== undefined;
  return (
    <div
      className={fit ? `${styles.item} ${styles.fit}` : styles.item}
      data-status-item=""
      data-status-fit={fit ? '' : undefined}
    >
      <span className={styles.label} data-status-label="">
        {t(label)}
      </span>
      <span className={styles.value} data-status-value="" title={title}>
        {children}
      </span>
    </div>
  );
}
