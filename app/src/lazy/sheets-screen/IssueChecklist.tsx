'use client';
// EZD-716 (S13 Controls "Issue checklist row: Shows gate or warning status with detail; link (Review / Open) to fix.
// Green check, amber warning, red gate"; "Code check accept-with-note: Lists open code warnings; each can be accepted
// with a note"; board S13Sheets inspector; AC-EZD-716-1): the issue checklist. Its rows and the block come from the
// server (lib/sheets/issue-checklist); this only words them. Review on the code check row opens the code check results
// (EZD-612's list and its accept-with-note) over the sheet canvas; Open goes where the item is fixed (the plan, or the
// company title block). Wording off the board: assumptions EZD-716.
import { useEffect, useState, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { CODE_EDITIONS, type CodeEdition } from '../../lib/code-edition/editions';
import type { ChecklistRow, ChecklistRowId, RowStatus } from '../../lib/sheets/issue-checklist';
import { fieldLabel, type TitleBlockField } from '../../lib/title-block/title-block';
import type { MessageKey } from '../../server/messages/catalog';
import { CheckResultsPanel } from '../../editor/check/CheckResultsPanel';
import { acceptWarning, readCodeCheck, runCodeCheckNow, type CodeCheckOutcome } from '../../editor/check/check-client';
import { checkTime, type CodeCheckRun } from '../../editor/check/check-status';
import touch from '../../styles/touch.module.css';
import { useSheetsScreen } from './use-sheets-screen';
import type { SheetsScreen } from './sheets-screen-store';
import styles from './SheetsScreen.module.css';

const ICON: Record<RowStatus, 'check' | 'error' | 'report'> = { pass: 'check', warning: 'error', gate: 'report' };
const STATUS_CLASS: Record<RowStatus, string> = {
  pass: styles.checkPass ?? '',
  warning: styles.checkWarning ?? '',
  gate: styles.checkGate ?? '',
};

type T = ReturnType<typeof useT>;

function title(t: T, row: ChecklistRow): string {
  if (row.id === 'renders') return t('office.issue_checklist.row.renders', { count: Number(row.detail.count) });
  return t(`office.issue_checklist.row.${row.id}` as MessageKey);
}

function necLabel(t: T, edition: string): string {
  return (CODE_EDITIONS as readonly string[]).includes(edition)
    ? t(`office.issue_checklist.nec.${edition as CodeEdition}`)
    : edition;
}

function detail(t: T, row: ChecklistRow): string | null {
  const d = row.detail;
  switch (row.id) {
    case 'title_block': {
      const missing = (d.missing as readonly TitleBlockField[] | undefined) ?? [];
      return missing.length === 0
        ? t('office.issue_checklist.title_block.done')
        : t('office.issue_checklist.title_block.missing', {
            fields: missing.map((f) => t(fieldLabel(f))).join(', '),
          });
    }
    case 'code_check': {
      if (d.open === undefined) return t('office.issue_checklist.code_check.not_run');
      const time = checkTime(String(d.at));
      const open = Number(d.open);
      return open > 0
        ? t('office.issue_checklist.code_check.open', { time, count: open })
        : t('office.issue_checklist.code_check.reviewed', { time, count: Number(d.accepted) });
    }
    case 'orphan_flags':
      return t('office.issue_checklist.orphan_flags.detail', { open: Number(d.open), sheets: Number(d.sheets) });
    case 'load_calc': {
      if (d.state === 'none') return t('office.issue_checklist.load_calc.none');
      if (d.state === 'error') return t('office.issue_checklist.load_calc.error');
      const edition = necLabel(t, String(d.edition));
      if (d.service === '') return t('office.issue_checklist.load_calc.done_no_service', { edition });
      return d.state === 'over'
        ? t('office.issue_checklist.load_calc.over', { edition, service: Number(d.service) })
        : t('office.issue_checklist.load_calc.done', { edition, service: Number(d.service) });
    }
    case 'engineer_letter':
      return t('office.issue_checklist.engineer_letter.detail', { count: Number(d.count) });
    case 'renders':
      return t('office.issue_checklist.renders.detail');
  }
}

// Where Open goes: company fields live on the title block settings page; everything else is fixed on the plan.
function openHref(projectId: string, id: ChecklistRowId): string {
  return id === 'title_block' ? '/settings/title-block' : `/projects/${encodeURIComponent(projectId)}`;
}

type Review = {
  status: 'loading' | 'running' | 'failed' | 'ready';
  run: CodeCheckRun | null;
  changed: boolean;
  canRun: boolean;
  canAccept: boolean;
};

// Review: the code check results list (EZD-612) over the sheet canvas, as Check opens it over the plan. Accepting a
// warning with a note, or running the check again, reads the checklist again.
export function ChecklistReview({ screen, onClose }: { screen: SheetsScreen; onClose: () => void }): ReactElement {
  const [review, setReview] = useState<Review>({
    status: 'loading',
    run: null,
    changed: false,
    canRun: false,
    canAccept: false,
  });
  const took = (out: CodeCheckOutcome) =>
    setReview((r) =>
      out.ok
        ? {
            status: 'ready',
            run: out.answer.run,
            changed: out.answer.changedSinceRun ?? false,
            canRun: out.answer.canRun,
            canAccept: out.answer.canAccept,
          }
        : { ...r, status: 'failed' },
    );
  useEffect(() => {
    let on = true;
    void readCodeCheck(screen.projectId).then((out) => {
      if (on) took(out);
    });
    return () => {
      on = false;
    };
  }, [screen.projectId]);
  return (
    <CheckResultsPanel
      status={review.status}
      run={review.run}
      changedSinceRun={review.changed}
      canRun={review.canRun}
      canAccept={review.canAccept}
      objectName={() => null}
      onGoTo={() => window.location.assign(openHref(screen.projectId, 'orphan_flags'))}
      onRun={() => {
        setReview((r) => ({ ...r, status: 'running' }));
        void runCodeCheckNow(screen.projectId).then((out) => {
          took(out);
          void screen.reloadChecklist();
        });
      }}
      onAccept={async (item) => {
        if (review.run === null) return false;
        const out = await acceptWarning(screen.projectId, { runId: review.run.runId, ...item });
        if (!out.ok) return false;
        took(out);
        void screen.reloadChecklist();
        return true;
      }}
      onClose={onClose}
    />
  );
}

export function IssueChecklistView({
  screen,
  reviewing,
  onReview,
}: {
  screen: SheetsScreen;
  reviewing: boolean;
  onReview: (open: boolean) => void;
}): ReactElement {
  const t = useT();
  const state = useSheetsScreen(screen);
  const checklist = state.checklist;

  return (
    <section className={styles.checklist} data-testid="issue-checklist" aria-labelledby="issue-checklist-title">
      <h2 className={styles.checklistTitle} id="issue-checklist-title">
        {t('office.issue_checklist.title')}
      </h2>
      {checklist === null ? (
        <p className={styles.checklistNote} role="status" data-testid="issue-checklist-load">
          {state.checklistLoad === 'failed' ? t('office.issue_checklist.failed') : t('office.issue_checklist.loading')}
        </p>
      ) : (
        <>
          <p className={styles.checklistNote}>
            {t('office.issue_checklist.summary', {
              count: Number(checklist.rows.find((r) => r.id === 'orphan_flags')?.detail.sheets ?? 0),
            })}
          </p>
          <ul className={styles.checklistRows}>
            {checklist.rows.map((row) => (
              <li
                key={row.id}
                className={styles.checklistRow}
                data-testid={`issue-check-${row.id}`}
                data-status={row.status}
              >
                <span className={`${styles.checkIcon} ${STATUS_CLASS[row.status]}`}>
                  <Icon name={ICON[row.status]} size={16} />
                  <span className={styles.srOnly}>{t(`office.issue_checklist.status.${row.status}`)}</span>
                </span>
                <span className={styles.checkText}>
                  <span className={styles.checkTitle}>{title(t, row)}</span>
                  <span className={styles.checkDetail}>{detail(t, row)}</span>
                </span>
                {row.link === 'review' ? (
                  <button
                    type="button"
                    className={`${styles.checkLink} ${touch.target}`}
                    data-testid={`issue-check-${row.id}-review`}
                    aria-expanded={reviewing}
                    onClick={() => onReview(!reviewing)}
                  >
                    {t('office.issue_checklist.review')}
                  </button>
                ) : row.link === 'open' ? (
                  <a
                    className={`${styles.checkLink} ${touch.target}`}
                    href={openHref(screen.projectId, row.id)}
                    data-testid={`issue-check-${row.id}-open`}
                  >
                    {t('office.issue_checklist.open')}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
          <p className={styles.checklistNote} data-testid="issue-checklist-block" role="status">
            {checklist.blocked ? t('office.issue_checklist.blocked') : t('office.issue_checklist.warnings_only')}
          </p>
        </>
      )}
    </section>
  );
}
