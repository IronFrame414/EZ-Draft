// EZD-234 Build (11 rule 7; EZD-120c B11 editor route budget): the Fixtures code that runs only after a user action
// (the panel, placing, the utilities-to-move list), one lazy module shared by the controller and the layer.
import { lazyModule } from '../../lib/lazy/lazy-module';

export const fixturesModule = lazyModule(() => import('../../lazy/fixtures-panel'));
