'use client';
// EZD-702a: the Sheets screen's parts behind one component, so the editor entry needs one lazy wrapper.
// EZD-716 (S13 Layout "Inspector: Issue checklist"): the canvas part docks the Sheets inspector at its right, with the
// code check results opened from the checklist over the sheet canvas (assumptions EZD-716: the editor shell's
// inspector place is not given to the Sheets screen yet).
import { useState, type ReactElement } from 'react';
import { SheetsCanvas } from './SheetsCanvas';
import { SheetsInspector } from './SheetsInspector';
import { SheetsPanel } from './SheetsPanel';
import { SheetsStatusEnd, SheetsStatusStart } from './SheetsStatus';
import { ChecklistReview } from './IssueChecklist';
import type { SheetsScreen } from './sheets-screen-store';
import styles from './SheetsScreen.module.css';

export type SheetsPartProps = {
  part: 'panel' | 'canvas' | 'start' | 'end';
  screen: SheetsScreen;
  canEdit?: boolean;
};

function SheetsWorkspace({ screen }: { screen: SheetsScreen }): ReactElement {
  const [reviewing, setReviewing] = useState(false);
  return (
    <div className={styles.workspace}>
      <div className={styles.workspaceMain}>
        <SheetsCanvas screen={screen} />
        {reviewing ? <ChecklistReview screen={screen} onClose={() => setReviewing(false)} /> : null}
      </div>
      <SheetsInspector screen={screen} reviewing={reviewing} onReview={setReviewing} />
    </div>
  );
}

export function SheetsPart({ part, screen, canEdit = false }: SheetsPartProps): ReactElement | null {
  if (part === 'panel') return <SheetsPanel screen={screen} canEdit={canEdit} />;
  if (part === 'canvas') return <SheetsWorkspace screen={screen} />;
  if (part === 'start') return <SheetsStatusStart screen={screen} />;
  return <SheetsStatusEnd screen={screen} />;
}
