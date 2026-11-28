'use client';
// EZD-218 (P213a "Selection ids"; Q-0679 (b)): a room selected alone shows its name as the title and one line
// pointing to the Rooms tab. EZD-514: on Ceiling or Both the selected room is its ceiling, with its Framing known
// section. EZD-1915: the first kind in registry.ts (editor plan 2.5 "Room alone → room note").
import type { ReactNode } from 'react';
import { useT } from '../../../lib/messages';
import { FramingKnownSection } from '../FramingKnown';
import { roomNameOf } from '../inspector-view';
import styles from '../InspectorPanel.module.css';
import { Header } from './SharedFields';
import type { InspectorKind, InspectorKindProps } from './types';

function RoomNote({
  name,
  canEdit,
  children,
}: {
  name: string;
  canEdit: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className={styles.panel} data-testid="inspector" data-inspector-kind="room">
      <Header title={name} subtitle={t('office.inspector.room_in_rooms_tab')} canEdit={canEdit} />
      {children}
    </div>
  );
}

function Panel({ ctx, id }: InspectorKindProps) {
  return (
    <RoomNote name={roomNameOf(ctx.objects, id)!} canEdit={ctx.canEdit}>
      {ctx.surface === undefined ||
      ctx.framingDrawing === undefined ||
      ctx.shownSurface === 'floor' ? null : (
        <FramingKnownSection
          key={id}
          store={ctx.store}
          roomId={id}
          canEdit={ctx.canEdit}
          surface={ctx.surface}
          drawing={ctx.framingDrawing}
        />
      )}
    </RoomNote>
  );
}

export const kind: InspectorKind = {
  id: 'room',
  order: 10,
  // The room's id; the inspector's ids leave rooms out, so the raw selection is read.
  match: (ctx) =>
    ctx.selectedIds.length === 1 &&
    ctx.ids.length === 0 &&
    roomNameOf(ctx.objects, ctx.selectedIds[0]!) !== null
      ? ctx.selectedIds[0]!
      : null,
  Panel,
};
