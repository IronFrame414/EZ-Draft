// Length reader and writer (EZD-201). EZD-211a: the 'positive' kind refuses 0 after rounding, no maximum. Pure TypeScript: no imports, no DOM, no Node APIs.

export type LengthFieldKind = 'wall_room' | 'other' | 'positive';
export type LengthRefusalReason = 'format' | 'not_positive' | 'over_max';
export const LENGTH_REFUSED_MESSAGE_KEY = 'office.length.refused' as const;
export type ParseLengthResult =
  | { ok: true; inches: number }
  | { ok: false; reason: LengthRefusalReason; messageKey: typeof LENGTH_REFUSED_MESSAGE_KEY };

export const MAX_WALL_LENGTH_IN = 2400;
export const PLAN_DISPLAY_DENOMINATOR = 2 as const;
export const DETAIL_DISPLAY_DENOMINATOR = 16 as const;
export type DisplayDenominator = 2 | 16;

const SHAPE_A = /^(\d+(?:\.\d+)?)'$/;
const SHAPE_B = /^(\d+)'(?:-| *)(?:(\d+)(?: +|-)(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:\.\d+)?))"?$/;
const SHAPE_C = /^(?:(\d+)(?: +|-)(\d+)\/(\d+)|(\d+)\/(\d+)|(\d+(?:\.\d+)?))"?$/;

const MAX_TEXT_LENGTH = 32;

function refuse(reason: LengthRefusalReason): ParseLengthResult {
  return { ok: false, reason, messageKey: LENGTH_REFUSED_MESSAGE_KEY };
}

// Inch part from the six capture groups (whole, num, den, lone num, lone den, number); null when a fraction is invalid.
function inchPart(g: (string | undefined)[]): number | null {
  const [whole, num, den, loneNum, loneDen, number] = g;
  if (number !== undefined) return Number(number);
  const n = Number(whole === undefined ? loneNum : num);
  const d = Number(whole === undefined ? loneDen : den);
  if (d === 0 || n >= d) return null;
  return (whole === undefined ? 0 : Number(whole)) + n / d;
}

export function parseLength(text: string, kind: LengthFieldKind): ParseLengthResult {
  const s = text.trim().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  if (s.length === 0 || s.length > MAX_TEXT_LENGTH) return refuse('format');

  let value: number | null = null;
  const a = SHAPE_A.exec(s);
  if (a) {
    value = Number(a[1]) * 12;
  } else {
    const b = SHAPE_B.exec(s);
    if (b) {
      const part = inchPart(b.slice(2, 8));
      value = part === null ? null : Number(b[1]) * 12 + part;
    } else {
      const c = SHAPE_C.exec(s);
      if (c) value = inchPart(c.slice(1, 7));
    }
  }
  if (value === null) return refuse('format');

  const inches = Math.floor(value * 16 + 0.5) / 16;
  if (kind === 'wall_room') {
    if (inches <= 0) return refuse('not_positive');
    if (inches > MAX_WALL_LENGTH_IN) return refuse('over_max');
  }
  if (kind === 'positive' && inches <= 0) return refuse('not_positive');
  return { ok: true, inches };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function formatLength(inches: number, denominator: DisplayDenominator): string {
  if (!Number.isFinite(inches) || inches < 0)
    throw new RangeError('inches must be finite and not negative');
  if (denominator !== 2 && denominator !== 16) throw new RangeError('denominator must be 2 or 16');
  const d = denominator;
  const n = Math.floor(inches * d + 0.5);
  const feet = Math.floor(n / (12 * d));
  const rem = n - feet * 12 * d;
  const whole = Math.floor(rem / d);
  let num = rem - whole * d;
  let den = d;
  if (num > 0) {
    const g = gcd(num, den);
    num /= g;
    den /= g;
  }
  const fraction = num > 0 ? `${num}/${den}` : '';
  if (feet > 0) return `${feet}' ${whole}${fraction ? ` ${fraction}` : ''}"`;
  if (whole === 0 && num > 0) return `${fraction}"`;
  return `${whole}${fraction ? ` ${fraction}` : ''}"`;
}
