// Phone header: title, optional subtitle and slots (vault/plans/EZD-014a.md Step 4).
import { Fragment, type ReactNode } from 'react';
import styles from './PhoneHeader.module.css';

export type PhoneHeaderProps = {
  title: string;
  subtitle?: readonly ReactNode[];
  start?: ReactNode;
  end?: ReactNode;
  below?: ReactNode;
};

export function PhoneHeader({ title, subtitle, start, end, below }: PhoneHeaderProps) {
  const parts = (subtitle ?? []).filter(
    (p) => p !== null && p !== undefined && typeof p !== 'boolean' && p !== '',
  );
  const hasTop = (start !== undefined && start !== null) || (end !== undefined && end !== null);
  return (
    <header className={styles.header} data-phone-region="header">
      {hasTop ? (
        <div className={styles.top} data-phone-header-top="">
          {start}
          <span className={styles.spacer}></span>
          {end}
        </div>
      ) : null}
      <div className={styles.titleBlock}>
        <h1 className={styles.title} data-phone-title="">
          {title}
        </h1>
        {parts.length > 0 ? (
          <p className={styles.subtitle} data-phone-subtitle="">
            {parts.map((part, i) => (
              <Fragment key={i}>
                {i > 0 ? <span aria-hidden="true"> · </span> : null}
                {part}
              </Fragment>
            ))}
          </p>
        ) : null}
      </div>
      {below}
    </header>
  );
}
