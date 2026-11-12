// EZD-213a Build step 4 (vault/plans/EZD-213a.md section 1, Decided "parseRoughOpening"; Q-0640 row 5-5; Q-0561;
// Q-0570; G/length.ts): a typed rough opening, width then height, split on a lower-case x or the multiplication
// sign; each side read as a length. Every refusal carries the length formats message key.
import { LENGTH_REFUSED_MESSAGE_KEY, parseLength, type LengthRefusalReason } from '../length';

export type ParseRoughOpeningResult =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: LengthRefusalReason; messageKey: typeof LENGTH_REFUSED_MESSAGE_KEY };

function refuse(reason: LengthRefusalReason): ParseRoughOpeningResult {
  return { ok: false, reason, messageKey: LENGTH_REFUSED_MESSAGE_KEY };
}

export function parseRoughOpening(text: string): ParseRoughOpeningResult {
  const parts = text.split(/[x×]/);
  if (parts.length !== 2) return refuse('format');
  const width = parseLength(parts[0]!, 'other');
  if (!width.ok) return refuse(width.reason);
  const height = parseLength(parts[1]!, 'other');
  if (!height.ok) return refuse(height.reason);
  if (width.inches === 0 || height.inches === 0) return refuse('not_positive');
  return { ok: true, width: width.inches, height: height.inches };
}
