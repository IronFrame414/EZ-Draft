'use client';
// EZD-511: one ACT grid alone shows its inspector. EZD-1915: a kind in registry.ts (editor plan 2.5).
import { ActGridInspector } from './ActGridPanel';
import { aloneOfType, type InspectorKind, type InspectorKindProps } from './types';

function Panel({ ctx, id }: InspectorKindProps) {
  return (
    <ActGridInspector
      key={id}
      store={ctx.store}
      gridId={id}
      canEdit={ctx.canEdit}
      minShare={ctx.actMinShare}
    />
  );
}

export const kind: InspectorKind = {
  id: 'act_grid',
  order: 40,
  match: (ctx) => aloneOfType(ctx, 'act_grid'),
  Panel,
};
