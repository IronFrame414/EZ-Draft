'use client';
// EZD-1415 (S17b Room chips "Switch room; Building edits the outside outline; Active chip cobalt"; + Room "Adds a
// room; name typed or picked (Kitchen, Bath, Bedroom, Family, Laundry, Other)"). Picking a name adds the room at
// once; Other, or a typed name with Add, adds a room with the typed name. Without Send field measurement there is no
// + Room.
import { useRef, useState } from 'react';
import { Icon } from '../components/icon/Icon';
import { useT } from '../lib/messages';
import type { MessageKey } from '../server/messages/catalog';
import { MAX_ROOM_NAME, type FieldRoom } from './rooms';
import styles from './FieldMeasure.module.css';

const PICKS: readonly MessageKey[] = [
  'field.measure.pick.kitchen',
  'field.measure.pick.bath',
  'field.measure.pick.bedroom',
  'field.measure.pick.family',
  'field.measure.pick.laundry',
];

export function RoomChips({
  rooms,
  activeId,
  canAdd,
  onSwitch,
  onAdd,
}: {
  rooms: readonly FieldRoom[];
  activeId: string;
  canAdd: boolean;
  onSwitch: (id: string) => void;
  onAdd: (name: string) => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const add = (value: string) => {
    if (value.trim() === '') return;
    onAdd(value);
    setAdding(false);
    setName('');
  };

  return (
    <>
      <div className={styles.chips} role="group" aria-label={t('field.measure.rooms')}>
        {rooms.map((room) => (
          <button
            key={room.id}
            type="button"
            className={room.id === activeId ? `${styles.chip} ${styles.chipOn}` : styles.chip}
            aria-pressed={room.id === activeId}
            data-room={room.id}
            onClick={() => onSwitch(room.id)}
          >
            {room.kind === 'building' ? t('field.measure.building') : room.name}
          </button>
        ))}
        {canAdd ? (
          <button
            type="button"
            className={styles.chip}
            aria-expanded={adding}
            data-add-room=""
            onClick={() => setAdding((a) => !a)}
          >
            <Icon name="add" size={16} />
            {t('field.measure.add_room')}
          </button>
        ) : null}
      </div>
      {adding ? (
        <div className={styles.addRoom} role="group" aria-label={t('field.measure.add_room_title')}>
          <div className={styles.picks}>
            {PICKS.map((key) => (
              <button key={key} type="button" className={styles.chip} onClick={() => add(t(key))}>
                {t(key)}
              </button>
            ))}
            <button type="button" className={styles.chip} onClick={() => nameRef.current?.focus()}>
              {t('field.measure.pick.other')}
            </button>
          </div>
          <form
            className={styles.addForm}
            onSubmit={(e) => {
              e.preventDefault();
              add(name);
            }}
          >
            <input
              ref={nameRef}
              className={styles.nameInput}
              aria-label={t('field.measure.room_name')}
              placeholder={t('field.measure.room_name')}
              maxLength={MAX_ROOM_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className={styles.primary} disabled={name.trim() === ''}>
              {t('field.measure.room_add')}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setAdding(false);
                setName('');
              }}
            >
              {t('field.measure.cancel')}
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
