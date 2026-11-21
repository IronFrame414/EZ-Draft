'use client';
// EZD-1415 (S17b Field measure; AC-EZD-1415-1 "An L-shaped room can be drawn and each wall selected on a phone";
// board S17bFieldMeasure). Layout: header (Projects, title, project), room chips with Building and + Room, shape
// picker, the canvas with lettered walls, the active wall field and the ceiling field, the hint line with walls
// done. Picking a template selects wall A; tapping a letter or a wall selects it (cobalt) and the wall field shows
// "Wall C" and its value. Every change is saved whole to /api/projects/[id]/field-measure after SAVE_DELAY_MS.
// EZD-1416 adds the keypad, Next wall, the auto-filled last wall and the closure badge (closure.ts, Keypad.tsx):
// keys type into the selected wall's field; Next wall (or tapping another wall) keeps a typed length; a refused
// length stays in the field with the refusal line. The tolerance is the company Measurement tolerance.
// Not here: Saved on phone and Send to office
// (EZD-1417), and the confirms and read-only sent state (EZD-1419). Without Send field measurement the screen is
// view only: walls can be selected, nothing changes.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { formatLength, parseLength } from '@ezdraft/geometry';
import { DEFAULT_MEASUREMENT_TOLERANCE_IN } from '../lib/imports/review-conflicts';
import { Icon } from '../components/icon/Icon';
import { useT } from '../lib/messages';
import { CeilingField } from './CeilingField';
import { closeRoom } from './closure';
import { applyKey, Keypad, type KeypadKey } from './Keypad';
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
  /** The company Measurement tolerance in inches (S15d); 1/2" while Not set. */
  tolerance?: number;
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
  tolerance = DEFAULT_MEASUREMENT_TOLERANCE_IN,
}: FieldMeasureScreenProps) {
  const t = useT();
  const [rooms, setRooms] = useState<FieldRoom[]>(initialRooms);
  const [activeId, setActiveId] = useState<string>(initialRooms[0]?.id ?? '');
  const [selected, setSelected] = useState<number | null>(
    (initialRooms[0]?.lengths.length ?? 0) > 0 ? 0 : null,
  );
  // The text being typed on the keypad for the selected wall; null shows the wall's value.
  const [draft, setDraft] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
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
  const closure = closeRoom(corners, closed, room.lengths, tolerance);
  const done = closure.lengths.filter((l) => l !== null).length;
  const wall = selected !== null && selected < total ? selected : null;

  const update = (next: FieldRoom) => {
    changed.current = true;
    setRooms((rs) => rs.map((r) => (r.id === next.id ? next : r)));
  };

  const clearDraft = () => {
    setDraft(null);
    setRefused(false);
  };

  /**
   * The room with the typed text kept on the selected wall: empty text clears the wall, a length sets it. Null when
   * the text is not a length (it stays in the field and the refusal shows).
   */
  const withDraft = (): FieldRoom | null => {
    if (draft === null || wall === null) return room;
    let value: number | null = null;
    if (draft.trim() !== '') {
      const parsed = parseLength(draft, 'wall_room');
      if (!parsed.ok) return null;
      value = parsed.inches;
    }
    if (room.lengths[wall] === value) return room;
    const lengths = room.lengths.slice();
    lengths[wall] = value;
    return { ...room, lengths };
  };

  const selectWall = (index: number) => {
    const next = withDraft();
    if (next !== null && next !== room) update(next);
    clearDraft();
    setSelected(index);
  };

  const pressKey = (key: KeypadKey) => {
    if (!canEdit || wall === null) return;
    setDraft((d) => applyKey(d ?? '', key));
    setRefused(false);
  };

  // Next wall: keep the typed length and move on; on the last wall, to the first wall still without a length.
  const nextWall = () => {
    if (!canEdit || wall === null) return;
    const next = withDraft();
    if (next === null) {
      setRefused(true);
      return;
    }
    if (next !== room) update(next);
    clearDraft();
    if (wall < total - 1) {
      setSelected(wall + 1);
      return;
    }
    const after = closeRoom(corners, closed, next.lengths, tolerance).lengths;
    const empty = after.findIndex((l) => l === null);
    if (empty !== -1) setSelected(empty);
  };

  const switchRoom = (id: string) => {
    clearDraft();
    const next = rooms.find((r) => r.id === id);
    setActiveId(id);
    setSelected(next !== undefined && next.lengths.length > 0 ? 0 : null);
  };

  const addRoom = (name: string) => {
    const r = emptyRoom(newRoomId(rooms), 'room', uniqueName(rooms, name));
    clearDraft();
    changed.current = true;
    setRooms((rs) => [...rs, r]);
    setActiveId(r.id);
    setSelected(null);
  };

  const pickShape = (shape: ShapeKind) => {
    if (shape === room.shape) return;
    const next = withShape(room, shape);
    clearDraft();
    update(next);
    setSelected(next.lengths.length > 0 ? 0 : null);
  };

  const tapCanvas = (p: Pt, held: boolean) => {
    const outline = addCorner({ corners: room.corners, closed: room.closed }, p, held);
    if (outline.corners === room.corners && outline.closed === room.closed) return;
    const next = withOutline(room, outline.corners, outline.closed);
    clearDraft();
    update(next);
    // The wall just drawn (or, on closing, the closing wall) is selected.
    setSelected(next.lengths.length > 0 ? next.lengths.length - 1 : null);
  };

  const wallValue = wall === null ? null : (closure.lengths[wall] ?? null);
  const wallAuto = wall !== null && wall === closure.auto && draft === null;
  const state = closure.state;

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
            lengths={closure.lengths}
            auto={closure.auto}
            pending={state.kind === 'pending' ? state.fill : null}
            selected={wall}
            editable={canEdit}
            onSelect={selectWall}
            onTap={tapCanvas}
          />
          {room.shape === null ? <p className={styles.canvasHint}>{t('field.measure.empty')}</p> : null}
          {room.shape === 'walls' && !room.closed && canEdit ? (
            <p className={styles.canvasHint}>{t('field.measure.walls_start')}</p>
          ) : null}
          {state.kind === 'pending' || state.kind === 'closes' || state.kind === 'off' ? (
            <p
              className={
                state.kind === 'closes'
                  ? `${styles.closure} ${styles.closureOk}`
                  : state.kind === 'off' && !state.over
                    ? styles.closure
                    : `${styles.closure} ${styles.closureAmber}`
              }
              data-testid="closure"
              data-closure={state.kind}
              data-over-tolerance={state.kind === 'off' ? state.over : undefined}
              role="status"
            >
              <Icon name="straighten" size={15} />
              {state.kind === 'pending'
                ? t('field.measure.fills_in', { letter: wallLetter(state.fill) })
                : state.kind === 'closes'
                  ? t('field.measure.closes')
                  : t('field.measure.off_by', { gap: formatLength(state.gap, 16) })}
            </p>
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
            <span
              className={wallAuto ? `${styles.fieldValue} ${styles.fieldAuto}` : styles.fieldValue}
              data-auto={wallAuto ? '' : undefined}
              data-testid="wall-value"
            >
              {draft !== null ? draft : wallValue === null ? '' : formatLength(wallValue, 16)}
            </span>
            {refused ? (
              <span className={styles.refused} role="alert">
                {t('field.measure.length_refused')}
              </span>
            ) : null}
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
        {canEdit ? <Keypad disabled={wall === null} onKey={pressKey} onNext={nextWall} /> : null}
      </div>
    </div>
  );
}
