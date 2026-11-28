// EZD-1914 (11 Budgets; EZD-1401, EZD-507 precedent): the lazy modules the ceiling tools place through, held once so
// the tools (ceiling/tools/) and the parts that load the same code (the beam spacing pill, the device kind chooser,
// features/ceiling.tsx) share one handle: a module one of them loaded is there at once for the others.
import { lazyModule } from '../../lib/lazy/lazy-module';

// EZD-1401: the beam spacing pill and the Beam tool's placement load when the Ceiling or Both view first shows.
export const beamSpacingModule = lazyModule(() => import('../../lazy/beam-spacing'));

// EZD-507: the ceiling device tools' placement and kind chooser load when a device tool is first turned on.
export const ceilingDeviceModule = lazyModule(() => import('../../lazy/rcp'));
