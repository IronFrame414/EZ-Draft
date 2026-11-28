// EZD-510 (S05 Controls "Switching zones"): the Switching zones tool, turned on from the left panel's Lighting
// section; its drawing and placement come with the RCP module.
import { rcpModule } from '../rcp-module';
import { defineCeilingTool } from './types';

export const tool = defineCeilingTool({
  order: 300,
  tools: ['switch-zone'],
  module: rcpModule,
  keep: true,
  make: (m, _tool, w) => m.zoneReceiver(w.surface, w.base),
});
