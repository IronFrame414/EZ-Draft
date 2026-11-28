// EZD-513 (S05 Controls "Soffit, tray, coffer"): the outline tool, corners by click; it comes with the RCP module.
import { rcpModule } from '../rcp-module';
import { defineCeilingTool } from './types';

export const tool = defineCeilingTool({
  order: 500,
  tools: ['soffit'],
  module: rcpModule,
  keep: true,
  make: (m, _tool, w) => m.shapeReceiver(w.surface, w.base),
});
