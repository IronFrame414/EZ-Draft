// Tool rail entry types (vault/plans/EZD-012a.md Step 4; 04 Tool rail).
import type { IconName } from '../icon/icon-names.generated';
import type { MessageKey } from '../../server/messages/catalog';

export type RailTool = {
  kind: 'tool';
  id: string;
  icon: IconName;
  label: MessageKey;
  shortcut: string;
};

export type RailSeparator = { kind: 'separator' };

export type RailEntry = RailTool | RailSeparator;
