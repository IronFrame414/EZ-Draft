// EZD-507 (S05 Controls "Recessed light", "Ceiling fan", "Smoke or CO detector", "Speaker or low voltage", "Access
// panel"): each ceiling device tool places its chosen kind through the lazy RCP device module. EZD-511: a light
// clicked in an ACT room snaps into a tile.
import { CEILING_DEVICE_TOOL_IDS, type CeilingDeviceToolId } from '../../tools/ceiling-device-tool';
import { ceilingDeviceModule } from '../ceiling-tool-modules';
import { defineCeilingTool } from './types';

export const tool = defineCeilingTool({
  order: 200,
  tools: CEILING_DEVICE_TOOL_IDS,
  module: ceilingDeviceModule,
  make: (m, tool, w) =>
    m.deviceReceiver({
      ...w.base,
      tool: tool as CeilingDeviceToolId,
      choice: w.deviceChoice,
      actMinShare: w.actMinShare,
    }),
});
