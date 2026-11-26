'use client';
// EZD-717 (S13 Controls "Issue Rev n | Inspector footer (primary) | Runs the code check, generates the PDF, freezes
// the version, numbers the revision, updates revision blocks. Result shows the PDF link with Copy link. | Disabled
// while a gate is open. Hidden without Issue permit sets (Rev 0) or Issue revisions (Rev 1+)"; S13 States "Generating
// PDF: background job; Issue button shows progress until the PDF link appears"; board S13Sheets inspector footer
// "Issue Rev 1", "Copy link", the PDF's file name): the Issue button. The state is the screen store's (issue()).
// Wording off the board: vault/build/assumptions/EZD-717.md.
import { useState, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import { useSheetsScreen } from './use-sheets-screen';
import type { SheetsScreen } from './sheets-screen-store';
import styles from './SheetsScreen.module.css';

export function IssueButton({ screen }: { screen: SheetsScreen }): ReactElement | null {
  const t = useT();
  const state = useSheetsScreen(screen);
  const issue = state.issue;
  const [copied, setCopied] = useState(false);
  if (issue.load !== 'ready' || !issue.canIssue) return null;
  const run = issue.run;
  const working = run.kind === 'issuing' || run.kind === 'generating';
  const blocked = state.checklist === null || state.checklist.blocked;
  const label =
    run.kind === 'issuing'
      ? t('office.issue.issuing', { n: run.rev })
      : run.kind === 'generating'
        ? t('office.issue.generating', { percent: run.percent })
        : t('office.issue.button', { n: issue.nextRev });

  const copy = (link: string) => {
    const clip = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    void clip?.writeText(link).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <section className={styles.issue} data-testid="issue-footer">
      <button
        type="button"
        className={`${styles.issueButton} ${touch.target}`}
        data-testid="issue-button"
        disabled={blocked || working}
        aria-busy={working}
        onClick={() => {
          setCopied(false);
          void screen.issue();
        }}
      >
        <Icon name="verified_user" size={18} />
        {label}
      </button>
      {run.kind === 'generating' ? (
        <progress
          className={styles.issueProgress}
          data-testid="issue-progress"
          max={100}
          value={run.percent}
          aria-label={label}
        />
      ) : null}
      {run.kind === 'done' ? (
        <div className={styles.issueResult} role="status" data-testid="issue-result">
          <span>{t('office.issue.issued', { n: run.rev })}</span>
          {run.file !== null ? (
            <>
              <a className={styles.issueFile} href={run.file.link} data-testid="issue-pdf-link">
                {run.file.name}
              </a>
              <button
                type="button"
                className={`${styles.checkLink} ${touch.target}`}
                data-testid="issue-copy-link"
                onClick={() => copy(run.file!.link)}
              >
                <Icon name="content_copy" size={16} />
                {copied ? t('office.issue.copied') : t('office.issue.copy_link')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {run.kind === 'pdf_failed' ? (
        <p className={styles.checklistNote} role="alert" data-testid="issue-pdf-failed">
          {t('office.issue.issued', { n: run.rev })} · {t('office.issue.pdf_failed')}
        </p>
      ) : null}
      {run.kind === 'blocked' ? (
        <p className={styles.checklistNote} role="alert" data-testid="issue-blocked">
          {t('office.issue_checklist.blocked')}
        </p>
      ) : null}
      {run.kind === 'unsaved' ? (
        <p className={styles.checklistNote} role="alert" data-testid="issue-unsaved">
          {t('office.issue.unsaved')}
        </p>
      ) : null}
      {run.kind === 'failed' ? (
        <p className={styles.checklistNote} role="alert" data-testid="issue-failed">
          {t('office.issue.failed')}
        </p>
      ) : null}
    </section>
  );
}
