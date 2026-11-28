'use client';
// EZD-215: one engineer note alone shows its form. EZD-1915: a kind in registry.ts (editor plan 2.5).
import { EngineerNoteForm } from '../EngineerNoteForm';
import { aloneOfType, type InspectorKind, type InspectorKindProps } from './types';

function Panel({ ctx, id }: InspectorKindProps) {
  return (
    <EngineerNoteForm
      key={id}
      store={ctx.store}
      noteId={id}
      canEdit={ctx.canEdit}
      {...(ctx.projectId === undefined ? {} : { projectId: ctx.projectId })}
    />
  );
}

export const kind: InspectorKind = {
  id: 'engineer_note',
  order: 70,
  match: (ctx) => aloneOfType(ctx, 'engineer_note'),
  Panel,
};
