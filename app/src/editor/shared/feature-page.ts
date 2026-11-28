// EZD-1913b (editor plan 5.3 "features plug in"): what the plan's features share for the life of one editor page,
// made once before the session opens (as ProjectEditor made them before Ceiling and Electrical moved into features/):
// - EZD-502 (S05 Entry points; AC-EZD-502-1): the plan's surface (Floor, Ceiling, Both). EZD-505: made before the
//   session so selection can leave ceiling items out on Floor; it outlives a reopen (Revert, Retry).
// - EZD-507: the kind each ceiling device tool places next.
// - EZD-602: where the electrical device toolbar puts its armed item's receiver.
import type { ToolBase } from '../electrical';
import { createReceiverSlot, type ReceiverSlot } from '../electrical/receiver-slot';
import { createSurfaceSetting, type SurfaceSetting } from '../ceiling/surface';
import { createDeviceChoice, type DeviceChoice } from '../tools/ceiling-device-tool';

export type FeaturePage = {
  readonly surface: SurfaceSetting;
  readonly deviceChoice: DeviceChoice;
  readonly deviceSlot: ReceiverSlot<ToolBase>;
};

export function createFeaturePage(): FeaturePage {
  return {
    surface: createSurfaceSetting(),
    deviceChoice: createDeviceChoice(),
    deviceSlot: createReceiverSlot<ToolBase>(),
  };
}
