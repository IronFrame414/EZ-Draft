// EZD-1973 (Q-0630/Q-0038 tablet rule "a drag does not turn the tool on while a tap still does"): what a press on a
// movable rail tool is. A movable tool takes touch and pen itself (touch-action: none), so the rail, not the browser,
// decides what a tap is: a finger or pen lifted on the tool without a drag turns it on at pointer up. Chrome on
// Linux, Windows and Android sends no click for a tap that starts just after a touch drag ended with the finger
// still moving (its fling tap suppression, measured under 300 ms), so a rail that waited for the click lost that tap.
// The click a browser does send for the same press is not counted twice, and the click that ends a mouse drag does
// not press the tool. That guard is for the same tool and a short time only, and the next press clears it, so it
// never waits for a later tap, a key press or a click on another tool.
export const DRAG_START_PX = 8;
// A press's own click comes with its pointer up; by event time, so a busy page does not stretch it.
export const CLICK_GUARD_MS = 1000;

export type RailPressEnd = { kind: 'drop'; id: string } | { kind: 'tap'; id: string } | null;

export type RailPress = {
  // A press starts on a movable tool. `type` is the pointer type ('mouse', 'touch' or 'pen').
  down(press: { id: string; pointer: number; y: number; type: string }): void;
  // A press on a tool that cannot be moved: only clears what the last press left.
  clear(): void;
  // True when this move starts the drag (the pointer is 8 px from where it went down).
  move(at: { pointer: number; y: number }): boolean;
  // The press ends: a drop after a drag, a tap for a finger or pen lifted on the tool, else null (a mouse's click
  // presses the tool).
  up(at: { pointer: number; time: number; inside: boolean }): RailPressEnd;
  cancel(): void;
  // A click on a tool: true when it presses the tool. `keyboard` is a click made with Enter or Space.
  click(at: { id: string; time: number; keyboard: boolean }): boolean;
};

export function createRailPress(): RailPress {
  let press: { id: string; pointer: number; y: number; touch: boolean; moving: boolean } | null =
    null;
  let guard: { id: string; until: number } | null = null;
  return {
    down({ id, pointer, y, type }) {
      guard = null;
      press = { id, pointer, y, touch: type !== 'mouse', moving: false };
    },
    clear() {
      guard = null;
      press = null;
    },
    move({ pointer, y }) {
      if (press === null || press.pointer !== pointer || press.moving) return false;
      if (Math.abs(y - press.y) < DRAG_START_PX) return false;
      press.moving = true;
      return true;
    },
    up({ pointer, time, inside }) {
      const p = press;
      if (p === null || p.pointer !== pointer) return null;
      press = null;
      if (p.moving) {
        guard = { id: p.id, until: time + CLICK_GUARD_MS };
        return { kind: 'drop', id: p.id };
      }
      if (!p.touch || !inside) return null;
      guard = { id: p.id, until: time + CLICK_GUARD_MS };
      return { kind: 'tap', id: p.id };
    },
    cancel() {
      press = null;
    },
    click({ id, time, keyboard }) {
      const g = guard;
      guard = null;
      return g === null || keyboard || g.id !== id || time > g.until;
    },
  };
}
