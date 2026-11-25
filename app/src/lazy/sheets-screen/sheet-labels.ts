// EZD-702a: labels the Sheets screen's parts share.
import type { SheetSize } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import { draftRevision, type Sheet, type SheetMarks, type SheetSetSummary } from '../../lib/sheets/sheet-set';

// "24 × 36" as on the board's set line and status bar.
export function sizeLabel(size: SheetSize): string {
  return size.replace('x', ' × ');
}

// Open items (EZD-716) and Δ tags (EZD-718) are not worked out yet; a sheet that carries them shows them.
export function sheetMarks(sheet: Sheet & Partial<SheetMarks>): SheetMarks {
  return { openItems: sheet.openItems ?? 0, delta: sheet.delta ?? null };
}

// "Rev 0 draft" for the revision the set is drafting; "Draft" while the number is unknown (EZD-717).
export function useRevisionLabel(set: SheetSetSummary | null): string {
  const t = useT();
  if (set === null) return '';
  const rev = draftRevision(set);
  return rev === null ? t('office.sheets.draft') : t('office.sheets.rev_draft', { n: rev });
}
