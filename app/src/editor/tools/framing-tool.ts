// EZD-514 (S05 Controls "Framing known ... Enter locations: draw joist or beam lines with direction and spacing. Turns
// keep-clear checks on. | Edit model."; S05 Decision 5; vault/build/assumptions.md EZD-514): the framing line tool.
// The inspector's Framing known section turns it on for the selected room with the member (joist or beam) and spacing
// the next line takes. While it is on, the first click inside that room starts a line and the second ends it; the line
// is added to the room's framing (one change) and the tool stays on for the next line. A line within 10 degrees of
// level or plumb is squared to it. Esc, Select or a surface change drops a half-drawn line. Pure wiring: no React, no
// DOM.
import { pointInRing, type FramingMemberKind, type Point } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { SurfaceSetting } from '../ceiling/surface';
import { findRoom } from '../ceiling/room-ceiling';
import type { ModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { createValueStore } from '../shared/value-store';
import { addFramingLine } from './framing-edits';

/** Joists 16" on center unless set (the common 2x ceiling joist spacing; vault/build/assumptions.md EZD-514). */
export const DEFAULT_JOIST_SPACING_IN = 16;
/** A line drawn this close to level or plumb, in degrees, is squared to it. */
export const FRAMING_SQUARE_DEG = 10;

export type FramingDrawingState = {
  /** The room the lines are drawn on; null when the tool has not been turned on for a room. */
  roomId: string | null;
  kind: FramingMemberKind;
  /** The next line's spacing on center; null draws a single line. */
  spacing: number | null;
  /** The first click of the line being drawn. */
  start: Point | null;
};

export type FramingDrawing = {
  get(): FramingDrawingState;
  setTarget(roomId: string, kind: FramingMemberKind, spacing: number | null): void;
  start(at: Point): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function createFramingDrawing(): FramingDrawing {
  const store = createValueStore<FramingDrawingState>({
    roomId: null,
    kind: 'joist',
    spacing: DEFAULT_JOIST_SPACING_IN,
    start: null,
  });
  const { get, set } = store;
  return {
    get,
    setTarget: (roomId, kind, spacing) => set({ roomId, kind, spacing, start: null }),
    start: (at) => set({ ...get(), start: at }),
    clear: () => {
      if (get().start !== null) set({ ...get(), start: null });
    },
    subscribe: store.subscribe,
  };
}

const byPage = new WeakMap<object, FramingDrawing>();

/** The page's framing drawing, one per surface setting, wired to drop a half-drawn line when the tool goes off. */
export function framingDrawingFor(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
): FramingDrawing {
  let drawing = byPage.get(surface);
  if (drawing === undefined) {
    const d = createFramingDrawing();
    const sync = () => {
      const s = surface.get();
      if (s.surface === 'floor' || s.tool !== 'framing-line') d.clear();
    };
    sync();
    surface.subscribe(sync);
    byPage.set(surface, d);
    drawing = d;
  }
  return drawing;
}

/** `end` squared to level or plumb through `start` when the line is within FRAMING_SQUARE_DEG of it. */
export function squaredEnd(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (deg <= FRAMING_SQUARE_DEG) return { x: end.x, y: start.y };
  if (deg >= 90 - FRAMING_SQUARE_DEG) return { x: start.x, y: end.y };
  return end;
}

export type FramingToolDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  drawing: FramingDrawing;
  onMessage: (key: MessageKey) => void;
};

/** The framing line tool's pointer receiver: two clicks inside the target room add one line. */
export function framingLineReceiver(deps: FramingToolDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const { roomId, kind, spacing, start } = deps.drawing.get();
    if (roomId === null) return;
    const objects = deps.store.getState().objects;
    const room = findRoom(objects, roomId);
    if (room === null) return;
    if (!pointInRing(e.model, room.data.geometry.boundary)) {
      deps.onMessage('office.ceiling.framing.click_room');
      return;
    }
    if (start === null) {
      deps.drawing.start(e.model);
      return;
    }
    const end = squaredEnd(start, e.model);
    if (end.x === start.x && end.y === start.y) return;
    const change = addFramingLine(objects, roomId, { kind, start, end, spacing });
    deps.drawing.clear();
    if (change === null) {
      deps.onMessage('office.ceiling.framing.place_failed');
      return;
    }
    deps.store.applyEdit([change]);
  };
}
