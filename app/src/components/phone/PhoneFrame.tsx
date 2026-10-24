// Phone screen frame: header, scrolling main, footer (vault/plans/EZD-014a.md Step 3).
import type { ReactNode } from 'react';
import styles from './PhoneFrame.module.css';

export type PhoneFrameProps = { header?: ReactNode; children?: ReactNode; footer?: ReactNode };

export function PhoneFrame({ header, children, footer }: PhoneFrameProps) {
  return (
    <div className={styles.frame} data-phone-region="frame">
      {header}
      <main className={styles.main} data-phone-region="main">
        {children}
      </main>
      {footer}
    </div>
  );
}
