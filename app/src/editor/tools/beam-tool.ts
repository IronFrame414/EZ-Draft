// EZD-505 (S05 Controls "Beam: Places faux beams on the selected ceiling surface. Edit model."; S05 Layout "Tool
// rail is the ceiling rail"): the Beam tool. While it is on (Ceiling or Both, Edit model and the lock), the plan's
// pointer goes to it before the drawing and selection receivers: a click in a room places a beam set on that room's
// ceiling and selects it; a click outside every room places nothing and says so. Beams are ceiling items, so on the
// Floor surface they neither draw nor pick (`ceilingAware`). Pure wiring: no React, no DOM.
import type { PhaseFilter } from '../../lib/plan/phase-view';
import type { SurfaceSetting } from '../ceiling/surface';
import type { PlanPointerReceiver } from '../plan/input';
// EZD-510 (11 Budgets): the tool's click receiver is in beam-receiver.ts, which loads with the Ceiling view's lazy
// module (lazy/beam-spacing) rather than in the editor's first download.

/** The types drawn and picked only on Ceiling and Both. EZD-510: switching zones too. */
export const CEILING_ONLY_TYPES: ReadonlySet<string> = new Set(['beam', 'switch_zone']);

type Listenable = { subscribe(listener: () => void): () => void };

/** The selection filter with ceiling items hidden on the Floor surface; a surface change is a new version. */
export function ceilingAware(
  base: PhaseFilter & Listenable,
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
): PhaseFilter & Listenable {
  const onFloor = () => surface.get().surface === 'floor';
  return {
    version: () => base.version() * 2 + (onFloor() ? 0 : 1),
    shown: (status) => base.shown(status),
    shownObject(type, status, kind) {
      if (onFloor() && CEILING_ONLY_TYPES.has(type)) return false;
      return base.shownObject ? base.shownObject(type, status, kind) : base.shown(status);
    },
    subscribe(listener) {
      const a = base.subscribe(listener);
      let last = onFloor();
      const b = surface.subscribe(() => {
        if (onFloor() === last) return;
        last = onFloor();
        listener();
      });
      return () => {
        a();
        b();
      };
    },
  };
}

/** Puts a tool's receiver in front of the shared one: `base` takes the drawing or selection receiver as before. */
export function receiverRouter(set: (r: PlanPointerReceiver | null) => void): {
  base(r: PlanPointerReceiver | null): void;
  tool(r: PlanPointerReceiver | null): void;
} {
  let base: PlanPointerReceiver | null = null;
  let tool: PlanPointerReceiver | null = null;
  let current: PlanPointerReceiver | null | undefined;
  const apply = () => {
    const next = tool ?? base;
    if (next === current) return;
    current = next;
    set(next);
  };
  return {
    base(r) {
      base = r;
      apply();
    },
    tool(r) {
      tool = r;
      apply();
    },
  };
}

/** Turns the receiver on while the surface shows the ceiling with the Beam tool and editing is allowed. */
export function wireBeamTool(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  route: (r: PlanPointerReceiver | null) => void,
  receiver: PlanPointerReceiver,
  mayEdit: boolean,
): () => void {
  const sync = () => {
    const s = surface.get();
    route(mayEdit && s.surface !== 'floor' && s.tool === 'beam' ? receiver : null);
  };
  sync();
  const off = surface.subscribe(sync);
  return () => {
    off();
    route(null);
  };
}
