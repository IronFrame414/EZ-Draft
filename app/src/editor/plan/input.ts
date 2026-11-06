// EZD-207a Build step 8 (vault/plans/EZD-207a.md Decided "Wheel", "Pan", "Space", "Context menu", "Pointer
// hand-off", "Pointer capture", "Cursor", "Region rect"; S03 Canvas interactions; 11 rule 4): pointer, wheel and
// key input on the canvas region. Pans and zooms go straight to `setView`; other left input goes to the receiver.
// No React; the region rect is read on down, enter and wheel only, never per move. EZD-207b Build step 6
// (vault/plans/EZD-207b.md Decided "Input hover"; C9): mouse and pen moves that are not panning go to `onHover`,
// and leaving the region or starting a pan clears it; touch never hovers.
import type { Point } from '@ezdraft/geometry';
import { panBy, regionToModel, wheelZoomFactor, zoomAt, type PlanView } from './view';

export type PlanPointerKind = 'down' | 'move' | 'up' | 'cancel' | 'click' | 'dblclick';
export type PlanPointerEvent = {
  kind: PlanPointerKind;
  model: Point;
  screen: Point;
  pointerType: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};
export type PlanPointerReceiver = (event: PlanPointerEvent) => void;
export type InputSurface = EventTarget & {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  setPointerCapture?(id: number): void;
};
export type PlanInputOptions = {
  surface: InputSurface;
  keys: EventTarget;
  getView(): PlanView;
  setView(view: PlanView): void;
  getReceiver(): PlanPointerReceiver | null;
  onHover?(screen: Point | null): void;
};
export type PlanInput = { getCursor(): Point | null; dispose(): void };

type Pointerish = {
  pointerId: number;
  pointerType?: string;
  button: number;
  clientX: number;
  clientY: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
};
type Wheelish = Pointerish & { deltaY: number; deltaMode: number };

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTypingTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') return false;
  const t = target as { tagName?: unknown; isContentEditable?: unknown };
  return (
    (typeof t.tagName === 'string' && TYPING_TAGS.has(t.tagName)) || t.isContentEditable === true
  );
}

const centroid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function createPlanInput(o: PlanInputOptions): PlanInput {
  const { surface, keys } = o;
  let rect = surface.getBoundingClientRect();
  let cursor: Point | null = null;
  let spaceHeld = false;
  // Mouse or pen pointers that are panning, with their last region point.
  const pans = new Map<number, Point>();
  // At most two touch pointers, with their last region point.
  const touches = new Map<number, Point>();
  let delivered: { id: number; at: Point } | null = null;
  let lastDownDelivered = false;

  const toRegion = (e: Pointerish): Point => ({
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  });
  const isTouch = (e: Pointerish) => e.pointerType === 'touch';

  const deliver = (kind: PlanPointerKind, screen: Point, e: Pointerish): boolean => {
    const receiver = o.getReceiver();
    if (receiver === null) return false;
    receiver({
      kind,
      model: regionToModel(o.getView(), screen),
      screen,
      pointerType: typeof e.pointerType === 'string' ? e.pointerType : 'mouse',
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
    });
    return true;
  };

  const onDown = (event: Event) => {
    const e = event as unknown as Pointerish;
    rect = surface.getBoundingClientRect();
    const p = toRegion(e);
    cursor = p;
    try {
      surface.setPointerCapture?.(e.pointerId);
    } catch {
      // A pointer that cannot be captured still works inside the region.
    }
    lastDownDelivered = false;
    if (isTouch(e)) {
      if (touches.size >= 2) return;
      touches.set(e.pointerId, p);
      if (touches.size === 1) {
        if (deliver('down', p, e)) {
          delivered = { id: e.pointerId, at: p };
          lastDownDelivered = true;
        }
      } else if (delivered !== null && touches.has(delivered.id)) {
        deliver('cancel', delivered.at, e);
        delivered = null;
      }
      return;
    }
    if (e.button === 2 || (e.button === 0 && spaceHeld)) {
      o.onHover?.(null);
      pans.set(e.pointerId, p);
      return;
    }
    if (e.button === 0 && deliver('down', p, e)) {
      delivered = { id: e.pointerId, at: p };
      lastDownDelivered = true;
    }
  };

  const onMove = (event: Event) => {
    const e = event as unknown as Pointerish;
    const p = toRegion(e);
    cursor = p;
    if (isTouch(e)) {
      const last = touches.get(e.pointerId);
      if (last === undefined) return;
      if (touches.size === 2) {
        const [a, b] = [...touches.values()];
        const beforeCentre = centroid(a, b);
        const beforeDistance = distance(a, b);
        touches.set(e.pointerId, p);
        const [c, d] = [...touches.values()];
        const afterCentre = centroid(c, d);
        const afterDistance = distance(c, d);
        const ratio = beforeDistance === 0 ? 1 : afterDistance / beforeDistance;
        const panned = panBy(
          o.getView(),
          afterCentre.x - beforeCentre.x,
          afterCentre.y - beforeCentre.y,
        );
        o.setView(zoomAt(panned, afterCentre, ratio));
        return;
      }
      touches.set(e.pointerId, p);
      if (delivered !== null && delivered.id === e.pointerId) {
        delivered.at = p;
        deliver('move', p, e);
      }
      return;
    }
    const last = pans.get(e.pointerId);
    if (last !== undefined) {
      pans.set(e.pointerId, p);
      o.setView(panBy(o.getView(), p.x - last.x, p.y - last.y));
      return;
    }
    if (delivered !== null && delivered.id === e.pointerId) delivered.at = p;
    deliver('move', p, e);
    o.onHover?.(p);
  };

  const end = (kind: 'up' | 'cancel') => (event: Event) => {
    const e = event as unknown as Pointerish;
    touches.delete(e.pointerId);
    pans.delete(e.pointerId);
    if (delivered !== null && delivered.id === e.pointerId) {
      delivered = null;
      deliver(kind, toRegion(e), e);
    }
  };
  const onUp = end('up');
  const onCancel = end('cancel');

  const click = (kind: 'click' | 'dblclick') => (event: Event) => {
    const e = event as unknown as Pointerish;
    if (e.button !== 0 || !lastDownDelivered) return;
    deliver(kind, toRegion(e), e);
  };
  const onClick = click('click');
  const onDblClick = click('dblclick');

  const onEnter = () => {
    rect = surface.getBoundingClientRect();
  };

  const onLeave = (event: Event) => {
    if (isTouch(event as unknown as Pointerish)) return;
    o.onHover?.(null);
  };

  const onWheel = (event: Event) => {
    const e = event as unknown as Wheelish;
    event.preventDefault();
    rect = surface.getBoundingClientRect();
    const p = toRegion(e);
    cursor = p;
    o.setView(zoomAt(o.getView(), p, wheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey)));
  };

  const onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.key === ' ' && !isTypingTarget(e.target)) spaceHeld = true;
  };
  const onKeyUp = (event: Event) => {
    if ((event as KeyboardEvent).key === ' ') spaceHeld = false;
  };
  const onBlur = () => {
    spaceHeld = false;
  };

  const surfaceListeners: Array<[string, (e: Event) => void]> = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel],
    ['pointerenter', onEnter],
    ['pointerleave', onLeave],
    ['click', onClick],
    ['dblclick', onDblClick],
    ['contextmenu', onContextMenu],
  ];
  const keyListeners: Array<[string, (e: Event) => void]> = [
    ['keydown', onKeyDown],
    ['keyup', onKeyUp],
    ['blur', onBlur],
  ];
  for (const [type, fn] of surfaceListeners) surface.addEventListener(type, fn);
  surface.addEventListener('wheel', onWheel, { passive: false });
  for (const [type, fn] of keyListeners) keys.addEventListener(type, fn);

  return {
    getCursor: () => cursor,
    dispose() {
      for (const [type, fn] of surfaceListeners) surface.removeEventListener(type, fn);
      surface.removeEventListener('wheel', onWheel);
      for (const [type, fn] of keyListeners) keys.removeEventListener(type, fn);
      pans.clear();
      touches.clear();
      delivered = null;
    },
  };
}
