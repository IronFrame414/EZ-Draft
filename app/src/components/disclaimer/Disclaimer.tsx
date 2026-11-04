'use client';
// The on-screen disclaimer line (vault/plans/EZD-136.md Steps 3-4; Q-0208; Q-0229; Q-0272 (a)).
// `bar` sits in a status bar and gives way first, with the full text in `title`; `page` is a footer line.
import type { JSX } from 'react';
import { useT } from '../../lib/messages';
import styles from './Disclaimer.module.css';

export type DisclaimerPlacement = 'bar' | 'page';

export function Disclaimer({ placement }: { placement: DisclaimerPlacement }): JSX.Element {
  const t = useT();
  const text = t('common.disclaimer');
  return (
    <p
      className={placement === 'bar' ? styles.bar : styles.page}
      data-testid="disclaimer"
      data-placement={placement}
      title={placement === 'bar' ? text : undefined}
    >
      {text}
    </p>
  );
}
