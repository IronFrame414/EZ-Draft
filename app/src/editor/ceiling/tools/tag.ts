// EZD-513 (S05 Controls "Height and material tag"): the tag tool; it comes with the RCP module.
import { rcpModule } from '../rcp-module';
import { defineCeilingTool } from './types';

export const tool = defineCeilingTool({
  order: 600,
  tools: ['tag'],
  module: rcpModule,
  keep: true,
  make: (m, _tool, w) => m.tagReceiver(w.base),
});
