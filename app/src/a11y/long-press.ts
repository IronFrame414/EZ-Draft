// EZD-2004 (audit 2026-11-27 A19): a finger held still on one spot for `ms`, as the plan canvas does
// (editor/plan/input.ts; callers pass its LONG_PRESS_MS and CONTEXT_MENU_PX). iPad Safari sends no contextmenu for a
// finger hold, so a screen whose menu opens on right-click starts this on a touch press. Moving the finger more than
// `slop` px, lifting it, a second finger or the system taking the touch (pointercancel) stops it. Returns a function
// that stops it.

export type HoldStart = { pointerId: number; clientX: number; clientY: number };

export function startLongPress(
  start: HoldStart,
  onHold: (x: number, y: number) => void,
  { ms, slop }: { ms: number; slop: number },
): () => void {
  let last = { x: start.clientX, y: start.clientY };
  const stop = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onEnd, true);
    window.removeEventListener('pointercancel', onEnd, true);
    window.removeEventListener('pointerdown', onOther, true);
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== start.pointerId) return;
    if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) > slop) stop();
    else last = { x: e.clientX, y: e.clientY };
  };
  const onEnd = (e: PointerEvent) => {
    if (e.pointerId === start.pointerId) stop();
  };
  const onOther = (e: PointerEvent) => {
    if (e.pointerId !== start.pointerId) stop();
  };
  const timer = setTimeout(() => {
    stop();
    onHold(last.x, last.y);
  }, ms);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onEnd, true);
  window.addEventListener('pointercancel', onEnd, true);
  window.addEventListener('pointerdown', onOther, true);
  return stop;
}
