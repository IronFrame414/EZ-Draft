'use client';
// EZD-717 (S13 Layout "Inspector: ... Revision log"; Data shown "permit_revision: rev_no, issued_at, description";
// board S13Sheets "Revision log | Rev 0 | 09/29/26 | Permit set | Issued"): the permit set's issued revisions, oldest
// first. The draft row and its changed sheets (board "Rev 1 | A3.0, A4.0 | Draft") come with EZD-718's clouds.
import type { ReactElement } from 'react';
import { useT } from '../../lib/messages';
import { revisionDate, revisionDescription } from '../../lib/sheets/revisions';
import { useSheetsScreen } from './use-sheets-screen';
import type { SheetsScreen } from './sheets-screen-store';
import styles from './SheetsScreen.module.css';

export function RevisionLog({ screen }: { screen: SheetsScreen }): ReactElement | null {
  const t = useT();
  const issue = useSheetsScreen(screen).issue;
  if (issue.load !== 'ready') return null;
  const rows = [...issue.revisions].sort((a, b) => a.revNo - b.revNo);
  return (
    <section className={styles.checklist} data-testid="revision-log" aria-labelledby="revision-log-title">
      <h2 className={styles.checklistTitle} id="revision-log-title">
        {t('office.revision_log.title')}
      </h2>
      {rows.length === 0 ? (
        <p className={styles.checklistNote}>{t('office.revision_log.empty')}</p>
      ) : (
        <ul className={styles.checklistRows}>
          {rows.map((r) => (
            <li key={r.id} className={styles.revisionRow} data-testid={`revision-${r.revNo}`}>
              <span className={styles.checkTitle}>{t('office.revision_log.rev', { n: r.revNo })}</span>
              <span className={styles.checkDetail}>{revisionDate(r.issuedAt)}</span>
              <span className={styles.checkDetail}>{revisionDescription(r)}</span>
              <span className={styles.revisionStatus}>{t('office.revision_log.issued')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
