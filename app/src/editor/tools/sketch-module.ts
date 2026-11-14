// EZD-223 (11 rule 7; EZD-120c B11 editor route budget): the Sketch stroke clean-up, one lazy module loaded when the
// Sketch tool is turned on.
import { lazyModule } from '../../lib/lazy/lazy-module';

export const sketchModule = lazyModule(() => import('../../lazy/sketch-clean'));
