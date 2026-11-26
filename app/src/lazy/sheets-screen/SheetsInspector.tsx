'use client';
// EZD-716 (S13 Layout "Inspector: Issue checklist; output settings; Revision log; Issue button"; board S13Sheets):
// the Sheets screen's inspector column. It holds the issue checklist; output settings, the revision log and the Issue
// button join it in their tickets (EZD-717, EZD-721).
import type { ReactElement } from 'react';
import { IssueChecklistView } from './IssueChecklist';
import type { SheetsScreen } from './sheets-screen-store';
import styles from './SheetsScreen.module.css';

export type SheetsInspectorProps = {
  screen: SheetsScreen;
  reviewing: boolean;
  onReview: (open: boolean) => void;
};

export function SheetsInspector({ screen, reviewing, onReview }: SheetsInspectorProps): ReactElement {
  return (
    <aside className={styles.inspector} data-testid="sheets-inspector">
      <IssueChecklistView screen={screen} reviewing={reviewing} onReview={onReview} />
    </aside>
  );
}
