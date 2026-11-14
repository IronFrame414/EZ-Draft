// EZD-233 (S03 Canvas interactions "Right-click / long-press: Context menu"; "Space-drag, right-drag or two-finger
// drag: Pan"): a right press released in place opens the menu, a right drag pans and opens nothing; one touch held
// still opens it and cancels its delivered press; a moved touch, a second finger or an early lift opens nothing.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CONTEXT_MENU_PX,
  LONG_PRESS_MS,
  createPlanInput,
  type InputSurface,
  type PlanPointerEvent,
} from './input';
import type { PlanView } from './view';

function setup(opened = true) {
  const surface = new EventTarget() as unknown as InputSurface;
  Object.assign(surface, {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setPointerCapture: () => {},
  });
  let view: PlanView = { x: 0, y: 0, ppi: 1 };
  const events: PlanPointerEvent[] = [];
  const menus: { x: number; y: number }[] = [];
  const views: PlanView[] = [];
  createPlanInput({
    surface,
    keys: new EventTarget(),
    getView: () => view,
    setView: (v) => {
      view = v;
      views.push(v);
    },
    getReceiver: () => (e) => events.push(e),
    getZoom100: () => 1,
    onContextMenu: (p) => {
      menus.push(p);
      return opened;
    },
  });
  const fire = (
    type: string,
    x: number,
    y: number,
    o: { id?: number; button?: number; pointerType?: string } = {},
  ) =>
    surface.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), {
        pointerId: o.id ?? 1,
        pointerType: o.pointerType ?? 'mouse',
        button: o.button ?? 0,
        clientX: x,
        clientY: y,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
      }),
    );
  return { fire, events, menus, views };
}

describe('EZD-233 context menu input', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('a right click in place opens the menu at the release point', () => {
    const s = setup();
    s.fire('pointerdown', 100, 100, { button: 2 });
    s.fire('pointermove', 104, 103, { button: 2 });
    s.fire('pointerup', 104, 103, { button: 2 });
    expect(s.menus).toEqual([{ x: 104, y: 103 }]);
    expect(s.events).toEqual([]);
  });

  test('a right drag past the threshold pans and opens nothing', () => {
    const s = setup();
    s.fire('pointerdown', 100, 100, { button: 2 });
    s.fire('pointermove', 100 + CONTEXT_MENU_PX + 1, 100, { button: 2 });
    s.fire('pointerup', 100, 100, { button: 2 });
    expect(s.menus).toEqual([]);
    expect(s.views.length).toBeGreaterThan(0);
  });

  test('a left click opens nothing', () => {
    const s = setup();
    s.fire('pointerdown', 100, 100);
    s.fire('pointerup', 100, 100);
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);
    expect(s.menus).toEqual([]);
  });

  test('one touch held still opens the menu and cancels its press', () => {
    const s = setup();
    s.fire('pointerdown', 200, 200, { pointerType: 'touch' });
    s.fire('pointermove', 205, 200, { pointerType: 'touch' });
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(s.menus).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(s.menus).toEqual([{ x: 205, y: 200 }]);
    expect(s.events.map((e) => e.kind)).toEqual(['down', 'move', 'cancel']);
    s.fire('pointerup', 205, 200, { pointerType: 'touch' });
    expect(s.events.map((e) => e.kind)).toEqual(['down', 'move', 'cancel']);
  });

  test('a long press nobody opens a menu for keeps its press', () => {
    const s = setup(false);
    s.fire('pointerdown', 200, 200, { pointerType: 'touch' });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(s.menus).toHaveLength(1);
    s.fire('pointerup', 200, 200, { pointerType: 'touch' });
    expect(s.events.map((e) => e.kind)).toEqual(['down', 'up']);
  });

  test('a moved touch, an early lift or a second finger opens nothing', () => {
    const moved = setup();
    moved.fire('pointerdown', 200, 200, { pointerType: 'touch' });
    moved.fire('pointermove', 200 + CONTEXT_MENU_PX + 1, 200, { pointerType: 'touch' });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(moved.menus).toEqual([]);

    const lifted = setup();
    lifted.fire('pointerdown', 200, 200, { pointerType: 'touch' });
    lifted.fire('pointerup', 200, 200, { pointerType: 'touch' });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(lifted.menus).toEqual([]);

    const pinch = setup();
    pinch.fire('pointerdown', 200, 200, { pointerType: 'touch', id: 1 });
    pinch.fire('pointerdown', 300, 200, { pointerType: 'touch', id: 2 });
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(pinch.menus).toEqual([]);
  });
});
