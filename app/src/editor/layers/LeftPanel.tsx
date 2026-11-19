'use client';
// EZD-218 (S03 Controls — left panel; board S03Plan left panel; S03 Decisions "The layer filter is a lock icon on each
// layer row"; Q-0673 (c) tabs Layers and Rooms only until EZD-122; Q-0674 (b) no Overlays section while no overlay
// kind exists; Q-0675 (a) lock look; 05 Q-0664 "Views and permissions"; AC-EZD-218-1 to -5): the plan editor's left
// panel. Layers shows the Phase rows and the Rooms layer with its rooms; Rooms lists the rooms and edits the one
// selected alone. Eyes and locks are the device session's (LayerSetting); room edits are one model edit each.
// EZD-729 (AC-EZD-729-1; S03 "Layers tab sections: Phase, Overlays, Rooms"; board S03Plan Overlays rows): the
// Overlays section with the Plumbing row, its icon left of the name as the board's overlay rows. The room fields
// load lazily (`roomFieldsModule`, 11 Budgets) when the Rooms tab is opened (a failed download is tried again on the next open); none show while it downloads.
// EZD-122 (Q-0673 (c) "Layers and Rooms only until EZD-122"; S03 "tabs Layers, Rooms, Versions"; board S20; S20 Entry
// points; AC-EZD-122-2, -8): the Versions tab, shown when the editor passes its content. The editor may hold the
// tab (`tab`, `onTab`), so the header's version text can open Versions.
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { ObjectStatus, RoomObject } from '@ezdraft/geometry';
import {
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import type { LayerId, LayerSetting } from './layer-setting';
import { roomFieldsModule } from './room-fields-module';
import { roomRows, type RoomRow } from './rooms';
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
  // EZD-229 (AC-EZD-229-5): the project a room photo is sent to; without it photos show but are not added.
  projectId?: string;
  // EZD-122: the tab shown, when the editor holds it, and what a tab press asks for.
  tab?: Tab;
  onTab?: (tab: Tab) => void;
  // EZD-122: the Versions tab's content; without it there is no Versions tab.
  versions?: ReactNode;
};

export type Tab = 'layers' | 'rooms' | 'versions';

// EZD-229: the same lazy module also holds the plan marks of the existing details and floor transitions, which the
// plan controller loads through this one handle (room-fields-module.ts).
export { roomFieldsModule };

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
  layers,
  onEye,
}: {
  layer: LayerId;
  name: string;
  on: boolean;
  layers: LayerSetting;
  onEye: () => void;
}) {
  const t = useT();
  const locked = layers.get().locks[layer];
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
        onClick={() => layers.setLock(layer, !locked)}
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

export function LeftPanel({
  store,
  layers,
  selection,
  showObject,
  canEdit,
  roomArea,
  initialTab = 'layers',
  floors,
  projectId,
  tab: heldTab,
  onTab,
  versions,
}: LeftPanelProps): ReactElement {
  const chosen = useChosenFloor(floors);
  const t = useT();
  const [ownTab, setOwnTab] = useState<Tab>(initialTab);
  const tab = heldTab ?? ownTab;
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
  const [fields, setFields] = useState(roomFieldsModule.peek);

  // A room row selects the room and zooms to it; a hidden room's eyes are turned on first (as Show does, EZD-214).
  const pick = (row: RoomRow) => {
    if (!layerState.roomsEye) layers.setRoomsEye(true);
    if (!eyes[row.status]) layers.setEye(row.status, true);
    selection.select([row.id]);
    showObject(row.id);
  };

  const tabButton = (id: Tab, key: MessageKey) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`${styles.seg} ${tab === id ? styles.segOn : ''} ${touch.target}`}
      data-testid={`left-panel-tab-${id}`}
      onClick={() => {
        setOwnTab(id);
        onTab?.(id);
        if (id === 'rooms') roomFieldsModule.load().then(setFields, () => {});
      }}
    >
      {t(key)}
    </button>
  );

  return (
    <div className={styles.panel} data-testid="left-panel" data-tab={tab}>
      <div className={styles.tabs} role="tablist" aria-label={t('office.left_panel.tabs')}>
        {tabButton('layers', 'office.left_panel.tab.layers')}
        {tabButton('rooms', 'office.left_panel.tab.rooms')}
        {versions === undefined ? null : tabButton('versions', 'office.left_panel.tab.versions')}
      </div>
      {tab === 'versions' && versions !== undefined ? (
        <div className={styles.body} role="tabpanel" data-testid="left-panel-versions">
          {versions}
        </div>
      ) : tab === 'layers' ? (
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
                    layers={layers}
                    onEye={() => layers.setEye(status, !eyes[status])}
                  />
                </div>
              );
            })}
          </div>
          <div className={`${styles.row} ${styles.sectionRow}`}>
            <span className={styles.sectionName}>{t('office.left_panel.section.overlays')}</span>
          </div>
          <div className={styles.list}>
            <div
              className={`${styles.row} ${layerState.plumbingEye ? '' : styles.off}`}
              data-testid="layer-row-plumbing"
            >
              <Icon name="wash" size={18} />
              <span className={styles.name}>{t('office.left_panel.layer.plumbing')}</span>
              <LayerControls
                layer="plumbing"
                name={t('office.left_panel.layer.plumbing')}
                on={layerState.plumbingEye}
                layers={layers}
                onEye={() => layers.setPlumbingEye(!layerState.plumbingEye)}
              />
            </div>
            <div
              className={`${styles.row} ${layerState.mechanicalEye ? '' : styles.off}`}
              data-testid="layer-row-mechanical"
            >
              <Icon name="autorenew" size={18} />
              <span className={styles.name}>{t('office.left_panel.layer.mechanical')}</span>
              <LayerControls
                layer="mechanical"
                name={t('office.left_panel.layer.mechanical')}
                on={layerState.mechanicalEye}
                layers={layers}
                onEye={() => layers.setMechanicalEye(!layerState.mechanicalEye)}
              />
            </div>
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
              layers={layers}
              onEye={() => layers.setRoomsEye(!layerState.roomsEye)}
            />
          </div>
          <RoomList rows={rows} selectedId={selectedId} onPick={pick} />
        </div>
      ) : (
        <div className={styles.body} role="tabpanel" data-testid="left-panel-rooms">
          <RoomList rows={rows} selectedId={selectedId} onPick={pick}>
            {(row) =>
              fields === undefined ? null : (
                <fields.RoomFields
                  row={row}
                  canEdit={canEdit}
                  store={store}
                  {...(projectId !== undefined ? { projectId } : {})}
                />
              )
            }
          </RoomList>
        </div>
      )}
    </div>
  );
}
