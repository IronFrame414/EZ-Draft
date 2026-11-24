'use client';
// EZD-1415 (S17b Field measure; AC-EZD-1415-1 "An L-shaped room can be drawn and each wall selected on a phone";
// board S17bFieldMeasure). Layout: header (Projects, title, project), room chips with Building and + Room, shape
// picker, the canvas with lettered walls, the active wall field and the ceiling field, the hint line with walls
// done. Picking a template selects wall A; tapping a letter or a wall selects it (cobalt) and the wall field shows
// "Wall C" and its value. Every change is saved whole to /api/projects/[id]/field-measure after SAVE_DELAY_MS.
// EZD-1416 adds the keypad, Next wall, the auto-filled last wall and the closure badge (closure.ts, Keypad.tsx):
// keys type into the selected wall's field; Next wall (or tapping another wall) keeps a typed length; a refused
// length stays in the field with the refusal line. The tolerance is the company Measurement tolerance.
// EZD-1417 adds Saved on phone and Send to office (device-copy.ts, send.ts): every change is kept on the phone
// first, then saved to the server when online (again on reconnect); Send to office in the menu queues the rooms in
// the outbox, so it works offline and goes on reconnect. Once queued or sent the rooms no longer change on this
// phone. Without Send field measurement the screen is view only: walls can be selected, nothing changes.
// EZD-1419 (S17b States, Validation & warnings; Shape picker): the screen's state (empty room, measuring, closed, off
// by X, sent) is on data-state; sent rooms say they are read-only until the office reopens them, and a member with
// Approve field measurements gets Reopen in the menu. A length over 200 ft asks to confirm (entry.ts); changing the
// shape of a measured room asks to confirm and keeps the walls with the same letter (rooms.ts withShape).
// EZD-1963: the menu button is disabled in the server's HTML and enabled once the screen runs on the phone, so a tap
// that lands before then is not lost (the menu's handler is not attached to the server's HTML).
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useOutboxActor } from '../components/outbox/OutboxDrain';
import { useConfirm } from '../components/states/ConfirmProvider';
import { formatLength } from '@ezdraft/geometry';
import { DEFAULT_MEASUREMENT_TOLERANCE_IN } from '../lib/imports/review-conflicts';
import { Icon } from '../components/icon/Icon';
import { useT } from '../lib/messages';
import { CeilingField } from './CeilingField';
import { closeRoom } from './closure';
import { applyKey, Keypad, type KeypadKey } from './Keypad';
import { RoomChips } from './RoomChips';
import { ShapeCanvas } from './ShapeCanvas';
import { ShapePicker } from './ShapePicker';
import { clearDeviceCopy, readDeviceCopy, writeDeviceCopy } from './device-copy';
import { readFieldLength } from './entry';
import { useMeasureSend } from './send';
import { emptyRoom, isMeasured, uniqueName, withOutline, withShape, type FieldRoom } from './rooms';
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
  /** When the rooms were sent to the office, or null (EZD-1417). */
  sentAt?: string | null;
  /** EZD-1419: the member holds Approve field measurements, so may reopen sent rooms. */
  canReopen?: boolean;
};

// EZD-1963: false in the server's HTML and while React attaches to it, true from the first render after that.
const noStore = () => () => {};
const useOnDevice = () =>
  useSyncExternalStore(
    noStore,
    () => true,
    () => false,
  );

function newRoomId(rooms: readonly FieldRoom[]): string {
  let n = rooms.length;
  while (rooms.some((r) => r.id === `r${n}`)) n += 1;
  return `r${n}`;
}

export function FieldMeasureScreen({
  projectId,
  projectName,
  initialRooms,
  canEdit: canChange,
  tolerance = DEFAULT_MEASUREMENT_TOLERANCE_IN,
  sentAt = null,
  canReopen = false,
}: FieldMeasureScreenProps) {
  const t = useT();
  const confirm = useConfirm();
  const onDevice = useOnDevice();
  const [reopenFailed, setReopenFailed] = useState(false);
  const actor = useOutboxActor();
  const sender = useMeasureSend(projectId, sentAt);
  // Queued or sent rooms no longer change on this phone (S17b States "sent").
  const locked = sender.status === 'queued' || sender.status === 'sent';
  const canEdit = canChange && !locked;
  const [rooms, setRooms] = useState<FieldRoom[]>(initialRooms);
  const [onPhone, setOnPhone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(initialRooms[0]?.id ?? '');
  const [selected, setSelected] = useState<number | null>(
    (initialRooms[0]?.lengths.length ?? 0) > 0 ? 0 : null,
  );
  // The text being typed on the keypad for the selected wall; null shows the wall's value.
  const [draft, setDraft] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  const changed = useRef(false);

  const appUserId = actor?.appUserId;
  const tenantId = actor?.tenantId;
  const who = appUserId !== undefined && tenantId !== undefined ? { appUserId, tenantId } : null;

  // A copy on the phone the server does not have yet (measured offline, then reloaded) wins over the server's.
  useEffect(() => {
    if (appUserId === undefined || tenantId === undefined || !canChange || sentAt !== null) return;
    const copy = readDeviceCopy({ appUserId, tenantId }, projectId);
    if (copy === null) return;
    // State is set from a microtask, not in the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      setOnPhone(true);
      if (copy.synced) return;
      changed.current = true;
      setRooms(copy.rooms);
    });
  }, [appUserId, tenantId, canChange, sentAt, projectId]);

  // Sent rooms live on the server: the phone's copy is dropped.
  useEffect(() => {
    if (sender.status === 'sent' && appUserId !== undefined && tenantId !== undefined) {
      clearDeviceCopy({ appUserId, tenantId }, projectId);
    }
  }, [sender.status, appUserId, tenantId, projectId]);

  const saveToServer = useCallback(
    async (next: FieldRoom[]) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/field-measure`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rooms: next }),
        });
        if (res.ok && appUserId !== undefined && tenantId !== undefined) {
          const kept = readDeviceCopy({ appUserId, tenantId }, projectId);
          // Marked synced only when the phone still holds what was saved.
          if (kept !== null && JSON.stringify(kept.rooms) === JSON.stringify(next)) {
            writeDeviceCopy({ appUserId, tenantId }, projectId, { rooms: next, synced: true });
          }
        }
      } catch {
        /* offline: the rooms stay on the phone and are saved on reconnect */
      }
    },
    [projectId, appUserId, tenantId],
  );

  // Every change is kept on the phone at once, then saved whole to the server once the rooms stop changing, and
  // again when the phone comes back online.
  useEffect(() => {
    if (!changed.current || !canEdit) return;
    if (appUserId !== undefined && tenantId !== undefined) {
      if (writeDeviceCopy({ appUserId, tenantId }, projectId, { rooms, synced: false })) {
        queueMicrotask(() => setOnPhone(true));
      }
    }
    const timer = setTimeout(() => void saveToServer(rooms), SAVE_DELAY_MS);
    const online = () => void saveToServer(rooms);
    window.addEventListener('online', online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', online);
    };
  }, [rooms, canEdit, projectId, appUserId, tenantId, saveToServer]);

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
   * The room with the typed text kept on the selected wall: empty text clears the wall, a length sets it. Refused
   * when the text is not a length (it stays in the field and the refusal shows); a length over 200 ft comes with
   * the inches to confirm.
   */
  const readDraft = (): { room: FieldRoom; confirm?: number } | { refused: true } => {
    if (draft === null || wall === null) return { room };
    let value: number | null = null;
    let ask: number | undefined;
    if (draft.trim() !== '') {
      const entry = readFieldLength(draft);
      if (entry.kind === 'refused') return { refused: true };
      value = entry.inches;
      if (entry.kind === 'confirm') ask = entry.inches;
    }
    if (room.lengths[wall] === value) return { room };
    const lengths = room.lengths.slice();
    lengths[wall] = value;
    return { room: { ...room, lengths }, confirm: ask };
  };

  /**
   * The room with the typed text kept, once a length over 200 ft is confirmed (S17b Validation). Null when the
   * text is refused (refused is true) or the user chose to change the length (the text stays in the field).
   */
  const takeDraft = async (): Promise<
    { room: FieldRoom; refused?: undefined } | { room: null; refused: boolean }
  > => {
    const read = readDraft();
    if ('refused' in read) return { room: null, refused: true };
    if (read.confirm !== undefined) {
      const choice = await confirm({
        title: 'field.measure.confirm_long.title',
        message: 'field.measure.confirm_long.message',
        params: { length: formatLength(read.confirm, 16) },
        confirmLabel: 'field.measure.confirm_long.keep',
        cancelLabel: 'field.measure.confirm_long.change',
      });
      if (choice !== 'confirm') return { room: null, refused: false };
    }
    return { room: read.room };
  };

  const selectWall = async (index: number) => {
    const next = await takeDraft();
    // Changing a length to confirm keeps the field on this wall; a refused text is dropped, as before.
    if (next.room === null && !next.refused) return;
    if (next.room !== null && next.room !== room) update(next.room);
    clearDraft();
    setSelected(index);
  };

  const pressKey = (key: KeypadKey) => {
    if (!canEdit || wall === null) return;
    setDraft((d) => applyKey(d ?? '', key));
    setRefused(false);
  };

  // Next wall: keep the typed length and move on; on the last wall, to the first wall still without a length.
  const nextWall = async () => {
    if (!canEdit || wall === null) return;
    const taken = await takeDraft();
    if (taken.room === null) {
      if (taken.refused) setRefused(true);
      return;
    }
    const next = taken.room;
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

  const pickShape = async (shape: ShapeKind) => {
    if (shape === room.shape) return;
    // S17b Shape picker: after measuring, a change asks to confirm and keeps the walls with the same letter.
    if (isMeasured(room)) {
      const choice = await confirm({
        title: 'field.measure.confirm_shape.title',
        message:
          shape === 'walls'
            ? 'field.measure.confirm_shape.walls'
            : 'field.measure.confirm_shape.keep',
        confirmLabel: 'field.measure.confirm_shape.change',
        cancelLabel: 'field.measure.cancel',
      });
      if (choice !== 'confirm') return;
    }
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

  // Send to office: the rooms with any length still being typed, queued in the outbox (sent now when online).
  const sendToOffice = async () => {
    setMenuOpen(false);
    if (!canEdit || !sender.ready) return;
    const taken = await takeDraft();
    // Change on the over-200 ft confirm: nothing is sent and the text stays on the wall. A refused text is dropped.
    if (taken.room === null && !taken.refused) return;
    const typed = taken.room;
    const next =
      typed === null || typed === room ? rooms : rooms.map((r) => (r.id === typed.id ? typed : r));
    clearDraft();
    setRooms(next);
    if (who !== null) writeDeviceCopy(who, projectId, { rooms: next, synced: false });
    void sender.send(next);
  };

  // EZD-1419: the office reopens sent rooms; the page loads again with the rooms open on every phone.
  const reopen = async () => {
    setMenuOpen(false);
    setReopenFailed(false);
    try {
      const res = await fetch(`/api/projects/${projectId}/field-measure/reopen`, {
        method: 'POST',
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
    } catch {
      /* offline or the server failed: the line below says so */
    }
    setReopenFailed(true);
  };

  const status =
    sender.status === 'sent'
      ? { icon: 'check_circle' as const, text: t('field.measure.sent'), tone: styles.statusOk }
      : sender.status === 'queued'
        ? {
            icon: 'cloud_off' as const,
            text: t('field.measure.send_waiting'),
            tone: styles.statusWait,
          }
        : sender.status === 'refused'
          ? {
              icon: 'error' as const,
              text: t('field.measure.send_refused'),
              tone: styles.statusBad,
            }
          : onPhone
            ? {
                icon: 'offline_pin' as const,
                text: t('field.measure.saved_on_phone'),
                tone: styles.statusOk,
              }
            : null;

  const wallValue = wall === null ? null : (closure.lengths[wall] ?? null);
  const wallAuto = wall !== null && wall === closure.auto && draft === null;
  const state = closure.state;
  const sent = sender.status === 'sent';
  const screenState = sent
    ? 'sent'
    : room.shape === null
      ? 'empty'
      : state.kind === 'closes'
        ? 'closed'
        : state.kind === 'off'
          ? 'off'
          : 'measuring';

  return (
    <div className={styles.screen} data-testid="field-measure" data-state={screenState}>
      <header className={styles.header}>
        <div className={styles.topRow}>
          <Link className={styles.back} href="/">
            <Icon name="arrow_back" size={16} />
            {t('field.measure.back')}
          </Link>
          <div className={styles.topEnd}>
            {status !== null ? (
              <span
                className={`${styles.status} ${status.tone}`}
                data-testid="measure-status"
                data-status={sender.status === 'idle' ? 'saved' : sender.status}
                role="status"
              >
                <Icon name={status.icon} size={15} />
                {status.text}
              </span>
            ) : null}
            <div className={styles.menuWrap}>
              <button
                type="button"
                className={styles.menuButton}
                aria-label={t('field.measure.menu')}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                disabled={!onDevice}
                onClick={() => setMenuOpen((o) => !o)}
              >
                <Icon name="more_horiz" size={20} />
              </button>
              {menuOpen ? (
                <div className={styles.menu} role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className={styles.menuItem}
                    disabled={!canEdit || !sender.ready}
                    onClick={() => void sendToOffice()}
                  >
                    {t('field.measure.send')}
                  </button>
                  {sent && canReopen ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.menuItem}
                      data-testid="measure-reopen"
                      onClick={() => void reopen()}
                    >
                      {t('field.measure.reopen')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t('field.measure.title')}</h1>
          <span className={styles.project}>{projectName}</span>
        </div>
        {sent ? (
          <p className={styles.readOnly} data-testid="measure-read-only" role="status">
            <Icon name="lock" size={15} />
            {t('field.measure.read_only')}
          </p>
        ) : null}
        {reopenFailed ? (
          <p className={styles.refused} role="alert">
            {t('field.measure.reopen_failed')}
          </p>
        ) : null}
        <RoomChips
          rooms={rooms}
          activeId={room.id}
          canAdd={canEdit}
          onSwitch={switchRoom}
          onAdd={addRoom}
        />
      </header>
      <div className={styles.body}>
        <ShapePicker
          value={room.shape}
          disabled={!canEdit}
          onPick={(shape) => void pickShape(shape)}
        />
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
            onSelect={(i) => void selectWall(i)}
            onTap={tapCanvas}
          />
          {room.shape === null ? (
            <p className={styles.canvasHint}>{t('field.measure.empty')}</p>
          ) : null}
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
        {canEdit ? (
          <Keypad disabled={wall === null} onKey={pressKey} onNext={() => void nextWall()} />
        ) : null}
      </div>
    </div>
  );
}
