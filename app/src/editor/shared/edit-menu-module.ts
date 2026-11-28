// EZD-233: the edit menus load when one first opens and then stay, so the Save as group dialog outlives its menu.
// EZD-301 (S02 Entry): the Upload files dialog comes with the same module. EZD-1913c: one loader for both (the edit
// menus in ProjectEditor, the Upload dialog in features/upload.tsx).
import { lazyModule } from '../../lib/lazy/lazy-module';

export const editMenuModule = lazyModule(() => import('../../lazy/edit-menu'));
