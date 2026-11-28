// EZD-514 (S05 Controls "Framing known"): the framing line tool, turned on from the inspector's Framing known section;
// it comes with the RCP module.
import { rcpModule } from '../rcp-module';
import { defineCeilingTool } from './types';

export const tool = defineCeilingTool({
  order: 400,
  tools: ['framing-line'],
  module: rcpModule,
  keep: true,
  make: (m, _tool, w) => m.framingReceiver(w.surface, w.base),
});
