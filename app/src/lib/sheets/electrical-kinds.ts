// EZD-708b (phase-07 EZD-708b "E1.0 electrical plan sheet from the model; EC verification note on the sheet"; 09a and
// S06 "Every electrical sheet carries the note that the electrical contractor of record verifies the design"; Q-0763
// "E1.0 is the layout with devices and symbols for the first floor or area; E2.0, E3.0 and on are added for each
// further floor ... the panel schedule and load calc go on the sheet after the last layout sheet"): which sheets are
// electrical and the EC verification note they print. The note is drawing lists in paper inches (x right, y up), like
// the fixture schedule (fixture-schedule-table.ts), so the sheet preview (sheetSvg) and the PDF draw the same note at
// scale 1 (R7). It is the sheet's general notes block, at the bottom of the notes column, clear of the viewports and
// of the symbol key at the column's top (vault/build/assumptions/EZD-708b.md). No DOM.
import {
  DRAWING_FONTS,
  SHEET_DIMENSION_PT,
  SHEET_NOTE_PT,
  measureTextPt,
  type DrawingList,
  type SheetArea,
  type SheetSize,
} from '@ezdraft/geometry';
import { electricalLayoutFloor, sheetNotesColumn } from './sheet-set';

export { ELECTRICAL_PLAN_SHEET, electricalLayoutFloor, panelSheetNumber } from './sheet-set';

// An electrical sheet's number: E1.0, E2.0 and on (Q-0763 numbers each trade's sheets in whole steps).
const ELECTRICAL_NUMBER = /^E[1-9]\d*\.0$/;

/** Whether a sheet is an electrical sheet (a layout sheet or the panel sheet). */
export function isElectricalSheet(number: string | undefined): boolean {
  return number !== undefined && ELECTRICAL_NUMBER.test(number);
}

/** Whether a sheet is an electrical layout sheet (E1.0, and E2.0 ... for further floors) for a model with these floors. */
export function isElectricalLayoutSheet(number: string | undefined, floorCount: number): boolean {
  return number !== undefined && electricalLayoutFloor(number, floorCount) !== null;
}

// Josh's wording (vault/build/assumptions/EZD-708b.md Settled, Q-0803), in the sheet's general notes block. English
// only, like everything printed on a permit sheet (S13 Decision 7).
export const EC_NOTE_TEXT =
  'Electrical design to be verified by the electrical contractor of record.';
// The block's heading, as the cover's notes (lazy/sheets-screen/cover-sheet.ts).
export const EC_NOTE_HEADING = 'GENERAL NOTES';
export const EC_NOTE_PT = SHEET_NOTE_PT;
export const EC_NOTE_HEADING_PT = SHEET_DIMENSION_PT;
export const EC_NOTE_OBJECT_ID = 'ec-note';
// A line's height as a share of its text size.
export const EC_NOTE_LEADING = 1.4;

const MONO = DRAWING_FONTS['dm-mono-400'];
const widthIn = (text: string, pt: number) => measureTextPt(MONO, text, pt) / 72;

// The words of `text` in lines no wider than `maxIn` at `pt` (a word longer than the line stands alone).
export function wrapLines(text: string, maxIn: number, pt: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && widthIn(next, pt) > maxIn) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
}

// One printed line: a drawing list in paper inches holding one text, and its exact rectangle on the sheet (paper
// inches, y down). The text is the list's only point, so sheetSvg centres it in the rectangle, which is its own width.
export type EcNoteLine = { list: DrawingList; area: SheetArea };

function lineOf(text: string, pt: number, x: number, y: number): EcNoteLine {
  const widthPt = measureTextPt(MONO, text, pt);
  return {
    list: {
      level: '',
      items: [
        {
          layer: 'rooms',
          objectId: EC_NOTE_OBJECT_ID,
          kind: 'text',
          text,
          font: 'dm-mono-400',
          sizePt: pt,
          widthPt,
          at: { x: 0, y: 0 },
          rotationDeg: 0,
          align: 'center',
        },
      ],
      omitted: [],
    },
    area: { x, y, width: widthPt / 72, height: (pt / 72) * EC_NOTE_LEADING },
  };
}

// The EC note of an electrical sheet, heading first, at the bottom of the notes column left of the title block (the
// symbol key stands at its top); null on any other sheet.
export function ecNoteFor(sheet: string | undefined, size: SheetSize): EcNoteLine[] | null {
  if (!isElectricalSheet(sheet)) return null;
  const column = sheetNotesColumn(size);
  const rows: [string, number][] = [
    [EC_NOTE_HEADING, EC_NOTE_HEADING_PT],
    ...wrapLines(EC_NOTE_TEXT, column.width, EC_NOTE_PT).map((l): [string, number] => [
      l,
      EC_NOTE_PT,
    ]),
  ];
  let y = column.y + column.height - rows.reduce((h, [, pt]) => h + (pt / 72) * EC_NOTE_LEADING, 0);
  return rows.map(([text, pt]) => {
    const line = lineOf(text, pt, column.x, y);
    y += line.area.height;
    return line;
  });
}
