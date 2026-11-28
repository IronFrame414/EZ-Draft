'use client';
// EZD-507: one light or fan alone shows its inspector with the Fixture type. EZD-603: any one device alone (each has
// its height note). EZD-1915: a kind in registry.ts (editor plan 2.5).
import { DevicePanel } from './DevicePanel';
import { aloneOfType, type InspectorKind, type InspectorKindProps } from './types';

function Panel({ ctx, id }: InspectorKindProps) {
  return (
    <DevicePanel
      key={id}
      store={ctx.store}
      deviceId={id}
      canEdit={ctx.canEdit}
      fanClearance={ctx.fanClearance}
    />
  );
}

export const kind: InspectorKind = {
  id: 'device',
  order: 60,
  match: (ctx) => aloneOfType(ctx, 'device'),
  Panel,
};
