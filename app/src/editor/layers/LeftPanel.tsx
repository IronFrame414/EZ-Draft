'use client';
// EZD-218 (S03 Controls — left panel; board S03Plan left panel; S03 Decisions "The layer filter is a lock icon on each
// layer row"; Q-0673 (c) tabs Layers and Rooms only until EZD-122; Q-0674 (b) no Overlays section while no overlay
// kind exists; Q-0675 (a) lock look; 05 Q-0664 "Views and permissions"; AC-EZD-218-1 to -5): the plan editor's left
// panel. Layers shows the Phase rows and the Rooms layer with its rooms; Rooms lists the rooms and edits the one
// selected alone. Eyes and locks are the device session's (LayerSetting); room edits are one model edit each.
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import { CEILING_TYPES, ROOM_TYPES, type ObjectStatus, type RoomObject } from '@ezdraft/geometry';
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import type { LayerId, LayerSetting } from './layer-setting';
import { roomAttributeChange, roomRows, type RoomField, type RoomRow } from './rooms';
import styles from './LeftPanel.module.css';

export type LeftPanelProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe' | 'applyEdit'>;
  layers: LayerSetting;
  selection: Pick<SelectionController, 'getUi' | 'subscribe' | 'select'>;
  showObject: (id: string) => boolean;
  canEdit: boolean;
  roomArea?: (room: RoomObject) => number;
  // The tab shown first; Layers unless a test asks for Rooms.
  initialTab?: Tab;
  // EZD-6001 D-Wire: the floor the user chose; the Rooms tab lists its rooms. Without it the lowest floor.
  floors?: FloorChoice;
};

export type Tab = 'layers' | 'rooms';

const PHASE_ROWS: readonly ObjectStatus[] = ['existing', 'demo', 'new'];

const DOT: Record<ObjectStatus, string | undefined> = {
  existing: styles.dotExisting,
  demo: styles.dotDemo,
  new: styles.dotNew,
};

function LayerControls({
  layer,
  name,
  on,
  locked,
  onEye,
  onLock,
}: {
  layer: LayerId;
  name: string;
  on: boolean;
  locked: boolean;
  onEye: () => void;
  onLock: () => void;
}) {
  const t = useT();
  return (
    <>
      <button
        type="button"
        className={`${styles.icon} ${locked ? styles.locked : styles.unlocked} ${touch.target}`}
        data-testid={`layer-lock-${layer}`}
        data-locked={locked ? 'true' : 'false'}
        aria-pressed={locked}
        aria-label={t(locked ? 'office.left_panel.unlock' : 'office.left_panel.lock', {
          layer: name,
        })}
        onClick={onLock}
      >
        <Icon name={locked ? 'lock' : 'lock_open'} size={18} />
      </button>
      <button
        type="button"
        className={`${styles.icon} ${touch.target}`}
        data-testid={`layer-eye-${layer}`}
        data-on={on ? 'true' : 'false'}
        aria-pressed={on}
        aria-label={t(on ? 'office.left_panel.hide' : 'office.left_panel.show', { layer: name })}
        onClick={onEye}
      >
        <Icon name={on ? 'visibility' : 'visibility_off'} size={18} />
      </button>
    </>
  );
}

function RoomList({
  rows,
  selectedId,
  onPick,
  children,
}: {
  rows: readonly RoomRow[];
  selectedId: string | null;
  onPick: (row: RoomRow) => void;
  children?: (row: RoomRow) => ReactElement | null;
}) {
  const t = useT();
  if (rows.length === 0)
    return (
      <p className={styles.none} data-testid="room-list-empty">
        {t('office.left_panel.no_rooms')}
      </p>
    );
  return (
    <div className={styles.rooms}>
      {rows.map((row) => {
        const selected = selectedId !== null && selectedId.toLowerCase() === row.id.toLowerCase();
        return (
          <div key={row.id}>
            <button
              type="button"
              className={`${styles.room} ${selected ? styles.roomOn : ''} ${touch.target}`}
              data-testid="room-row"
              data-room-id={row.id}
              aria-current={selected ? 'true' : undefined}
              onClick={() => onPick(row)}
            >
              <span className={styles.roomName}>{row.name}</span>
              <span className={styles.area}>
                {t('office.left_panel.area', { area: row.areaSqFt })}
              </span>
            </button>
            {selected && children !== undefined ? children(row) : null}
          </div>
        );
      })}
    </div>
  );
}

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

function RoomFields({
  row,
  canEdit,
  onEdit,
}: {
  row: RoomRow;
  canEdit: boolean;
  onEdit: (field: RoomField, value: string | null) => void;
}) {
  const t = useT();
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

export function LeftPanel({
  store,
  layers,
  selection,
  showObject,
  canEdit,
  roomArea,
  initialTab = 'layers',
  floors,
}: LeftPanelProps): ReactElement {
  const chosen = useChosenFloor(floors);
  const t = useT();
  const [tab, setTab] = useState<Tab>(initialTab);
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const layerState = useSyncExternalStore(layers.subscribe, layers.get, layers.get);
  const eyes = useSyncExternalStore(layers.subscribe, layers.eyes, layers.eyes);
  const ui = useSyncExternalStore(selection.subscribe, selection.getUi, selection.getUi);
  const rows = useMemo(
    () => roomRows(objects, openFloorId(objects, chosen), roomArea),
    [objects, roomArea, chosen],
  );
  const selectedId = ui.ids.length === 1 ? ui.ids[0]! : null;

  // A room row selects the room and zooms to it; a hidden room's eyes are turned on first (as Show does, EZD-214).
  const pick = (row: RoomRow) => {
    if (!layerState.roomsEye) layers.setRoomsEye(true);
    if (!eyes[row.status]) layers.setEye(row.status, true);
    selection.select([row.id]);
    showObject(row.id);
  };
  const edit = (id: string) => (field: RoomField, value: string | null) => {
    if (!canEdit) return;
    const change = roomAttributeChange(store.getState().objects, id, field, value);
    if (change !== null) store.applyEdit([change]);
  };

  const tabButton = (id: Tab, key: MessageKey) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`${styles.seg} ${tab === id ? styles.segOn : ''} ${touch.target}`}
      data-testid={`left-panel-tab-${id}`}
      onClick={() => setTab(id)}
    >
      {t(key)}
    </button>
  );

  return (
    <div className={styles.panel} data-testid="left-panel" data-tab={tab}>
      <div className={styles.tabs} role="tablist" aria-label={t('office.left_panel.tabs')}>
        {tabButton('layers', 'office.left_panel.tab.layers')}
        {tabButton('rooms', 'office.left_panel.tab.rooms')}
      </div>
      {tab === 'layers' ? (
        <div className={styles.body} role="tabpanel" data-testid="left-panel-layers">
          <span className={styles.lbl}>{t('office.left_panel.section.phase')}</span>
          <div className={styles.list}>
            {PHASE_ROWS.map((status) => {
              const name = t(`office.left_panel.layer.${status}`);
              return (
                <div
                  key={status}
                  className={`${styles.row} ${eyes[status] ? '' : styles.off}`}
                  data-testid={`layer-row-${status}`}
                >
                  <span className={`${styles.dot} ${DOT[status] ?? ''}`} data-dot={status} />
                  <span className={styles.name}>{name}</span>
                  <LayerControls
                    layer={status}
                    name={name}
                    on={eyes[status]}
                    locked={layerState.locks[status]}
                    onEye={() => layers.setEye(status, !eyes[status])}
                    onLock={() => layers.setLock(status, !layerState.locks[status])}
                  />
                </div>
              );
            })}
          </div>
          <div
            className={`${styles.row} ${styles.sectionRow} ${layerState.roomsEye ? '' : styles.off}`}
            data-testid="layer-row-rooms"
          >
            <span className={styles.sectionName}>{t('office.left_panel.section.rooms')}</span>
            <LayerControls
              layer="rooms"
              name={t('office.left_panel.layer.rooms')}
              on={layerState.roomsEye}
              locked={layerState.locks.rooms}
              onEye={() => layers.setRoomsEye(!layerState.roomsEye)}
              onLock={() => layers.setLock('rooms', !layerState.locks.rooms)}
            />
          </div>
          <RoomList rows={rows} selectedId={selectedId} onPick={pick} />
        </div>
      ) : (
        <div className={styles.body} role="tabpanel" data-testid="left-panel-rooms">
          <RoomList rows={rows} selectedId={selectedId} onPick={pick}>
            {(row) => <RoomFields row={row} canEdit={canEdit} onEdit={edit(row.id)} />}
          </RoomList>
        </div>
      )}
    </div>
  );
}
