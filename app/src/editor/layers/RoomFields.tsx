'use client';
// EZD-729 (11 Budgets "editor before its lazy parts 500 KB"; ARCH Entry points and lazy modules; EZD-234 and EZD-227
// precedent): the Rooms tab's fields for the room selected alone, moved out of LeftPanel.tsx into the lazy
// `room-fields` module, loaded when the Rooms tab is opened; it now makes its own room edit.
import { CEILING_TYPES, ROOM_TYPES } from '@ezdraft/geometry';
import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { roomAttributeChange, type RoomField, type RoomRow } from './rooms';
import styles from './LeftPanel.module.css';

// A text field that commits on Enter or blur and goes back on Escape (P213b D-Length field).
function RoomText({
  testId,
  label,
  value,
  onCommit,
}: {
  testId: string;
  label: string;
  value: string;
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft === value) return;
    onCommit(draft);
    setDraft(value);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(value);
    }
  };
  return (
    <input
      className={styles.input}
      type="text"
      autoComplete="off"
      spellCheck={false}
      maxLength={120}
      aria-label={label}
      data-testid={testId}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={commit}
    />
  );
}

export function RoomFields({
  row,
  canEdit,
  store,
}: {
  row: RoomRow;
  canEdit: boolean;
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
}) {
  const t = useT();
  // One field edit is one model edit (EZD-218).
  const onEdit = (field: RoomField, value: string | null) => {
    if (!canEdit) return;
    const change = roomAttributeChange(store.getState().objects, row.id, field, value);
    if (change !== null) store.applyEdit([change]);
  };
  const typeText = (v: RoomRow['roomType']) =>
    v === null ? t('office.left_panel.not_set') : t(`office.left_panel.room_type.${v}`);
  const ceilingText = (v: RoomRow['ceilingType']) =>
    v === null ? t('office.left_panel.not_set') : t(`office.left_panel.ceiling_type.${v}`);
  const field = (key: MessageKey, testId: string, edit: ReactElement, plain: string) => (
    <label className={styles.field}>
      <span>{t(key)}</span>
      {canEdit ? (
        edit
      ) : (
        <span className={styles.plain} data-testid={testId}>
          {plain}
        </span>
      )}
    </label>
  );
  return (
    <div className={styles.fields} data-testid="room-fields" data-room-id={row.id}>
      {field(
        'office.left_panel.field.name',
        'room-name',
        <RoomText
          testId="room-name"
          label={t('office.left_panel.field.name')}
          value={row.name}
          onCommit={(v) => onEdit('name', v)}
        />,
        row.name,
      )}
      {field(
        'office.left_panel.field.room_type',
        'room-type',
        <select
          className={styles.select}
          data-testid="room-type"
          value={row.roomType ?? ''}
          onChange={(e) => onEdit('roomType', e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{t('office.left_panel.not_set')}</option>
          {ROOM_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`office.left_panel.room_type.${v}`)}
            </option>
          ))}
        </select>,
        typeText(row.roomType),
      )}
      <div className={styles.field}>
        <span>{t('office.left_panel.field.area')}</span>
        <span className={styles.plain} data-testid="room-area">
          {t('office.left_panel.area', { area: row.areaSqFt })}
        </span>
      </div>
      {field(
        'office.left_panel.field.floor_finish',
        'room-floor-finish',
        <RoomText
          testId="room-floor-finish"
          label={t('office.left_panel.field.floor_finish')}
          value={row.floorFinish}
          onCommit={(v) => onEdit('floorFinish', v)}
        />,
        row.floorFinish === '' ? t('office.left_panel.not_set') : row.floorFinish,
      )}
      {field(
        'office.left_panel.field.ceiling_type',
        'room-ceiling-type',
        <select
          className={styles.select}
          data-testid="room-ceiling-type"
          value={row.ceilingType ?? ''}
          onChange={(e) => onEdit('ceilingType', e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{t('office.left_panel.not_set')}</option>
          {CEILING_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`office.left_panel.ceiling_type.${v}`)}
            </option>
          ))}
        </select>,
        ceilingText(row.ceilingType),
      )}
    </div>
  );
}
