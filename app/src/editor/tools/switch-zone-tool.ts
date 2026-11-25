// EZD-510 (S05 Controls "Switching zones | Left panel, Lighting | Draws switching zones and dimmers on the RCP (dashed
// accent lines). | Edit model."; AC-EZD-510-1 "Zones draw and save with the room"; vault/build/assumptions.md EZD-510):
// the Switching zones tool. While it is on (Ceiling or Both, Edit model and the lock), each click adds a corner; the
// first click must be inside a room, whose ceiling the zone saves with; a click on the first corner (once there are
// three) closes the outline, saves one `switch_zone` with the panel's Dimmer choice and selects it. Esc, Select or a
// surface change drops a half-drawn zone. Pure wiring: no React, no DOM.
// 11 Budgets (EZD-222, EZD-1401 precedent): the room lookup and the placement are given by the caller, so they load
// with the Ceiling view's lazy module (switch-zone.ts through rcp.ts) rather than in the editor's first download.
import type { ObjectStatus, Point } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { SurfaceSetting } from '../ceiling/surface';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { createValueStore } from '../shared/value-store';
type ZonePlacement = Pick<typeof import('./switch-zone'), 'roomAt' | 'placeSwitchZone'>;

/** A click this close to the first corner, in screen pixels, closes the zone (the 04 snap target size). */
export const ZONE_CLOSE_PX = 10;

export type ZoneDrawingState = {
  /** The corners clicked so far, in model inches; empty when no zone is being drawn. */
  points: readonly Point[];
  /** Where the first corner was clicked on screen, for the close test. */
  firstScreen: Point | null;
  /** The Dimmer choice the next zone takes. */
  dimmer: boolean;
};

export type ZoneDrawing = {
  get(): ZoneDrawingState;
  setDimmer(dimmer: boolean): void;
  start(at: Point, screen: Point): void;
  add(at: Point): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
};

export function createZoneDrawing(): ZoneDrawing {
  const store = createValueStore<ZoneDrawingState>({
    points: [],
    firstScreen: null,
    dimmer: false,
  });
  const { get, set } = store;
  return {
    get,
    setDimmer: (dimmer) => {
      if (dimmer !== get().dimmer) set({ ...get(), dimmer });
    },
    start: (at, screen) => set({ ...get(), points: [at], firstScreen: screen }),
    add: (at) => set({ ...get(), points: [...get().points, at] }),
    clear: () => {
      if (get().points.length > 0) set({ ...get(), points: [], firstScreen: null });
    },
    subscribe: store.subscribe,
  };
}

const byPage = new WeakMap<object, ZoneDrawing>();

/**
 * The page's zone drawing, one per surface setting (the page holds one while it is open), made on first ask and wired
 * to drop a half-drawn zone when the tool goes off. 11 Budgets: so the editor's first download holds none of it.
 */
export function zoneDrawingFor(surface: Pick<SurfaceSetting, 'get' | 'subscribe'>): ZoneDrawing {
  let drawing = byPage.get(surface);
  if (drawing === undefined) {
    drawing = createZoneDrawing();
    wireZoneDrawing(surface, drawing);
    byPage.set(surface, drawing);
  }
  return drawing;
}

/** Drops a half-drawn zone whenever the Switching zones tool is not on. */
export function wireZoneDrawing(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  drawing: Pick<ZoneDrawing, 'clear'>,
): () => void {
  const sync = () => {
    const s = surface.get();
    if (s.surface === 'floor' || s.tool !== 'switch-zone') drawing.clear();
  };
  sync();
  return surface.subscribe(sync);
}

export type ZoneToolDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  drawing: ZoneDrawing;
  chosenFloor: () => string | null;
  newStatus: () => ObjectStatus;
  newId: () => string;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
  place: ZonePlacement;
};

/** The Switching zones tool's pointer receiver: corners by click, closed on the first corner. */
export function switchZoneReceiver(deps: ZoneToolDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const objects = deps.store.getState().objects;
    const level = openFloorId(objects, deps.chosenFloor());
    if (level === null) return;
    const { points, firstScreen, dimmer } = deps.drawing.get();
    if (points.length === 0 || firstScreen === null) {
      if (deps.place.roomAt(objects, level, e.model) === null) {
        deps.onMessage('office.ceiling.zone.click_room');
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
    const change = deps.place.placeSwitchZone(
      objects,
      level,
      points,
      dimmer,
      deps.newStatus(),
      deps.newId,
    );
    deps.drawing.clear();
    if (change === null) {
      deps.onMessage('office.ceiling.zone.place_failed');
      return;
    }
    deps.store.applyEdit([change]);
    deps.select([change.id]);
  };
}
