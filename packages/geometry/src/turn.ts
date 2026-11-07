// Turn angle for the typed dimension bar (EZD-209). Pure TypeScript: no imports, no DOM, no Node APIs.

export const TURN_REFUSED_MESSAGE_KEY = 'office.typed.angle_refused' as const;
export type TurnVector = { readonly x: number; readonly y: number };
export type ParseTurnResult =
  | { ok: true; degrees: number }
  | { ok: false; messageKey: typeof TURN_REFUSED_MESSAGE_KEY };

const MAX_ANGLE_TEXT_LENGTH = 16;
const ANGLE_SHAPE = /^\d+(?:\.\d+)?$/;

function refused(): ParseTurnResult {
  return { ok: false, messageKey: TURN_REFUSED_MESSAGE_KEY };
}

export function parseTurnAngle(text: string): ParseTurnResult {
  const s = text.trim();
  if (s.length === 0 || s.length > MAX_ANGLE_TEXT_LENGTH) return refused();
  if (!ANGLE_SHAPE.test(s)) return refused();
  const n = Number(s);
  return n < 180 ? { ok: true, degrees: n } : refused();
}

export function resolveTurnDirection(input: {
  previous: TurnVector | null;
  toCursor: TurnVector;
  turnDeg: number | null;
}): TurnVector | null {
  const { previous, toCursor: c, turnDeg } = input;
  if (turnDeg === null) {
    const len = Math.hypot(c.x, c.y);
    return len === 0 ? null : { x: c.x / len, y: c.y / len };
  }
  let ref: TurnVector = { x: c.x < 0 ? -1 : 1, y: 0 };
  if (previous !== null) {
    const plen = Math.hypot(previous.x, previous.y);
    if (plen > 0) ref = { x: previous.x / plen, y: previous.y / plen };
  }
  const cross = ref.x * c.y - ref.y * c.x;
  const s = cross < 0 ? -1 : 1;
  const a = (s * turnDeg * Math.PI) / 180;
  return {
    x: ref.x * Math.cos(a) - ref.y * Math.sin(a),
    y: ref.x * Math.sin(a) + ref.y * Math.cos(a),
  };
}
