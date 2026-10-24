'use client';

// Wordmark link (vault/plans/EZD-011b.md Step 2; S03 wordmark).
import Link from 'next/link';
import { useT } from '../../lib/messages';
import styles from './Wordmark.module.css';

export function Wordmark({ href }: { href: string }) {
  const t = useT();
  return (
    <Link href={href} className={styles.wordmark}>
      <span>{t('office.header.wordmark_ez')}</span>
      <span className={styles.accent}>{t('office.header.wordmark_draft')}</span>
    </Link>
  );
}
