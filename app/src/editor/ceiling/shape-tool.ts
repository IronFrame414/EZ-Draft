// EZD-513 (S05 Controls "Soffit, tray, coffer | Ceiling rail | Draws a soffit, tray, coffer or crown; edges get
// dimensions. | Edit model.", "Height and material tag | Ceiling rail | Click an area to place a tag ... | Edit model.";
// AC-EZD-513-1, -2; vault/build/assumptions.md EZD-513): the two rail tools' wiring. Soffit, tray, coffer: while it is
// on, each click adds a corner; the first click must be inside a room; a click on the first corner (once there are
// three) closes the outline and saves one soffit, tray, coffer or crown of the chosen kind and size, and selects it.
// Esc, Select or a surface change drops a half-drawn outline. Height and material tag: a click inside a room places a
// tag there and selects it. Pure wiring: no React, no DOM; loaded with the Ceiling view's lazy module (rcp.ts).
import type { ObjectStatus, Point } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { roomAt } from '../tools/beam-edits';
import { ZONE_CLOSE_PX } from '../tools/switch-zone-tool';
import {
  DEFAULT_SHAPE_DEPTH_IN,
  placeCeilingShape,
  placeCeilingTag,
  type ShapeKind,
} from './ceiling-shapes';
import type { SurfaceSetting } from './surface';

export type ShapeDrawingState = {
  /** The corners clicked so far, in model inches; empty when no outline is being drawn. */
  points: readonly Point[];
  /** Where the first corner was clicked on screen, for the close test. */
  firstScreen: Point | null;
  /** The kind the next outline saves as. */
  kind: ShapeKind;
  /** The size in inches each kind's next outline takes (a soffit's drop, a tray's rise, ...). */
  depths: Readonly<Record<ShapeKind, number>>;
};

export type ShapeDrawing = {
  get(): ShapeDrawingState;
  setKind(kind: ShapeKind): void;
  setDepth(kind: ShapeKind, inches: number): void;
  start(at: Point, screen: Point): void;
  add(at: Point): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function createShapeDrawing(): ShapeDrawing {
  let state: ShapeDrawingState = {
    points: [],
    firstScreen: null,
    kind: 'soffit',
    depths: DEFAULT_SHAPE_DEPTH_IN,
  };
  const listeners = new Set<() => void>();
  const set = (next: ShapeDrawingState) => {
    state = next;
    for (const l of [...listeners]) l();
  };
  return {
    get: () => state,
    setKind: (kind) => {
      if (kind !== state.kind) set({ ...state, kind });
    },
    setDepth: (kind, inches) => {
      if (inches > 0 && state.depths[kind] !== inches)
        set({ ...state, depths: { ...state.depths, [kind]: inches } });
    },
    start: (at, screen) => set({ ...state, points: [at], firstScreen: screen }),
    add: (at) => set({ ...state, points: [...state.points, at] }),
    clear: () => {
      if (state.points.length > 0) set({ ...state, points: [], firstScreen: null });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const byPage = new WeakMap<object, ShapeDrawing>();

/** The page's outline drawing, one per surface setting, wired to drop a half-drawn outline when the tool goes off. */
export function shapeDrawingFor(surface: Pick<SurfaceSetting, 'get' | 'subscribe'>): ShapeDrawing {
  let drawing = byPage.get(surface);
  if (drawing === undefined) {
    const made = createShapeDrawing();
    const sync = () => {
      const s = surface.get();
      if (s.surface === 'floor' || s.tool !== 'soffit') made.clear();
    };
    sync();
    surface.subscribe(sync);
    drawing = made;
    byPage.set(surface, drawing);
  }
  return drawing;
}

export type CeilingToolDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  chosenFloor: () => string | null;
  newStatus: () => ObjectStatus;
  newId: () => string;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
};

/** The Soffit, tray, coffer tool's pointer receiver: corners by click, closed on the first corner. */
export function shapeReceiver(
  deps: CeilingToolDeps & { drawing: ShapeDrawing },
): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const objects = deps.store.getState().objects;
    const level = openFloorId(objects, deps.chosenFloor());
    if (level === null) return;
    const { points, firstScreen, kind, depths } = deps.drawing.get();
    if (points.length === 0 || firstScreen === null) {
      if (roomAt(objects, level, e.model) === null) {
        deps.onMessage('office.ceiling.shape.click_room');
        return;
      }
      deps.drawing.start(e.model, e.screen);
      return;
    }
    const onFirst =
      Math.hypot(e.screen.x - firstScreen.x, e.screen.y - firstScreen.y) <= ZONE_CLOSE_PX;
    if (!onFirst) {
      deps.drawing.add(e.model);
      return;
    }
    if (points.length < 3) return;
    const change = placeCeilingShape(
      objects,
      level,
      kind,
      points,
      depths[kind],
      deps.newStatus(),
      deps.newId,
    );
    deps.drawing.clear();
    if (change === null) {
      deps.onMessage('office.ceiling.shape.place_failed');
      return;
    }
    deps.store.applyEdit([change]);
    deps.select([change.id]);
  };
}

/** The Height and material tag tool's pointer receiver: a click inside a room places a tag there. */
export function tagReceiver(deps: CeilingToolDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const objects = deps.store.getState().objects;
    const level = openFloorId(objects, deps.chosenFloor());
    if (level === null) return;
    const change = placeCeilingTag(objects, level, e.model, deps.newStatus(), deps.newId);
    if (change === null) {
      deps.onMessage('office.ceiling.tag.click_room');
      return;
    }
    deps.store.applyEdit([change]);
    deps.select([change.id]);
  };
}
