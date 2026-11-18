// EZD-312 (S02 Decisions "Ceiling slope items are fixed in the inspector with the same three inputs as Round 1:
// heights at points (low/high wall), pitch, or the value read from the mesh"; W6 step 2 "typed at points, by pitch,
// or read from the mesh"; phase-03 EZD-312; AC-EZD-312-1 "A slope item saves by each of the three inputs"): the fix
// of a ceiling slope item. Pure, so the inspector, the server read and the tests share it.
// - points: the low wall and high wall heights are typed; pitch = 12 × (high − low) ÷ run.
// - pitch: the low wall height and the pitch are typed; high = low + pitch × run ÷ 12.
// - mesh: heights and pitch come from the Polycam GLB (lib/imports/polycam-glb/ceiling.ts readCeiling).
// Every fix keeps which input set it and the three values, so the review shows and Finish import reads one shape.
import type { CeilingReading } from './polycam-glb/ceiling';
import type { ReviewCeilingSlope } from './review';

export const SLOPE_INPUTS = ['points', 'pitch', 'mesh'] as const;
export type SlopeInput = (typeof SLOPE_INPUTS)[number];

export type CeilingSlopeFix = {
  input: SlopeInput;
  lowHeight: number;
  highHeight: number;
  pitchPer12: number;
};

/** The highest ceiling a slope takes, inches (200', the length parser's room limit). */
export const MAX_CEILING_IN = 2400;
/** The steepest pitch a slope takes, rise per 12 (a 24/12 slope rises two feet per foot). */
export const MAX_PITCH = 24;

export type SlopeRefusal = 'height' | 'order' | 'pitch' | 'no_ceiling';
export type SlopeResult = { ok: true; fix: CeilingSlopeFix } | { ok: false; reason: SlopeRefusal };

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const height = (n: number) => finite(n) && n > 0 && n <= MAX_CEILING_IN;
const pitchOk = (n: number) => finite(n) && n >= 0 && n <= MAX_PITCH;

/** Heights at points: the low wall and the high wall (S02 "heights at points (low/high wall)"). */
export function slopeByPoints(
  item: Pick<ReviewCeilingSlope, 'run'>,
  lowHeight: number,
  highHeight: number,
): SlopeResult {
  if (!height(lowHeight) || !height(highHeight)) return { ok: false, reason: 'height' };
  if (highHeight < lowHeight) return { ok: false, reason: 'order' };
  const pitchPer12 = item.run > 0 ? (12 * (highHeight - lowHeight)) / item.run : 0;
  if (!pitchOk(pitchPer12)) return { ok: false, reason: 'pitch' };
  return { ok: true, fix: { input: 'points', lowHeight, highHeight, pitchPer12 } };
}

/** Pitch: the low wall height and the rise per 12; the high wall height follows over the run. */
export function slopeByPitch(
  item: Pick<ReviewCeilingSlope, 'run'>,
  lowHeight: number,
  pitchPer12: number,
): SlopeResult {
  if (!height(lowHeight)) return { ok: false, reason: 'height' };
  if (!pitchOk(pitchPer12)) return { ok: false, reason: 'pitch' };
  const highHeight = lowHeight + (pitchPer12 * Math.max(0, item.run)) / 12;
  if (!height(highHeight)) return { ok: false, reason: 'height' };
  return { ok: true, fix: { input: 'pitch', lowHeight, highHeight, pitchPer12 } };
}

/** The value read from the mesh; a flat ceiling reads its one height at both walls and pitch 0. */
export function slopeFromMesh(reading: CeilingReading | null): SlopeResult {
  if (!reading) return { ok: false, reason: 'no_ceiling' };
  const lowHeight = reading.lowWall?.heightIn ?? reading.minHeightIn;
  const highHeight = reading.highWall?.heightIn ?? lowHeight;
  if (!height(lowHeight) || !height(highHeight)) return { ok: false, reason: 'height' };
  if (!pitchOk(reading.pitchPer12)) return { ok: false, reason: 'pitch' };
  return {
    ok: true,
    fix: { input: 'mesh', lowHeight, highHeight, pitchPer12: reading.pitchPer12 },
  };
}

/** A stored slope fix read back; null when it does not have the shape. */
export function parseSlopeFix(raw: unknown): CeilingSlopeFix | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const input = SLOPE_INPUTS.find((i) => i === r.input);
  if (!input || !finite(r.lowHeight) || !finite(r.highHeight) || !finite(r.pitchPer12)) return null;
  if (!height(r.lowHeight) || !height(r.highHeight) || r.highHeight < r.lowHeight) return null;
  if (!pitchOk(r.pitchPer12)) return null;
  return { input, lowHeight: r.lowHeight, highHeight: r.highHeight, pitchPer12: r.pitchPer12 };
}
