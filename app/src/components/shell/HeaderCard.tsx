// Header card: the 60 px card at the top of the shell (04 Frame; vault/plans/EZD-011a.md Step 4).
// Server-safe: no state, no hooks, no client directive.
import type { ReactNode } from 'react';
import styles from './HeaderCard.module.css';

export function HeaderCard({
  children,
  'aria-label': ariaLabel,
}: {
  children?: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <header className={styles.header} aria-label={ariaLabel}>
      {children}
    </header>
  );
}
