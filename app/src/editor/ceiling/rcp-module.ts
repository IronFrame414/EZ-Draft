// EZD-502 (11 Budgets editor download size; 11 rule 7): the RCP drawing loads on the first switch to Ceiling or Both.
import { lazyModule } from '../../lib/lazy/lazy-module';

export const rcpModule = lazyModule(() => import('./rcp'));
