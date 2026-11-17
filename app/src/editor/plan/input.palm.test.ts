// EZD-223 (S03 Sketch, Pencil only; AC-EZD-223-4): a palm touch that lands during a Pencil stroke is not delivered,
// and the Pencil stroke keeps its moves and its up. Same surface as input.test.ts (rect left 16, top 92).
import { describe, expect, test, vi } from 'vitest';
import {
  createPlanInput,
  type InputSurface,
  type PlanPointerEvent,
  type PlanPointerReceiver,
} from './input';
import type { PlanView } from './view';

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
    getZoom100: () => 8 / 3,
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

describe('EZD-223 input palm touch', () => {
  test('a touch during a pen stroke is not delivered and the pen up still arrives', () => {
    const { surface, events } = setup(true);
    const pen = { id: 7, pointerType: 'pen' };
    pointer(surface, 'pointerdown', 100, 100, pen);
    pointer(surface, 'pointerdown', 400, 300, touch(8));
    pointer(surface, 'pointermove', 150, 120, pen);
    pointer(surface, 'pointermove', 420, 310, touch(8));
    pointer(surface, 'pointerup', 420, 310, touch(8));
    pointer(surface, 'pointerup', 200, 150, pen);
    expect(events.map((e) => `${e.kind}:${e.pointerType}`)).toEqual([
      'down:pen',
      'move:pen',
      'up:pen',
    ]);
    expect(events[2]!.screen).toEqual({ x: 200, y: 150 });
  });

  test('with no pen down, a single touch is still delivered', () => {
    const { surface, events } = setup(true);
    pointer(surface, 'pointerdown', 100, 100, touch(3));
    pointer(surface, 'pointerup', 100, 100, touch(3));
    expect(events.map((e) => `${e.kind}:${e.pointerType}`)).toEqual(['down:touch', 'up:touch']);
  });
});
