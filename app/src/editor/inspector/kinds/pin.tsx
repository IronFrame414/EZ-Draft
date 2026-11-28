'use client';
// EZD-220: one pin alone shows the pin inspector. EZD-1915: a kind in registry.ts (editor plan 2.5).
import { PinPanel } from '../PinPanel';
import { aloneOfType, type InspectorKind, type InspectorKindProps } from './types';

function Panel({ ctx, id }: InspectorKindProps) {
  return (
    <PinPanel
      key={id}
      store={ctx.store}
      pinId={id}
      canEdit={ctx.canEdit}
      {...(ctx.projectId === undefined ? {} : { projectId: ctx.projectId })}
    />
  );
}

export const kind: InspectorKind = {
  id: 'pin',
  order: 20,
  match: (ctx) => aloneOfType(ctx, 'pin'),
  Panel,
};
