// EZD-1973 (AC-EZD-1973-1 "After a touch drag that moves a tool on the rail, the next tap on that tool turns it on
// every time: whatever suppresses the click that ends a drag is cleared when the drag ends (or is limited to the
// click from that same touch sequence), never left waiting for a later tap"; AC-EZD-1973-3; Q-0630/Q-0038 tablet rule
// "a drag does not turn the tool on while a tap still does"; EZD-230 "A drag starts after the pointer moves 8 px").
import { describe, expect, it } from 'vitest';
import { CLICK_GUARD_MS, DRAG_START_PX, createRailPress, type RailPress } from './rail-press';

const touchDrag = (rp: RailPress, id: string, time: number) => {
  rp.down({ id, pointer: 2, y: 100, type: 'touch' });
  expect(rp.move({ pointer: 2, y: 60 })).toBe(true);
  return rp.up({ pointer: 2, time, inside: true });
};

describe('EZD-1973 rail press', () => {
  it('the drag distance is 8 px', () => {
    expect(DRAG_START_PX).toBe(8);
    const rp = createRailPress();
    rp.down({ id: 'wall', pointer: 1, y: 100, type: 'mouse' });
    expect(rp.move({ pointer: 1, y: 107 })).toBe(false);
    expect(rp.move({ pointer: 1, y: 108 })).toBe(true);
    // The drag starts once.
    expect(rp.move({ pointer: 1, y: 120 })).toBe(false);
  });

  it('AC-EZD-1973-1: after a touch drag with no click, a tap on the tool turns it on at pointer up', () => {
    const rp = createRailPress();
    expect(touchDrag(rp, 'wall', 1000)).toEqual({ kind: 'drop', id: 'wall' });
    // The browser sends no click for the drag, and none for a tap that starts just after it.
    rp.down({ id: 'wall', pointer: 3, y: 20, type: 'touch' });
    expect(rp.up({ pointer: 3, time: 1050, inside: true })).toEqual({ kind: 'tap', id: 'wall' });
  });

  it('a finger tap is counted once: the click the browser sends for the same tap does not press again', () => {
    const rp = createRailPress();
    rp.down({ id: 'wall', pointer: 3, y: 20, type: 'touch' });
    expect(rp.up({ pointer: 3, time: 500, inside: true })).toEqual({ kind: 'tap', id: 'wall' });
    expect(rp.click({ id: 'wall', time: 501, keyboard: false })).toBe(false);
  });

  it('a pen tap is taken at pointer up as a finger tap is', () => {
    const rp = createRailPress();
    rp.down({ id: 'wall', pointer: 4, y: 20, type: 'pen' });
    expect(rp.up({ pointer: 4, time: 500, inside: true })).toEqual({ kind: 'tap', id: 'wall' });
  });

  it('a finger lifted off the tool, or a press that is cancelled, is not a tap', () => {
    const rp = createRailPress();
    rp.down({ id: 'wall', pointer: 3, y: 20, type: 'touch' });
    expect(rp.up({ pointer: 3, time: 500, inside: false })).toBeNull();
    rp.down({ id: 'wall', pointer: 3, y: 20, type: 'touch' });
    rp.cancel();
    expect(rp.up({ pointer: 3, time: 600, inside: true })).toBeNull();
    // Another finger's lift does not end this press.
    rp.down({ id: 'wall', pointer: 3, y: 20, type: 'touch' });
    expect(rp.up({ pointer: 9, time: 700, inside: true })).toBeNull();
    expect(rp.up({ pointer: 3, time: 700, inside: true })).toEqual({ kind: 'tap', id: 'wall' });
  });

  it('a mouse press without a drag is pressed by its click', () => {
    const rp = createRailPress();
    rp.down({ id: 'wall', pointer: 1, y: 20, type: 'mouse' });
    expect(rp.up({ pointer: 1, time: 500, inside: true })).toBeNull();
    expect(rp.click({ id: 'wall', time: 500, keyboard: false })).toBe(true);
  });

  it('the click that ends a mouse drag does not press the tool; the next click does', () => {
    const rp = createRailPress();
    rp.down({ id: 'wall', pointer: 1, y: 100, type: 'mouse' });
    expect(rp.move({ pointer: 1, y: 60 })).toBe(true);
    expect(rp.up({ pointer: 1, time: 1000, inside: true })).toEqual({ kind: 'drop', id: 'wall' });
    expect(rp.click({ id: 'wall', time: 1000, keyboard: false })).toBe(false);
    rp.down({ id: 'wall', pointer: 1, y: 20, type: 'mouse' });
    expect(rp.up({ pointer: 1, time: 1100, inside: true })).toBeNull();
    expect(rp.click({ id: 'wall', time: 1100, keyboard: false })).toBe(true);
  });

  it('AC-EZD-1973-1: the guard a drag leaves never waits for a later press', () => {
    // Enter or Space on the tool.
    let rp = createRailPress();
    touchDrag(rp, 'wall', 1000);
    expect(rp.click({ id: 'wall', time: 1001, keyboard: true })).toBe(true);
    // A click on another tool (Help at the bottom of the rail has no press of its own).
    rp = createRailPress();
    touchDrag(rp, 'wall', 1000);
    expect(rp.click({ id: 'help', time: 1001, keyboard: false })).toBe(true);
    // A click on the same tool after the guard's time.
    rp = createRailPress();
    touchDrag(rp, 'wall', 1000);
    expect(rp.click({ id: 'wall', time: 1000 + CLICK_GUARD_MS + 1, keyboard: false })).toBe(true);
    // A press on a tool that cannot be moved clears it.
    rp = createRailPress();
    touchDrag(rp, 'wall', 1000);
    rp.clear();
    expect(rp.click({ id: 'wall', time: 1001, keyboard: false })).toBe(true);
    // The guard is used once.
    rp = createRailPress();
    touchDrag(rp, 'wall', 1000);
    expect(rp.click({ id: 'wall', time: 1001, keyboard: false })).toBe(false);
    expect(rp.click({ id: 'wall', time: 1002, keyboard: false })).toBe(true);
  });
});
