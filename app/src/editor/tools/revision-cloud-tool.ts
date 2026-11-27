// EZD-232 (S03 rail "Revision cloud (not in mockup) | Rail | Draw a cloud and delta tag manually"; 04 Tool rail
// "Revision cloud | Q"; Q-0200 "clouds can also be added or removed by hand"): the Revision cloud tool's pointer
// steps. Pure: no React, no DOM, no model writes.
//
// A press, a drag and the lift draw a rectangular cloud from the press corner to the lift corner; a press that does
// not move (a click or a tap) sets the first corner, and the next click sets the other one. The delta tag goes on the
// cloud's top right corner. Esc drops a started cloud, else ends the tool. Gesture, smallest size and tag place:
// vault/build/assumptions/EZD-232.md.
import type { Point, RevisionCloudData } from '@ezdraft/geometry';

/** A press that moves less than this (screen px) before its lift is a click: it sets the first corner only. */
export const CLOUD_DRAG_PX = 6;
/** A cloud narrower or shorter than this (model inches) is not placed. */
export const CLOUD_MIN_IN = 1;

export type CloudToolState = {
  // The first corner, once pressed; `pressed` while that press is still down.
  corner: { at: Point; screen: Point } | null;
  pressed: boolean;
  // The pointer, for the preview.
  at: Point | null;
};

export type CloudInput =
  | { type: 'down'; at: Point; screen: Point }
  | { type: 'move'; at: Point }
  | { type: 'up'; at: Point; screen: Point }
  | { type: 'cancel' }
  | { type: 'escape' };

export type CloudStep = { state: CloudToolState; place: RevisionCloudData | null; exit: boolean };

export const initialCloudState = (): CloudToolState => ({ corner: null, pressed: false, at: null });

/** A manual cloud on the rectangle between two corners, or null when it is too small. */
export function rectCloudData(a: Point, b: Point, level: string): RevisionCloudData | null {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  if (maxX - minX < CLOUD_MIN_IN || maxY - minY < CLOUD_MIN_IN) return null;
  return {
    // Counter-clockwise, so the scallops bulge outward.
    geometry: {
      boundary: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ],
      tag: { x: maxX, y: maxY },
    },
    level,
    // Rev N is assigned only on the next send (EZD-718).
    attributes: { source: 'manual', rev: null },
  };
}

export function reduceCloud(s: CloudToolState, i: CloudInput, level: string): CloudStep {
  const none = (state: CloudToolState): CloudStep => ({ state, place: null, exit: false });
  if (i.type === 'escape')
    return s.corner !== null ? none(initialCloudState()) : { state: s, place: null, exit: true };
  if (i.type === 'cancel') return none(initialCloudState());
  if (i.type === 'move') return none({ ...s, at: i.at });
  if (i.type === 'down') {
    if (s.corner === null)
      return none({ corner: { at: i.at, screen: i.screen }, pressed: true, at: i.at });
    // The second click's press: the cloud is placed on its lift.
    return none({ ...s, at: i.at });
  }
  // Lift.
  const c = s.corner;
  if (c === null) return none(s);
  if (s.pressed) {
    const dragged = Math.hypot(i.screen.x - c.screen.x, i.screen.y - c.screen.y) >= CLOUD_DRAG_PX;
    if (!dragged) return none({ corner: c, pressed: false, at: i.at });
  }
  return { state: initialCloudState(), place: rectCloudData(c.at, i.at, level), exit: false };
}
