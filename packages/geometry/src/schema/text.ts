// EZD-216 (03 Q-0667 "a text has position, text, leader end or none, and paper size (3/32", 1/8", 3/16", 1/4")";
// 09-calculations Q-0664 "Text paper sizes"; Q-0687 (b); 03f Annotation): a note placed with the Text tool (T).
// - `geometry.position`: the note's place in model inches (the middle of its first line).
// - `geometry.leader`: the leader's arrow end, or null for a note without a leader.
// - `attributes.text`: one or more lines (a line break is `\n`), 1 to TEXT_MAX_CHARS characters, from
//   TEXT_CHARS only (the characters the plan's glyph atlas draws), with at least one that is not a space.
// - `attributes.paperSize`: the printed height (09-calculations Q-0664): notes 3/32" by default.
// A new type, so the schema version stays.
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

function textChars(): string {
  let s = '';
  for (let cp = 0x20; cp <= 0x7e; cp++) s += String.fromCodePoint(cp);
  // The middle dot of room labels, then Q-0687 (b): á, é, ñ, ü, ° and ½ for Spanish notes and sizes.
  return s + '·' + 'áéñü°½';
}

/** Every character a note or a dimension override may hold, besides the line break. */
export const TEXT_CHARS: string = textChars();
export const TEXT_MAX_CHARS = 500;
/** A dimension override is one line (vault/build/assumptions.md EZD-216 "Override text"). */
export const DIMENSION_OVERRIDE_MAX_CHARS = 100;

const ALLOWED = new Set([...TEXT_CHARS]);

export function textCharsOk(s: string, lines: boolean): boolean {
  for (const ch of s) if (!(ALLOWED.has(ch) || (lines && ch === '\n'))) return false;
  return true;
}

const hasInk = (s: string) => /[^\s]/.test(s);

export const noteTextSchema = z
  .string()
  .check(
    z.minLength(1),
    z.refine((s) => [...s].length <= TEXT_MAX_CHARS),
    z.refine((s) => textCharsOk(s, true) && hasInk(s)),
  );

export const overrideTextSchema = z
  .string()
  .check(
    z.minLength(1),
    z.refine((s) => [...s].length <= DIMENSION_OVERRIDE_MAX_CHARS),
    z.refine((s) => textCharsOk(s, false) && hasInk(s)),
  );

export const PAPER_SIZES = ['3/32', '1/8', '3/16', '1/4'] as const;
export type PaperSize = (typeof PAPER_SIZES)[number];
/** Q-0664: a paper size in paper inches. */
export const PAPER_SIZE_IN: Readonly<Record<PaperSize, number>> = {
  '3/32': 3 / 32,
  '1/8': 1 / 8,
  '3/16': 3 / 16,
  '1/4': 1 / 4,
};
/** Q-0664: notes are 3/32"; labels and dimension text 1/8". */
export const NOTE_PAPER_SIZE: PaperSize = '3/32';
export const DIMENSION_PAPER_SIZE: PaperSize = '1/8';

export const textDataSchema = z.strictObject({
  geometry: z.strictObject({ position: pointSchema, leader: z.nullable(pointSchema) }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({ text: noteTextSchema, paperSize: z.enum(PAPER_SIZES) }),
});
export type TextData = z.infer<typeof textDataSchema>;
