'use client';
// Status bar and its readout item (vault/plans/EZD-012b.md Step 2; 04 Status bar).
import type { ReactNode } from 'react';
import { useT } from '../../lib/messages';
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
    </footer>
  );
}

export function StatusItem({ label, children }: { label: MessageKey; children?: ReactNode }) {
  const t = useT();
  return (
    <div className={styles.item} data-status-item="">
      <span className={styles.label} data-status-label="">
        {t(label)}
      </span>
      <span className={styles.value} data-status-value="">
        {children}
      </span>
    </div>
  );
}
