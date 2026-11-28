// EZD-505 (S05 Controls "Beam"): the Beam tool's click receiver, placing through the beam spacing module (EZD-1401).
import { beamSpacingModule } from '../ceiling-tool-modules';
import { defineCeilingTool } from './types';

export const tool = defineCeilingTool({
  order: 100,
  tools: ['beam'],
  module: beamSpacingModule,
  make: (m, _tool, w) => m.beamReceiver(w.base),
});
