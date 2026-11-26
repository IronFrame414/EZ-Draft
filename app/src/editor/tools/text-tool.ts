// EZD-216 (S03 rail "Text (T) | Click to place a note or label; leader optional | Prints at fixed paper size at any
// scale"; Q-0683 (a) "a click opens a text box in place on the canvas (Enter commits, Esc cancels); a
// press-drag-release draws a leader from the press point (arrow end) to the release point (the note)"; Q-0687 (b)
// several lines, Shift+Enter, at most 500 characters; S03 canvas "Double-click | Edits the object in place (e.g.
// dimension text, text ...)"; 00g "Dimension override" (clearing it returns to the measured value); AC-EZD-216-3, -5):
// the Text tool's steps and the in-place text box's commit. Pure: no React, no DOM, no model writes.
import {
  NOTE_PAPER_SIZE,
  TEXT_MAX_CHARS,
  DIMENSION_OVERRIDE_MAX_CHARS,
  overrideTextSchema,
  noteTextSchema,
  type DimensionData,
  type ObjectStatus,
  type Point,
  type TextData,
} from '@ezdraft/geometry';

/** A press that moves less than this (screen px) before its release is a click: a note without a leader. */
export const TEXT_DRAG_PX = 6;

export type TextToolState = { press: { at: Point; screen: Point } | null };

export type TextInput =
  | { type: 'down'; at: Point; screen: Point }
  | { type: 'up'; at: Point; screen: Point }
  | { type: 'cancel' }
  | { type: 'escape' };

/** Where a new note's box opens: the note's place, and its leader's arrow end or none. */
export type NoteBox = { at: Point; leader: Point | null };

export type TextStep = { state: TextToolState; open: NoteBox | null; exit: boolean };

export const initialTextState = (): TextToolState => ({ press: null });

export function reduceText(s: TextToolState, i: TextInput): TextStep {
  if (i.type === 'escape')
    return s.press !== null
      ? { state: initialTextState(), open: null, exit: false }
      : { state: s, open: null, exit: true };
  if (i.type === 'cancel') return { state: initialTextState(), open: null, exit: false };
  if (i.type === 'down')
    return { state: { press: { at: i.at, screen: i.screen } }, open: null, exit: false };
  const p = s.press;
  if (p === null) return { state: s, open: null, exit: false };
  const dragged = Math.hypot(i.screen.x - p.screen.x, i.screen.y - p.screen.y) >= TEXT_DRAG_PX;
  return {
    state: initialTextState(),
    open: dragged ? { at: i.at, leader: p.at } : { at: p.at, leader: null },
    exit: false,
  };
}

// The characters an iPad or a paste types for the plain ones the plan draws (Q-0687 (b); vault/build/assumptions.md
// EZD-216 "Characters outside the atlas").
const PLAIN: Readonly<Record<string, string>> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  ' ': ' ',
  '′': "'",
  '″': '"',
  '\r': '',
  '\t': ' ',
};

export function plainText(s: string): string {
  let out = '';
  for (const ch of s) out += PLAIN[ch] ?? ch;
  return out;
}

export type TextCommit =
  { ok: true; value: string | null } | { ok: false; reason: 'unsupported' | 'too_long' };

/** A note's typed text: null when empty (nothing is placed), else the text, or why it is refused. */
export function noteText(typed: string): TextCommit {
  const t = plainText(typed).replace(/\s+$/u, '').replace(/^\n+/u, '');
  if (t.trim() === '') return { ok: true, value: null };
  if ([...t].length > TEXT_MAX_CHARS) return { ok: false, reason: 'too_long' };
  return noteTextSchema.safeParse(t).success
    ? { ok: true, value: t }
    : { ok: false, reason: 'unsupported' };
}

/** A dimension's typed override: null when cleared (the measured value shows again), else the one-line text. */
export function overrideText(typed: string): TextCommit {
  const t = plainText(typed).replace(/\n/g, ' ').trim();
  if (t === '') return { ok: true, value: null };
  if ([...t].length > DIMENSION_OVERRIDE_MAX_CHARS) return { ok: false, reason: 'too_long' };
  return overrideTextSchema.safeParse(t).success
    ? { ok: true, value: t }
    : { ok: false, reason: 'unsupported' };
}

export function newNoteData(
  box: NoteBox,
  text: string,
  ctx: { level: string; status: ObjectStatus },
): TextData {
  return {
    geometry: { position: box.at, leader: box.leader },
    status: ctx.status,
    level: ctx.level,
    attributes: { text, paperSize: NOTE_PAPER_SIZE },
  };
}

export const withOverride = (d: DimensionData, override: string | null): DimensionData => ({
  ...d,
  attributes: { ...d.attributes, override },
});

export const withNoteText = (d: TextData, text: string): TextData => ({
  ...d,
  attributes: { ...d.attributes, text },
});
