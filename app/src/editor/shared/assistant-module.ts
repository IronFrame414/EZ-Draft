// EZD-227 Build (11 Budgets; vault/build/assumptions.md EZD-227): the assistant panel loads when first opened, as the
// conflict list does; nothing shows for the moment it downloads, and a failed download is tried again on next open.
// EZD-1913c: one loader, read by the Assistant feature (features/assistant.tsx) and by the session's Assistant loader
// (given to createControllers through the feature page, shared/feature-page.ts).
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';

export const assistantPanelModule = lazyModule(() =>
  withScreenMessages(
    import('../../lib/messages/screens/assistant-panel.messages'),
    import('../../lazy/assistant-panel'),
  ),
);
