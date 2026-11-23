// EZD-728 (09h Sheet set rules "A0.0 Cover + index + key"; phase-07 EZD-728 "Auto-built cover: project block, sheet
// index from the set, scope of work, general notes and the profile's required notes (EZD-714), and the key when
// placement is cover only"; AC-EZD-728-1; vault/build/assumptions.md EZD-728): what the cover sheet prints and where,
// in paper inches (y down). Pure, so the layout is tested without drawing.
// - Left, in the drawing area: the project block, SCOPE OF WORK, then the SHEET INDEX, one row per sheet of the set in
//   set order (A0.0 included), so a sheet added to the set is a row on the cover.
// - Right, in the notes column (board S13Sheets): the symbol key on top when the set's placement is "On cover only"
//   (sheet-key.ts), then GENERAL NOTES and REQUIRED NOTES, numbered and wrapped to the column.
// Sheet text, English only (S13 Decision 7), so these are sheet words, not catalog messages.
// The Q-0787 work-area plan on A0.0 is EZD-619 (phase 46), not this ticket.
import type { SheetSize } from '@ezdraft/geometry';
import type { ProjectTitleBlock } from '../../lib/title-block/sheet-title-block';
import {
  sheetDrawingArea,
  sheetFrame,
  sheetNotesColumn,
  type SetNotes,
  type Sheet,
} from '../../lib/sheets/sheet-set';
import { KEY_HEAD_IN, KEY_LABEL_PT, KEY_PAD_IN, KEY_TITLE_PT } from './SymbolKey';

export const COVER_TITLES = {
  index: 'SHEET INDEX',
  scope: 'SCOPE OF WORK',
  general: 'GENERAL NOTES',
  required: 'REQUIRED NOTES',
} as const;

// Project block labels before each filled field.
export const COVER_LABELS = { owner: 'OWNER', parcel: 'PARCEL', code: 'CODE' } as const;

const PT = 1 / 72;
// 09h: notes at the 3/32" minimum (6.75 pt), titles one size up; the project name is the cover's largest text.
export const COVER_TEXT_PT = KEY_LABEL_PT;
export const COVER_TITLE_PT = KEY_TITLE_PT;
export const COVER_NAME_PT = 18;
// Line pitch within a note and the extra gap between notes (board S13Sheets: 11 and 18 units at a 7.5 font).
export const COVER_LINE_IN = COVER_TEXT_PT * PT * 1.5;
export const COVER_NOTE_GAP_IN = COVER_TEXT_PT * PT;
// A mono glyph is about 0.6 em wide; used to wrap note text to its box.
const GLYPH_EM = 0.6;
// The left blocks take this share of the drawing area's width.
export const COVER_LEFT_SHARE = 0.45;

// Words wrapped to at most `chars` characters a line; a longer word stands on its own line.
export function wrapText(text: string, chars: number): string[] {
  const words = text.trim().split(/\s+/).filter((w) => w !== '');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line === '') line = w;
    else if (line.length + 1 + w.length <= chars) line = `${line} ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

// One printed row: an optional lead (a note number or a sheet number) and its wrapped lines.
export type CoverRow = { lead: string | null; lines: string[]; y: number };
export type CoverBlockId = 'project' | 'scope' | 'index' | 'general' | 'required';
export type CoverBlock = {
  id: CoverBlockId;
  // Null for the project block, which has no title line.
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  // The x of a row's lead and of its text.
  leadX: number;
  textX: number;
  rows: CoverRow[];
};
export type CoverName = { text: string; x: number; y: number };
export type CoverLayout = { name: CoverName | null; blocks: CoverBlock[] };

export type CoverInput = {
  size: SheetSize;
  sheets: readonly Pick<Sheet, 'number' | 'title'>[];
  titleBlock: ProjectTitleBlock | null;
  notes: SetNotes | null;
  // Rows of the symbol key drawn at the top of the notes column; null when the cover has no key.
  keyHeight: number | null;
};

// The cover's sheet index: every sheet of the set, in set order.
export function coverIndex(sheets: readonly Pick<Sheet, 'number' | 'title'>[]): { number: string; title: string }[] {
  return sheets.map(({ number, title }) => ({ number, title }));
}

function charsFor(width: number): number {
  return Math.max(8, Math.floor(width / (GLYPH_EM * COVER_TEXT_PT * PT)));
}

// Lays rows out from `top` (the line under the title) and returns the block.
function block(
  id: CoverBlockId,
  title: string | null,
  x: number,
  y: number,
  width: number,
  leadWidth: number,
  items: readonly { lead: string | null; text: string }[],
): CoverBlock {
  const leadX = x + KEY_PAD_IN;
  const textX = leadX + leadWidth;
  const chars = charsFor(x + width - KEY_PAD_IN - textX);
  let cursor = y + (title === null ? KEY_PAD_IN : KEY_HEAD_IN + KEY_PAD_IN);
  const rows: CoverRow[] = [];
  for (const item of items) {
    const lines = wrapText(item.text, chars);
    if (lines.length === 0) continue;
    rows.push({ lead: item.lead, lines, y: cursor + COVER_LINE_IN / 2 });
    cursor += lines.length * COVER_LINE_IN + COVER_NOTE_GAP_IN;
  }
  return { id, title, x, y, width, height: cursor - y + KEY_PAD_IN - COVER_NOTE_GAP_IN, leadX, textX, rows };
}

export function coverLayout({ size, sheets, titleBlock, notes, keyHeight }: CoverInput): CoverLayout {
  const { margin } = sheetFrame(size);
  const area = sheetDrawingArea(size);
  const col = sheetNotesColumn(size);
  const gap = margin;
  const blocks: CoverBlock[] = [];

  // Left: project name, project block, scope of work, sheet index.
  const lx = area.x + margin;
  const lw = area.width * COVER_LEFT_SHARE;
  let ly = col.y;
  let name: CoverName | null = null;
  if (titleBlock !== null) {
    name = { text: titleBlock.projectName, x: lx, y: ly + COVER_NAME_PT * PT };
    ly += COVER_NAME_PT * PT * 1.5;
    const fields: { lead: string | null; text: string }[] = [];
    if (titleBlock.address !== null) fields.push({ lead: null, text: titleBlock.address });
    if (titleBlock.owner !== null) fields.push({ lead: null, text: `${COVER_LABELS.owner}: ${titleBlock.owner}` });
    if (titleBlock.parcel !== null) fields.push({ lead: null, text: `${COVER_LABELS.parcel}: ${titleBlock.parcel}` });
    if (titleBlock.codeEdition !== null)
      fields.push({ lead: null, text: `${COVER_LABELS.code}: ${titleBlock.codeEdition}` });
    if (fields.length > 0) {
      const b = block('project', null, lx, ly, lw, 0, fields);
      blocks.push(b);
      ly += b.height + gap;
    }
    if (titleBlock.scopeOfWork !== null) {
      const b = block('scope', COVER_TITLES.scope, lx, ly, lw, 0, [{ lead: null, text: titleBlock.scopeOfWork }]);
      blocks.push(b);
      ly += b.height + gap;
    }
  }
  const index = coverIndex(sheets).map((s) => ({ lead: s.number, text: s.title }));
  blocks.push(block('index', COVER_TITLES.index, lx, ly, lw, 0.6, index));

  // Right: below the key, the general notes then the profile's required notes.
  let ry = col.y + (keyHeight === null ? 0 : keyHeight + gap);
  const numbered = (list: readonly { text: string }[]) =>
    list.map((n, i) => ({ lead: `${i + 1}.`, text: n.text }));
  if (notes !== null && notes.general.length > 0) {
    const b = block('general', COVER_TITLES.general, col.x, ry, col.width, 0.25, numbered(notes.general));
    blocks.push(b);
    ry += b.height + gap;
  }
  if (notes !== null && notes.required.length > 0)
    blocks.push(block('required', COVER_TITLES.required, col.x, ry, col.width, 0.25, numbered(notes.required)));

  return { name, blocks };
}

// The notes answer, or null when it is not one (a failed or foreign answer leaves the cover without notes).
export function parseSetNotes(body: unknown): SetNotes | null {
  if (typeof body !== 'object' || body === null) return null;
  const { general, required } = body as { general?: unknown; required?: unknown };
  const ok = (v: unknown): v is SetNotes['general'] =>
    Array.isArray(v) && v.every((n) => typeof n === 'object' && n !== null && typeof (n as { text?: unknown }).text === 'string');
  return ok(general) && ok(required) ? { general, required } : null;
}
