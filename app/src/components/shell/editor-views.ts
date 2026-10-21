// The one editor view type (vault/plans/EZD-011b.md Step 1; 04 Header card).
import type { MessageKey } from '../../server/messages/catalog';

export const EDITOR_VIEWS = ['plan', '3d', 'sheets', 'render'] as const;

export type EditorView = (typeof EDITOR_VIEWS)[number];

export const VIEW_LABEL_KEYS: Record<EditorView, MessageKey> = {
  plan: 'office.header.view.plan',
  '3d': 'office.header.view.3d',
  sheets: 'office.header.view.sheets',
  render: 'office.header.view.render',
};
