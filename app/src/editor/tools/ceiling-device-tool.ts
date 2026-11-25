// EZD-507 (S05 Controls "Recessed light: Click to place a can. Same object as on the electrical plan (06)", "Ceiling
// fan: Click to place a fan", "Smoke or CO detector: Places a detector, status existing or proposed. Same object as
// electrical plan", "Speaker or low voltage: Places in-ceiling speaker, camera or Wi-Fi access point", "Access panel:
// Places an access panel or attic hatch", all "Edit model"; AC-EZD-507-1, -2): the ceiling device tools. While one is
// on (Ceiling or Both, Edit model and the lock), a click places that tool's chosen kind at the click with the View's
// status and selects it. The object is the plan's own `device` or `access` object, so the floor plan, the electrical
// Devices tab and the RCP all show the one id. Pure wiring: no React, no DOM.
// One wire routes every ceiling tool's receiver (`wireCeilingTools`), so turning one tool off never clears another's.
import type { CeilingToolId, SurfaceSetting } from '../ceiling/surface';
import type { PlanPointerReceiver } from '../plan/input';
import { createValueStore } from '../shared/value-store';
// EZD-510 (11 Budgets): the tools' click receiver is in ceiling-device-receiver.ts, which loads with the Ceiling view's
// lazy module (lazy/rcp) rather than in the editor's first download.
export type CeilingDeviceKind = import('./fixture-tool').CeilingDeviceKind;

export type CeilingDeviceToolId = Extract<
  CeilingToolId,
  'recessed-light' | 'ceiling-fan' | 'detector' | 'low-voltage' | 'access-panel'
>;

/** Each device tool's kinds, the first its starting choice (vault/build/assumptions.md EZD-507). */
export const DEVICE_TOOL_KINDS: Readonly<
  Record<CeilingDeviceToolId, readonly CeilingDeviceKind[]>
> = {
  'recessed-light': ['recessed_light'],
  'ceiling-fan': ['ceiling_fan'],
  detector: ['smoke_detector', 'co_detector', 'smoke_co_detector'],
  'low-voltage': ['speaker', 'camera', 'wifi_ap'],
  'access-panel': ['access_panel', 'attic_hatch'],
};
export const CEILING_DEVICE_TOOL_IDS = Object.keys(DEVICE_TOOL_KINDS) as CeilingDeviceToolId[];

export const isDeviceTool = (tool: string | null): tool is CeilingDeviceToolId =>
  tool !== null && Object.hasOwn(DEVICE_TOOL_KINDS, tool);

/** The kind each device tool places next: the page's choice, kept while the page is open. */
export type DeviceChoice = {
  get(tool: CeilingDeviceToolId): CeilingDeviceKind;
  set(tool: CeilingDeviceToolId, kind: CeilingDeviceKind): void;
  subscribe(listener: () => void): () => void;
};

export function createDeviceChoice(): DeviceChoice {
  // A new record on each choice, so the store sees the change.
  const chosen = createValueStore<Partial<Record<CeilingDeviceToolId, CeilingDeviceKind>>>({});
  return {
    get: (tool) => chosen.get()[tool] ?? DEVICE_TOOL_KINDS[tool][0]!,
    set(tool, kind) {
      if (!DEVICE_TOOL_KINDS[tool].includes(kind) || chosen.get()[tool] === kind) return;
      chosen.set({ ...chosen.get(), [tool]: kind });
    },
    subscribe: chosen.subscribe,
  };
}

/**
 * Routes the receiver of the ceiling tool that is on while the surface shows the ceiling and editing is allowed, and
 * none otherwise. Replaces one wire per tool, which would race on the shared route. EZD-602: on the floor plan it
 * routes `floorTool`'s receiver (the electrical device toolbar's armed item) instead.
 */
export function wireCeilingTools(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  route: (r: PlanPointerReceiver | null) => void,
  receivers: Partial<Record<CeilingToolId, PlanPointerReceiver>>,
  mayEdit: boolean,
  floorTool?: {
    getState(): { tool: PlanPointerReceiver | null };
    subscribe(listener: () => void): () => void;
  },
): () => void {
  const sync = () => {
    const s = surface.get();
    // EZD-602: on the floor plan the one route carries the electrical device toolbar's armed item, if any.
    const r =
      s.surface === 'floor'
        ? floorTool?.getState().tool
        : s.tool === null
          ? undefined
          : receivers[s.tool];
    route(mayEdit && r ? r : null);
  };
  sync();
  const off = surface.subscribe(sync);
  const offFloor = floorTool?.subscribe(sync);
  return () => {
    off();
    offFloor?.();
    route(null);
  };
}

// EZD-513 (11 Budgets): the fixture type view and edit, used only by the lazy inspector, are in fixture-type.ts so the
// editor's first download holds none of them.
