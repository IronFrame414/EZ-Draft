// EZD-1419 (S17b Validation & warnings "a value outside 0–200 ft asks to confirm"; Active wall field "Accepts
// feet, inches, fractions to 1/16""): how a typed wall length is taken. 200 ft is 2400" (the wall length limit,
// packages/geometry MAX_WALL_LENGTH_IN). A length over it is kept only after the user confirms it; a length over
// MAX_FIELD_LENGTH_IN, 0 or text that is not a length is refused as before (vault/build/assumptions.md EZD-1419).
import { MAX_WALL_LENGTH_IN, parseLength } from '@ezdraft/geometry';

/** Above this a typed length asks to confirm: 200 ft (S17b Validation). */
export const CONFIRM_ABOVE_IN = MAX_WALL_LENGTH_IN;
/** The longest length the phone keeps, confirmed: 1000 ft (assumptions EZD-1419). */
export const MAX_FIELD_LENGTH_IN = 12000;

export type LengthEntry =
  | { kind: 'ok'; inches: number }
  | { kind: 'confirm'; inches: number }
  | { kind: 'refused' };

export function readFieldLength(text: string): LengthEntry {
  const parsed = parseLength(text, 'other');
  if (!parsed.ok || parsed.inches <= 0 || parsed.inches > MAX_FIELD_LENGTH_IN) return { kind: 'refused' };
  if (parsed.inches > CONFIRM_ABOVE_IN) return { kind: 'confirm', inches: parsed.inches };
  return { kind: 'ok', inches: parsed.inches };
}
