// EZD-5605 (vault/plans/EZD-5605.md D-Wire): Adjust and Accept for one preview store, made from the panel's lazy
// module so the editor route holds none of their code (11 Budgets).
import type { OutboxSync } from '../../lib/outbox/outbox-sync';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { RoutedStore } from '../model/routed-store';
import { createAcceptController, type AcceptController } from './accept';
import { createAdjustController, type AdjustController, type AdjustDeps } from './adjust';
import type { PreviewStore } from './preview-store';

export type AssistantControls = { adjust: AdjustController; accept: AcceptController };

export function createAssistantControls(d: {
  projectId: string;
  lockEpoch: number;
  model: ModelStore;
  routed: RoutedStore;
  previews: PreviewStore;
  sync: Pick<OutboxSync, 'sendNow'>;
  selection: AdjustDeps['selection'];
  drawing: AdjustDeps['drawing'];
  onMessage: (key: MessageKey) => void;
}): AssistantControls {
  const adjust = createAdjustController(d);
  const accept = createAcceptController({ ...d, adjust });
  return { adjust, accept };
}
