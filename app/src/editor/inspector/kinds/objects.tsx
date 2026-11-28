'use client';
// EZD-213a/b/c (editor plan 2.5 "otherwise wall / opening / bulk ... with CeilingFlags"): the last kind, shown when no
// kind before it names the selection. Nothing selected is the empty inspector (EZD-214). EZD-515: one other hosted
// ceiling item alone (detector, low voltage, access panel, register) shows its flag above its inspector (S05
// Validation "Hosted ceiling item left off any ceiling surface: red flag"; Q-0630 "the words show in the inspector
// on click"). EZD-1915: moved out of InspectorPanel.tsx unchanged; InspectorPanel.tsx re-exports InspectorContent.
import type { ReactElement } from 'react';
import { InspectorEmpty } from '../InspectorEmpty';
import { BulkPanel } from './BulkPanel';
import { CeilingFlags } from './DevicePanel';
import { OpeningPanel } from './OpeningPanel';
import type { InspectorContentProps, InspectorKind, InspectorKindProps } from './types';
import { WallPanel } from './WallPanel';

export function InspectorContent(props: InspectorContentProps): ReactElement {
  const { view } = props;
  if (view.kind === 'empty') return <InspectorEmpty coarse={props.coarse} />;
  if (view.kind === 'wall') return <WallPanel {...props} view={view} />;
  if (view.kind === 'opening') return <OpeningPanel {...props} view={view} />;
  return <BulkPanel {...props} view={view} />;
}

function Panel({ ctx, content }: InspectorKindProps) {
  const shown = <InspectorContent key={ctx.idsKey} {...content} />;
  if (ctx.ids.length !== 1) return shown;
  return (
    <>
      <CeilingFlags
        objects={ctx.objects}
        id={ctx.ids[0]!}
        canEdit={ctx.canEdit}
        fanClearance={ctx.fanClearance}
      />
      {shown}
    </>
  );
}

export const kind: InspectorKind = {
  id: 'wall_opening_bulk',
  order: 80,
  // Always shown when reached: the selection's wall, opening or bulk view, or the empty inspector.
  match: (ctx) => ctx.idsKey,
  Panel,
};
