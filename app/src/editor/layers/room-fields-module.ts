// EZD-729: the lazy `room-fields` module, loaded when the Rooms tab is first opened (LeftPanel.tsx).
// EZD-229 (11 Budgets; EZD-120c B11): one handle, shared with the plan controller, which loads the same module for the
// plan marks of the existing details and floor transitions, so the editor's first download holds one loader, not two.
import { lazyModule } from '../../lib/lazy/lazy-module';

export const roomFieldsModule = lazyModule(() => import('../../lazy/room-fields'));
