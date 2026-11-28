// EZD-511 (S05 Controls "Acoustical grid"): the ACT grid tool, balanced to the Defaults minimum border; it comes with
// the RCP module.
import { rcpModule } from '../rcp-module';
import { defineCeilingTool } from './types';

export const tool = defineCeilingTool({
  order: 700,
  tools: ['act-grid'],
  module: rcpModule,
  keep: true,
  make: (m, _tool, w) => m.actReceiver({ ...w.base, minShare: w.actMinShare }),
});
