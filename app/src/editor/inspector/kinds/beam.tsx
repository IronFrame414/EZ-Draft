'use client';
// EZD-505: one beam set alone shows the beam inspector. EZD-1915: a kind in registry.ts (editor plan 2.5).
import { BeamPanel } from './BeamPanel';
import { aloneOfType, type InspectorKind, type InspectorKindProps } from './types';

function Panel({ ctx, id }: InspectorKindProps) {
  return <BeamPanel key={id} store={ctx.store} beamId={id} canEdit={ctx.canEdit} />;
}

export const kind: InspectorKind = {
  id: 'beam',
  order: 30,
  match: (ctx) => aloneOfType(ctx, 'beam'),
  Panel,
};
