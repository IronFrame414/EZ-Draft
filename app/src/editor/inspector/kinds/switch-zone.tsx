'use client';
// EZD-510: one switching zone alone shows its inspector with the Dimmer box. EZD-1915: a kind in registry.ts
// (editor plan 2.5).
import { SwitchZoneInspector } from './SwitchZonePanel';
import { aloneOfType, type InspectorKind, type InspectorKindProps } from './types';

function Panel({ ctx, id }: InspectorKindProps) {
  return <SwitchZoneInspector key={id} store={ctx.store} zoneId={id} canEdit={ctx.canEdit} />;
}

export const kind: InspectorKind = {
  id: 'switch_zone',
  order: 50,
  match: (ctx) => aloneOfType(ctx, 'switch_zone'),
  Panel,
};
