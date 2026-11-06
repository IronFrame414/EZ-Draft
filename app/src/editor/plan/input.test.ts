// EZD-207a U9-U13 (vault/plans/EZD-207a.md section 4; Decided "Wheel", "Pan", "Space", "Context menu", "Pointer
// hand-off", "Cursor"; AC-EZD-207-1, -8). The surface is a Node EventTarget with the plan's rect (left 16, top 92,
// 1568 x 862). Every point below is region px; its event carries clientX = x + 16 and clientY = y + 92.
import { describe, expect, test, vi } from 'vitest';
import {
  createPlanInput,
  type InputSurface,
  type PlanPointerEvent,
  type PlanPointerReceiver,
} from './input';
import { regionToModel, type PlanView } from './view';

const START: PlanView = { x: 0, y: 0, ppi: 8 / 3 };

function makeSurface() {
  const surface = new EventTarget() as unknown as InputSurface & {
    setPointerCapture: ReturnType<typeof vi.fn>;
  };
  Object.assign(surface, {
    getBoundingClientRect: () => ({ left: 16, top: 92, width: 1568, height: 862 }),
    setPointerCapture: vi.fn(),
  });
  return surface;
}

function setup(withReceiver = false) {
  const surface = makeSurface();
  const keys = new EventTarget();
  let view = START;
  const views: PlanView[] = [];
  const events: PlanPointerEvent[] = [];
  let receiver: PlanPointerReceiver | null = withReceiver ? (e) => events.push(e) : null;
  const input = createPlanInput({
    surface,
    keys,
    getView: () => view,
    setView: (v) => {
      view = v;
      views.push(v);
    },
    getReceiver: () => receiver,
  });
  return {
    surface,
    keys,
    input,
    views,
    events,
    view: () => view,
    setReceiver: (r: PlanPointerReceiver | null) => {
      receiver = r;
    },
  };
}

function fire(target: EventTarget, type: string, fields: Record<string, unknown> = {}): Event {
  const event = Object.assign(new Event(type, { cancelable: true }), fields);
  target.dispatchEvent(event);
  return event;
}

const base = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
function pointer(
  s: EventTarget,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  o: { id?: number; button?: number; pointerType?: string } = {},
): Event {
  const button = o.button ?? 0;
  return fire(s, type, {
    ...base,
    pointerId: o.id ?? 1,
    pointerType: o.pointerType ?? 'mouse',
    button,
    buttons: type === 'pointerup' ? 0 : button === 2 ? 2 : 1,
    clientX: x + 16,
    clientY: y + 92,
  });
}
const touch = (id: number) => ({ id, pointerType: 'touch' });

function wheel(s: EventTarget, x: number, y: number, deltaY: number, ctrlKey = false): Event {
  return fire(s, 'wheel', {
    ...base,
    ctrlKey,
    deltaX: 0,
    deltaY,
    deltaMode: 0,
    clientX: x + 16,
    clientY: y + 92,
  });
}

function key(keys: EventTarget, type: 'keydown' | 'keyup', tagName = 'BODY'): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'key', { value: ' ' });
  Object.defineProperty(event, 'target', { value: { tagName } });
  keys.dispatchEvent(event);
  return event;
}

function drag(s: EventTarget, o: { button?: number } = {}) {
  pointer(s, 'pointerdown', 100, 100, o);
  pointer(s, 'pointermove', 200, 150, o);
  pointer(s, 'pointerup', 200, 150, o);
}

describe('EZD-207a input', () => {
  test('EZD-207a U9 a wheel zooms toward the cursor, one setView each, and is not passive', () => {
    const t = setup();
    const first = wheel(t.surface, 400, 300, -100);
    expect(t.views).toHaveLength(1);
    const m = regionToModel(t.views[0], { x: 400, y: 300 });
    expect(m.x).toBeCloseTo(150, 9);
    expect(m.y).toBeCloseTo(-112.5, 9);
    expect(t.views[0].ppi).toBeCloseTo((8 / 3) * Math.exp(0.2), 9);
    const second = wheel(t.surface, 400, 300, 10, true);
    expect(t.views).toHaveLength(2);
    expect(t.views[1].ppi).toBeCloseTo(t.views[0].ppi * Math.exp(-0.1), 9);
    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(true);
    expect(t.input.getCursor()).toEqual({ x: 400, y: 300 });
  });

  test('EZD-207a U10 right-drag and space-drag pan, a plain left drag goes to the receiver only', () => {
    const right = setup(true);
    drag(right.surface, { button: 2 });
    expect(right.view().x).toBeCloseTo(-37.5, 9);
    expect(right.view().y).toBeCloseTo(18.75, 9);
    expect(right.view().ppi).toBeCloseTo(8 / 3, 9);
    expect(right.events).toHaveLength(0);

    const space = setup(true);
    key(space.keys, 'keydown');
    drag(space.surface);
    expect(space.view().x).toBeCloseTo(-37.5, 9);
    expect(space.view().y).toBeCloseTo(18.75, 9);
    expect(space.view().ppi).toBeCloseTo(8 / 3, 9);
    expect(space.events).toHaveLength(0);

    const plain = setup(true);
    drag(plain.surface);
    expect(plain.view()).toEqual(START);
    expect(plain.events.map((e) => e.kind)).toEqual(['down', 'move', 'up']);
  });

  test('EZD-207a U11 two touches pan and pinch, a third is ignored, one touch goes to the receiver', () => {
    const t = setup(true);
    pointer(t.surface, 'pointerdown', 100, 100, touch(1));
    pointer(t.surface, 'pointerdown', 300, 100, touch(2));
    pointer(t.surface, 'pointermove', 120, 100, touch(1));
    pointer(t.surface, 'pointermove', 320, 100, touch(2));
    expect(t.events.map((e) => e.kind)).toEqual(['down', 'cancel']);
    expect(t.view().x).toBeCloseTo(-7.5, 9);
    expect(t.view().y).toBeCloseTo(0, 9);
    expect(t.view().ppi).toBeCloseTo(8 / 3, 9);

    const before = regionToModel(t.view(), { x: 220, y: 100 });
    pointer(t.surface, 'pointermove', 340, 100, touch(2));
    expect(t.view().ppi).toBeCloseTo((8 / 3) * 1.1, 9);
    const after = regionToModel(t.view(), { x: 230, y: 100 });
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);

    const settled = t.view();
    pointer(t.surface, 'pointerdown', 500, 500, touch(3));
    pointer(t.surface, 'pointermove', 520, 520, touch(3));
    expect(t.view()).toEqual(settled);

    for (const id of [1, 2, 3]) pointer(t.surface, 'pointerup', 0, 0, touch(id));
    expect(t.events.map((e) => e.kind)).toEqual(['down', 'cancel']);

    pointer(t.surface, 'pointerdown', 50, 50, touch(4));
    pointer(t.surface, 'pointermove', 60, 60, touch(4));
    pointer(t.surface, 'pointerup', 60, 60, touch(4));
    expect(t.events.map((e) => e.kind)).toEqual(['down', 'cancel', 'down', 'move', 'up']);
  });

  test('EZD-207a U12 the receiver gets model and screen points, clicks only after a delivered press, nothing after null', () => {
    const t = setup(true);
    const at = (type: 'pointerdown' | 'pointermove' | 'pointerup') =>
      pointer(t.surface, type, 400, 300, { pointerType: 'pen' });
    at('pointerdown');
    at('pointermove');
    at('pointerup');
    fire(t.surface, 'click', {
      ...base,
      button: 0,
      clientX: 416,
      clientY: 392,
      pointerType: 'pen',
    });
    fire(t.surface, 'dblclick', {
      ...base,
      button: 0,
      clientX: 416,
      clientY: 392,
      pointerType: 'pen',
    });
    expect(t.events.map((e) => e.kind)).toEqual(['down', 'move', 'up', 'click', 'dblclick']);
    for (const e of t.events) {
      expect(e.model.x).toBeCloseTo(150, 9);
      expect(e.model.y).toBeCloseTo(-112.5, 9);
      expect(e.screen).toEqual({ x: 400, y: 300 });
    }
    expect(t.events[0].pointerType).toBe('pen');

    const delivered = t.events.length;
    key(t.keys, 'keydown');
    drag(t.surface);
    key(t.keys, 'keyup');
    fire(t.surface, 'click', { ...base, button: 0, clientX: 416, clientY: 392 });
    expect(t.events).toHaveLength(delivered);

    t.setReceiver(null);
    pointer(t.surface, 'pointerdown', 400, 300);
    pointer(t.surface, 'pointerup', 400, 300);
    expect(t.events).toHaveLength(delivered);
  });

  test('EZD-207a U13 Space does not pan while typing or after blur, the menu is blocked, the cursor starts null', () => {
    const typing = setup();
    expect(typing.input.getCursor()).toBeNull();
    key(typing.keys, 'keydown', 'INPUT');
    drag(typing.surface);
    expect(typing.views).toHaveLength(0);

    const blurred = setup();
    key(blurred.keys, 'keydown');
    fire(blurred.keys, 'blur');
    drag(blurred.surface);
    expect(blurred.views).toHaveLength(0);

    const control = setup();
    key(control.keys, 'keydown');
    drag(control.surface);
    expect(control.views.length).toBeGreaterThan(0);

    const menu = fire(control.surface, 'contextmenu', { ...base, clientX: 416, clientY: 392 });
    expect(menu.defaultPrevented).toBe(true);

    control.input.dispose();
    const count = control.views.length;
    wheel(control.surface, 400, 300, -100);
    expect(control.views).toHaveLength(count);
  });
});

// EZD-207b U12 (vault/plans/EZD-207b.md section 4; Decided "Input hover"; AC-EZD-207-3).
describe('EZD-207b input hover', () => {
  test('EZD-207b U12 onHover gets mouse and pen moves, null on leave and pan start, nothing for touch or during a pan', () => {
    const surface = makeSurface();
    const onHover = vi.fn();
    let view = START;
    createPlanInput({
      surface,
      keys: new EventTarget(),
      getView: () => view,
      setView: (v) => {
        view = v;
      },
      getReceiver: () => null,
      onHover,
    });
    pointer(surface, 'pointermove', 600, 210);
    pointer(surface, 'pointermove', 610, 212, { pointerType: 'pen' });
    fire(surface, 'pointerleave', {
      ...base,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 616,
      clientY: 302,
    });
    expect(onHover.mock.calls).toEqual([[{ x: 600, y: 210 }], [{ x: 610, y: 212 }], [null]]);

    pointer(surface, 'pointerdown', 600, 210, { button: 2 });
    expect(onHover).toHaveBeenCalledTimes(4);
    expect(onHover).toHaveBeenLastCalledWith(null);
    pointer(surface, 'pointermove', 620, 220, { button: 2 });
    pointer(surface, 'pointermove', 640, 230, { button: 2 });
    pointer(surface, 'pointerup', 640, 230, { button: 2 });
    expect(onHover).toHaveBeenCalledTimes(4);

    pointer(surface, 'pointermove', 600, 210, touch(7));
    expect(onHover).toHaveBeenCalledTimes(4);
  });
});
