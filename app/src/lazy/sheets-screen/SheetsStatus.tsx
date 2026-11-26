'use client';
// EZD-702a (S13 Layout "status bar has no Existing/Proposed toggle and shows Sheet, Size, Scale, Revision, zoom";
// board S13Sheets footer "Sheet A3.0 · 4 of 10", "Size 24 × 36", "Scale 3/4" = 1'-0"", "Revision Rev 1 draft", zoom on
// the right). Scale is a viewport's (EZD-703); a sheet with no viewports shows a dash, one whose viewports differ
// AS NOTED.
import type { ReactElement } from 'react';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import { sheetPosition } from '../../lib/sheets/sheet-set';
import { sheetScaleLabel } from '../../lib/sheets/viewport';
import { sizeLabel, useRevisionLabel } from './sheet-labels';
import { zoomPercent } from './SheetsCanvas';
import type { SheetsScreen } from './sheets-screen-store';
import { useSheetsScreen } from './use-sheets-screen';

export type SheetsStatusProps = { screen: SheetsScreen };

export function SheetsStatusStart({ screen }: SheetsStatusProps): ReactElement | null {
  const t = useT();
  const state = useSheetsScreen(screen);
  const set = state.sets.find((s) => s.kind === state.kind) ?? null;
  const rev = useRevisionLabel(set);
  if (set === null) return null;
  const pos = state.open === null ? null : sheetPosition(set.sheets, state.open);
  return (
    <>
      <StatusItem label="office.sheets.status.sheet">
        <span data-testid="status-sheet">
          {state.open === null || pos === null
            ? ''
            : `${state.open} · ${t('office.sheets.position', { index: pos.index, of: pos.of })}`}
        </span>
      </StatusItem>
      <StatusItem label="office.sheets.status.size">
        <span data-testid="status-sheet-size">{sizeLabel(set.size)}</span>
      </StatusItem>
      <StatusItem label="office.sheets.status.scale">
        <span data-testid="status-sheet-scale">{sheetScaleLabel(state.viewports) ?? t('office.sheets.scale_none')}</span>
      </StatusItem>
      <StatusItem label="office.sheets.status.revision">
        <span data-testid="status-sheet-revision">{rev}</span>
      </StatusItem>
    </>
  );
}

export function SheetsStatusEnd({ screen }: SheetsStatusProps): ReactElement {
  const state = useSheetsScreen(screen);
  return <span data-testid="status-sheet-zoom">{zoomPercent(state.zoom)}</span>;
}
