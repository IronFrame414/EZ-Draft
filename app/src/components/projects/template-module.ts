// EZD-221b Build step 7 (vault/plans/EZD-221b.md Decided "Why lazy"; ARCH Entry points and lazy modules): the
// template picker module, fetched when New project reaches step 2. Shared by the step and the dialog's Create.
import { lazyModule, type LazyModule } from '../../lib/lazy/lazy-module';

export type TemplatePickerModule = typeof import('../../lazy/template-picker');

export const templateModule: LazyModule<TemplatePickerModule> = lazyModule(
  () => import('../../lazy/template-picker'),
);
