'use client';
// EZD-702a: the Sheets screen's parts behind one component, so the editor entry needs one lazy wrapper.
import type { ReactElement } from 'react';
import { SheetsCanvas } from './SheetsCanvas';
import { SheetsPanel } from './SheetsPanel';
import { SheetsStatusEnd, SheetsStatusStart } from './SheetsStatus';
import type { SheetsScreen } from './sheets-screen-store';

export type SheetsPartProps = {
  part: 'panel' | 'canvas' | 'start' | 'end';
  screen: SheetsScreen;
  canEdit?: boolean;
};

export function SheetsPart({ part, screen, canEdit = false }: SheetsPartProps): ReactElement | null {
  if (part === 'panel') return <SheetsPanel screen={screen} canEdit={canEdit} />;
  if (part === 'canvas') return <SheetsCanvas screen={screen} />;
  if (part === 'start') return <SheetsStatusStart screen={screen} />;
  return <SheetsStatusEnd screen={screen} />;
}
