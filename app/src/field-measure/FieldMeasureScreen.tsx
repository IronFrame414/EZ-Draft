'use client';
// EZD-1415 (S17b Field measure; AC-EZD-1415-1 "An L-shaped room can be drawn and each wall selected on a phone";
// board S17bFieldMeasure). Layout: header (Projects, title, project), room chips with Building and + Room, shape
// picker, the canvas with lettered walls, the active wall field and the ceiling field, the hint line with walls
// done. Picking a template selects wall A; tapping a letter or a wall selects it (cobalt) and the wall field shows
// "Wall C" and its value. Every change is saved whole to /api/projects/[id]/field-measure after SAVE_DELAY_MS.
// Not here: the keypad, Next wall, auto-fill and closure (EZD-1416), Saved on phone and Send to office
// (EZD-1417), and the confirms and read-only sent state (EZD-1419). Without Send field measurement the screen is
// view only: walls can be selected, nothing changes.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatLength } from '@ezdraft/geometry';
import { Icon } from '../components/icon/Icon';
import { useT } from '../lib/messages';
import { CeilingField } from './CeilingField';
import { RoomChips } from './RoomChips';
import { ShapeCanvas } from './ShapeCanvas';
import { ShapePicker } from './ShapePicker';
import { emptyRoom, uniqueName, withOutline, withShape, type FieldRoom } from './rooms';
import { addCorner, cornersOf, wallLetter, wallsOf, type Pt, type ShapeKind } from './shapes';
import styles from './FieldMeasure.module.css';

export const SAVE_DELAY_MS = 600;

export type FieldMeasureScreenProps = {
  projectId: string;
  projectName: string;
  initialRooms: FieldRoom[];
  canEdit: boolean;
};

function newRoomId(rooms: readonly FieldRoom[]): string {
  let n = rooms.length;
  while (rooms.some((r) => r.id === `r${n}`)) n += 1;
  return `r${n}`;
}

export function FieldMeasureScreen({
  projectId,
  projectName,
  initialRooms,
  canEdit,
}: FieldMeasureScreenProps) {
  const t = useT();
  const [rooms, setRooms] = useState<FieldRoom[]>(initialRooms);
  const [activeId, setActiveId] = useState<string>(initialRooms[0]?.id ?? '');
  const [selected, setSelected] = useState<number | null>(
    (initialRooms[0]?.lengths.length ?? 0) > 0 ? 0 : null,
  );
  const changed = useRef(false);

  // Save the rooms whole once they stop changing. The offline queue and Saved on phone are EZD-1417.
  useEffect(() => {
    if (!changed.current || !canEdit) return;
    const timer = setTimeout(() => {
      void fetch(`/api/projects/${projectId}/field-measure`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms }),
      }).catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [rooms, canEdit, projectId]);

  const room = rooms.find((r) => r.id === activeId) ?? (rooms[0] as FieldRoom);
  const corners = cornersOf(room.shape, room.corners);
  const closed = room.shape !== null && (room.shape !== 'walls' || room.closed);
  const walls = wallsOf(corners, closed);
  const total = walls.length;
  const done = room.lengths.filter((l) => l !== null).length;
  const wall = selected !== null && selected < total ? selected : null;

  const update = (next: FieldRoom) => {
    changed.current = true;
    setRooms((rs) => rs.map((r) => (r.id === next.id ? next : r)));
  };

  const switchRoom = (id: string) => {
    const next = rooms.find((r) => r.id === id);
    setActiveId(id);
    setSelected(next !== undefined && next.lengths.length > 0 ? 0 : null);
  };

  const addRoom = (name: string) => {
    const r = emptyRoom(newRoomId(rooms), 'room', uniqueName(rooms, name));
    changed.current = true;
    setRooms((rs) => [...rs, r]);
    setActiveId(r.id);
    setSelected(null);
  };

  const pickShape = (shape: ShapeKind) => {
    if (shape === room.shape) return;
    const next = withShape(room, shape);
    update(next);
    setSelected(next.lengths.length > 0 ? 0 : null);
  };

  const tapCanvas = (p: Pt, held: boolean) => {
    const outline = addCorner({ corners: room.corners, closed: room.closed }, p, held);
    if (outline.corners === room.corners && outline.closed === room.closed) return;
    const next = withOutline(room, outline.corners, outline.closed);
    update(next);
    // The wall just drawn (or, on closing, the closing wall) is selected.
    setSelected(next.lengths.length > 0 ? next.lengths.length - 1 : null);
  };

  const wallValue = wall === null ? null : (room.lengths[wall] ?? null);

  return (
    <div className={styles.screen} data-testid="field-measure">
      <header className={styles.header}>
        <div className={styles.topRow}>
          <Link className={styles.back} href="/">
            <Icon name="arrow_back" size={16} />
            {t('field.measure.back')}
          </Link>
        </div>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t('field.measure.title')}</h1>
          <span className={styles.project}>{projectName}</span>
        </div>
        <RoomChips
          rooms={rooms}
          activeId={room.id}
          canAdd={canEdit}
          onSwitch={switchRoom}
          onAdd={addRoom}
        />
      </header>
      <div className={styles.body}>
        <ShapePicker value={room.shape} disabled={!canEdit} onPick={pickShape} />
        <div className={styles.canvasCard}>
          <ShapeCanvas
            corners={corners}
            closed={closed}
            freeMode={room.shape === 'walls'}
            lengths={room.lengths}
            selected={wall}
            editable={canEdit}
            onSelect={setSelected}
            onTap={tapCanvas}
          />
          {room.shape === null ? <p className={styles.canvasHint}>{t('field.measure.empty')}</p> : null}
          {room.shape === 'walls' && !room.closed && canEdit ? (
            <p className={styles.canvasHint}>{t('field.measure.walls_start')}</p>
          ) : null}
        </div>
        <div className={styles.fields}>
          <div
            className={`${styles.field} ${wall !== null ? styles.fieldOn : ''}`}
            data-field="wall"
            role="status"
          >
            <span className={styles.fieldLabel}>
              {wall === null
                ? t('field.measure.wall_none')
                : t('field.measure.wall', { letter: wallLetter(wall) })}
            </span>
            <span className={styles.fieldValue}>
              {wallValue === null ? '' : formatLength(wallValue, 16)}
            </span>
          </div>
          <CeilingField
            key={room.id}
            value={room.ceiling}
            disabled={!canEdit}
            onChange={(ceiling) => update({ ...room, ceiling })}
          />
        </div>
        <p className={styles.hintLine}>
          <span>{t('field.measure.hint')}</span>
          <span className={styles.progress} data-testid="walls-done">
            {t('field.measure.progress', { done, total })}
          </span>
        </p>
      </div>
    </div>
  );
}
