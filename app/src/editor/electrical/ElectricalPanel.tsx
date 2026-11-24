'use client';
// EZD-601 (S06 Layout "Left panel: Circuits / Devices / Panel tabs; panel header ("Panel A · 200A main", units
// AMPS · VA); circuit list; New circuit; Show chips; footer totals"; S06 Controls Circuits tab "Default tab", Devices
// tab, Panel tab, Panel selector, Circuit row "Selected state (accent). Allowed in view only", Show chips "Multiple
// on. Display only; allowed in view only", Circuit/space footer; S06 States Empty "circuit list empty with "Place
// devices or add a circuit""; S06 Decisions 9; board S06Electrical left panel; AC-EZD-601-1; vault/build/
// assumptions.md EZD-601): the left panel in electrical mode. Every control here is allowed in view only. New
// circuit, rename and the circuit's canvas highlight arrive with EZD-604; the Panel tab's compact schedule with
// EZD-609; what the chips show on the plan with the tickets that draw those layers (EZD-602, EZD-604, EZD-605).
// EZD-604 (S06 Controls "New circuit | Left panel, under list | Creates a new circuit in the next open space. | Edit
// model; hidden without it. Disabled in view only (mockup shows disabled). Disabled when no spaces left.", "Circuit
// row | Click selects the circuit: highlights its devices and home run on canvas ... Row shows circuit number, name,
// breaker/type/count, VA.", "Circuit row double-click | Rename circuit inline. | Edit model."; phase-06 EZD-604
// "breaker, wire, name editable; 2-pole numbers like 1-3"; vault/build/assumptions.md EZD-604): New circuit (Panel A
// first when the model has none), rename, the chosen circuit's Breaker, Poles and Wire, the row's device count, and
// the Home runs chip, which with the chosen circuit is shared with the plan (circuit-view.ts).
// EZD-606 (S06 Controls "Existing panel | Inspector, load calc header button; opens a dialog | ... | Edit model";
// vault/build/assumptions.md EZD-606 "Where the Existing panel button sits"): until the load calc header exists
// (EZD-608), the Existing panel button sits in the Panel tab, shown with Edit model and disabled while paused.
// EZD-609 (S06 Controls "Panel tab | ... Compact panel schedule: two columns of spaces (odd/even) ... Click a space
// selects its circuit.", "Panel schedule | Inspector, bottom | Opens the generated panel schedule ... Read only";
// vault/build/assumptions.md EZD-609): the Panel tab's compact schedule and, until the inspector exists (EZD-608),
// the Panel schedule button under it. Both allowed in view only.
import { DEVICE_KINDS, WIRE_SIZES, type CircuitProtection, type WireSize } from '@ezdraft/geometry';
import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { LayerSetting } from '../layers/layer-setting';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import { circuitView } from './circuit-view';
import {
  BREAKER_SIZES,
  circuitDeviceIds,
  circuitEditChange,
  newCircuitChanges,
  nextOpenSpace,
  type CircuitEdit,
} from './circuits';
import type { ToolBase } from './DeviceTools';
import type { ReceiverSlot } from './receiver-slot';
import {
  circuitRows,
  deviceGroups,
  panelRows,
  panelTotals,
  type CircuitRow,
  type DeviceRow,
} from './electrical';
import styles from './ElectricalPanel.module.css';
import { heightNotesShown } from './height-notes-shown';
import { ExistingPanelDialog } from './ExistingPanelDialog';
import { createPanelPhotoReader, type PanelPhotoReader } from './panel-read-client';
import { panelSchedule } from './panel-schedule';
import { CompactSchedule, ScheduleDialog } from './PanelSchedule';

export type ElectricalTab = 'circuits' | 'devices' | 'panel';

export const ELECTRICAL_TABS: readonly ElectricalTab[] = ['circuits', 'devices', 'panel'];

export const SHOW_CHIPS = [
  'receptacles',
  'switch_legs',
  'lighting',
  'home_runs',
  'low_voltage',
] as const;
export type ShowChip = (typeof SHOW_CHIPS)[number];

// Board S06Electrical: Receptacles, Switch legs and Lighting on; Home runs and Low voltage off (assumptions EZD-601).
export const SHOW_CHIPS_DEFAULT: Readonly<Record<ShowChip, boolean>> = {
  receptacles: true,
  switch_legs: true,
  lighting: true,
  home_runs: false,
  low_voltage: false,
};

export type ElectricalPanelProps = {
  store: Pick<ModelStore, 'getState' | 'subscribe'>;
  selection: Pick<SelectionController, 'getUi' | 'subscribe' | 'select'>;
  showObject: (id: string) => boolean;
  // The phase eyes; a hidden device's eye is turned on before it is selected, as a room row does (LeftPanel).
  layers?: Pick<LayerSetting, 'eyes' | 'setEye'>;
  floors?: FloorChoice;
  initialTab?: ElectricalTab;
  // EZD-604: given when the user has Edit model (New circuit, rename and the circuit fields show); `paused` while
  // another user holds the lock or a version is open (shown disabled). The slot's base carries the store's
  // applyEdit, new ids and the new-object status.
  // EZD-606: the project the panel photos are read for; `reader` stands in for the photo read in tests.
  edit?: {
    slot: ReceiverSlot<ToolBase>;
    paused: boolean;
    projectId?: string;
    reader?: PanelPhotoReader;
  };
};

const DEVICE_LABEL: Readonly<Record<(typeof DEVICE_KINDS)[number], MessageKey>> = {
  smoke_detector: 'office.fixtures.detail.smoke_detector',
  co_detector: 'office.fixtures.detail.co_detector',
  smoke_co_detector: 'office.fixtures.detail.smoke_co_detector',
  // EZD-507: the ceiling devices are the same objects here.
  recessed_light: 'office.fixtures.detail.recessed_light',
  ceiling_fan: 'office.fixtures.detail.ceiling_fan',
  speaker: 'office.fixtures.detail.speaker',
  camera: 'office.fixtures.detail.camera',
  wifi_ap: 'office.fixtures.detail.wifi_ap',
  // EZD-602: the toolbar's wall and low-voltage devices.
  receptacle_duplex: 'office.fixtures.detail.receptacle_duplex',
  receptacle_240v: 'office.fixtures.detail.receptacle_240v',
  switch_single: 'office.fixtures.detail.switch_single',
  switch_3way: 'office.fixtures.detail.switch_3way',
  switch_dimmer: 'office.fixtures.detail.switch_dimmer',
  data: 'office.fixtures.detail.data',
  tv: 'office.fixtures.detail.tv',
  doorbell: 'office.fixtures.detail.doorbell',
};

const PROTECTION_LABEL: Readonly<Record<CircuitProtection, MessageKey>> = {
  gfci: 'office.electrical.protection.gfci',
  afci: 'office.electrical.protection.afci',
  dual: 'office.electrical.protection.dual',
};

const deviceLabel = (kind: string): MessageKey | null =>
  Object.hasOwn(DEVICE_LABEL, kind) ? DEVICE_LABEL[kind as keyof typeof DEVICE_LABEL] : null;

export function ElectricalPanel({
  store,
  selection,
  showObject,
  layers,
  floors,
  initialTab = 'circuits',
  edit,
}: ElectricalPanelProps): ReactElement {
  const t = useT();
  const chosen = useChosenFloor(floors);
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const ui = useSyncExternalStore(selection.subscribe, selection.getUi, selection.getUi);
  const [tab, setTab] = useState<ElectricalTab>(initialTab);
  const [panelId, setPanelId] = useState<string | null>(null);
  const view = useSyncExternalStore(circuitView.subscribe, circuitView.get, circuitView.get);
  const circuitId = view.circuit;
  const setCircuitId = (id: string | null) => circuitView.set({ circuit: id });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [existingOpen, setExistingOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const projectId = edit?.projectId;
  const givenReader = edit?.reader;
  const reader = useMemo<PanelPhotoReader | null>(
    () => givenReader ?? (projectId === undefined ? null : createPanelPhotoReader(projectId)),
    [givenReader, projectId],
  );
  const [chipState, setChips] = useState<Record<ShowChip, boolean>>({ ...SHOW_CHIPS_DEFAULT });
  const chips = { ...chipState, home_runs: view.homeRuns, switch_legs: view.switchLegs };
  const noBase = () => null;
  const base = useSyncExternalStore(
    edit?.slot.subscribe ?? (() => () => {}),
    edit === undefined ? noBase : () => edit.slot.getState().base,
    edit === undefined ? noBase : () => edit.slot.getState().base,
  );
  const writable = edit !== undefined && !edit.paused && base !== null;
  // EZD-603 (board S06Electrical "Height notes Off / On"): shows or hides every device note that is turned on.
  const notesShown = useSyncExternalStore(
    heightNotesShown.subscribe,
    heightNotesShown.get,
    heightNotesShown.get,
  );

  const panels = useMemo(() => panelRows(objects), [objects]);
  const panel = panels.find((p) => p.id === panelId) ?? panels[0] ?? null;
  const circuits = useMemo(() => circuitRows(objects, panel?.id ?? null), [objects, panel]);
  const spaceLeft = useMemo(
    () => nextOpenSpace(objects, panel?.id ?? null) !== null,
    [objects, panel],
  );
  const totals = panelTotals(circuits);
  const schedule = useMemo(() => panelSchedule(objects, panel?.id ?? null), [objects, panel]);
  const groups = useMemo(
    () => deviceGroups(objects, openFloorId(objects, chosen)),
    [objects, chosen],
  );
  const selectedDevice = ui.ids.length === 1 ? ui.ids[0]!.toLowerCase() : null;
  const number = new Intl.NumberFormat(t.language);

  const circuitMeta = (c: CircuitRow) =>
    [
      t('office.electrical.circuit.breaker', { amps: c.breaker }),
      c.protection === null ? null : t(PROTECTION_LABEL[c.protection]),
      c.poles === 2 ? t('office.electrical.circuit.two_pole') : null,
      c.dedicated ? t('office.electrical.circuit.dedicated') : null,
      c.count.receptacles > 0
        ? t('office.electrical.circuit.count_rcpt', { count: c.count.receptacles })
        : null,
      c.count.fixtures > 0
        ? t('office.electrical.circuit.count_fix', { count: c.count.fixtures })
        : null,
      c.count.other > 0
        ? t('office.electrical.circuit.count_other', { count: c.count.other })
        : null,
    ]
      .filter((x): x is string => x !== null)
      .join(' · ');

  const deviceMeta = (d: DeviceRow) =>
    [
      d.circuit === null
        ? t('office.electrical.device.no_circuit')
        : t('office.electrical.device.circuit', { number: d.circuit }),
      d.protection === null ? null : t(PROTECTION_LABEL[d.protection]),
    ]
      .filter((x): x is string => x !== null)
      .join(' · ');

  const panelHeader = (p: { name: string; mainBreaker: number | null }) =>
    p.mainBreaker === null
      ? p.name
      : t('office.electrical.panel_header', { name: p.name, amps: p.mainBreaker });

  const apply = (changes: Parameters<ModelStore['applyEdit']>[0] | null) => {
    if (base === null) return false;
    if (changes === null) {
      base.onMessage('office.electrical.circuit.edit_failed');
      return false;
    }
    base.store.applyEdit(changes);
    return true;
  };

  const chooseCircuit = (id: string) => {
    setCircuitId(id);
    selection.select(circuitDeviceIds(store.getState().objects, id));
  };

  const addCircuit = () => {
    if (!writable || base === null) return;
    const objs = base.store.getState().objects;
    const made = newCircuitChanges(objs, {
      panelId: panel?.id ?? null,
      level: openFloorId(objs, base.chosenFloor()),
      newId: base.newId,
      status: base.newStatus(),
      name: (n) => t('office.electrical.device.circuit', { number: n }),
      panelName: t('office.electrical.default_panel'),
    });
    if (made === null) {
      base.onMessage('office.electrical.circuit.edit_failed');
      return;
    }
    base.store.applyEdit(made.changes);
    chooseCircuit(made.circuitId);
  };

  const editCircuit = (id: string, e: CircuitEdit) => {
    if (!writable || base === null) return;
    const change = circuitEditChange(base.store.getState().objects, id, e);
    apply(change === null ? null : [change]);
  };

  const header =
    panel === null ? null : (
      <div className={styles.header} data-testid="electrical-panel-header">
        {panels.length > 1 ? (
          <select
            className={styles.select}
            aria-label={t('office.electrical.panel_select')}
            data-testid="electrical-panel-select"
            value={panel.id}
            onChange={(e) => {
              setPanelId(e.target.value);
              setCircuitId(null);
            }}
          >
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {panelHeader(p)}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.panelName} data-testid="electrical-panel-name">
            {panelHeader(panel)}
          </span>
        )}
        <span className={styles.units}>{t('office.electrical.units')}</span>
      </div>
    );

  let body: ReactElement | null = null;
  if (tab === 'circuits') {
    body =
      circuits.length === 0 ? (
        <p className={styles.none} data-testid="electrical-empty">
          {t('office.electrical.empty')}
        </p>
      ) : (
        <div className={styles.list}>
          {circuits.map((c) => {
            const on = circuitId === c.id;
            if (renaming === c.id && writable)
              return (
                <input
                  key={c.id}
                  className={styles.rename}
                  data-testid="circuit-rename"
                  aria-label={t('office.electrical.circuit.name')}
                  defaultValue={c.name}
                  autoFocus
                  onBlur={(e) => {
                    setRenaming(null);
                    if (e.currentTarget.value.trim() !== c.name)
                      editCircuit(c.id, { field: 'name', text: e.currentTarget.value });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    else if (e.key === 'Escape') {
                      e.currentTarget.value = c.name;
                      e.currentTarget.blur();
                    }
                  }}
                />
              );
            return (
              <div key={c.id} className={styles.circuitItem}>
                <button
                  type="button"
                  className={`${styles.circuit} ${on ? styles.circuitOn : ''} ${touch.target}`}
                  data-testid="circuit-row"
                  data-circuit-id={c.id}
                  aria-pressed={on}
                  onClick={() => chooseCircuit(c.id)}
                  onDoubleClick={() => {
                    if (writable) setRenaming(c.id);
                  }}
                >
                  <span className={styles.num} data-testid="circuit-number">
                    {c.number}
                  </span>
                  <span className={styles.text}>
                    <span className={styles.rowName}>{c.name}</span>
                    <span className={styles.meta} data-testid="circuit-meta">
                      {circuitMeta(c)}
                    </span>
                  </span>
                  <span className={styles.va} data-testid="circuit-va">
                    {c.load}
                  </span>
                </button>
                {on && edit !== undefined ? (
                  <div className={styles.fields} data-testid="circuit-fields">
                    <label className={styles.field}>
                      <span>{t('office.electrical.circuit.breaker_label')}</span>
                      <select
                        className={styles.select}
                        data-testid="circuit-breaker"
                        disabled={!writable}
                        value={c.breaker}
                        onChange={(e) =>
                          editCircuit(c.id, { field: 'breaker', amps: Number(e.target.value) })
                        }
                      >
                        {(BREAKER_SIZES as readonly number[]).includes(c.breaker) ? null : (
                          <option value={c.breaker}>{c.breaker}</option>
                        )}
                        {BREAKER_SIZES.map((a) => (
                          <option key={a} value={a}>
                            {t('office.electrical.circuit.breaker', { amps: a })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>{t('office.electrical.circuit.poles_label')}</span>
                      <select
                        className={styles.select}
                        data-testid="circuit-poles"
                        disabled={!writable}
                        value={c.poles}
                        onChange={(e) =>
                          editCircuit(c.id, {
                            field: 'poles',
                            poles: e.target.value === '2' ? 2 : 1,
                          })
                        }
                      >
                        <option value={1}>{t('office.electrical.circuit.one_pole')}</option>
                        <option value={2}>{t('office.electrical.circuit.two_pole')}</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>{t('office.electrical.circuit.wire_label')}</span>
                      <select
                        className={styles.select}
                        data-testid="circuit-wire"
                        disabled={!writable}
                        value={c.wire ?? ''}
                        onChange={(e) =>
                          editCircuit(c.id, { field: 'wire', size: e.target.value as WireSize })
                        }
                      >
                        {c.wire === null ? (
                          <option value="">{t('office.electrical.circuit.not_set')}</option>
                        ) : null}
                        {WIRE_SIZES.map((w) => (
                          <option key={w} value={w}>
                            {t('office.electrical.circuit.awg', { size: w })}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      );
  } else if (tab === 'devices') {
    body =
      groups.length === 0 ? (
        <p className={styles.none} data-testid="electrical-no-devices">
          {t('office.electrical.no_devices')}
        </p>
      ) : (
        <div className={styles.groups}>
          {groups.map((g) => (
            <div
              key={g.roomId ?? ''}
              className={styles.group}
              data-testid="device-group"
              data-room-id={g.roomId ?? ''}
            >
              <span className={styles.groupName} data-testid="device-group-name">
                {g.name ?? t('office.electrical.device.no_room')}
              </span>
              {g.devices.map((d) => {
                const label = deviceLabel(d.kind);
                const on = selectedDevice === d.id.toLowerCase();
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`${styles.device} ${on ? styles.circuitOn : ''} ${touch.target}`}
                    data-testid="device-row"
                    data-device-id={d.id}
                    aria-current={on ? 'true' : undefined}
                    onClick={() => {
                      if (layers !== undefined && !layers.eyes()[d.status])
                        layers.setEye(d.status, true);
                      selection.select([d.id]);
                      showObject(d.id);
                    }}
                  >
                    <span className={styles.rowName}>{label === null ? d.kind : t(label)}</span>
                    <span className={styles.meta} data-testid="device-meta">
                      {deviceMeta(d)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      );
  } else if (schedule !== null && panel !== null) {
    body = (
      <>
        <CompactSchedule schedule={schedule} chosen={circuitId} onChoose={chooseCircuit} />
        <button
          type="button"
          className={`${styles.newCircuit} ${touch.target}`}
          data-testid="electrical-panel-schedule"
          onClick={() => setScheduleOpen(true)}
        >
          <span>{t('office.electrical.schedule.open')}</span>
        </button>
        {scheduleOpen ? (
          <ScheduleDialog
            schedule={schedule}
            title={panelHeader(panel)}
            onClose={() => setScheduleOpen(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className={styles.panel} data-testid="electrical-panel" data-tab={tab}>
      <div className={styles.tabs} role="tablist" aria-label={t('office.electrical.tabs')}>
        {ELECTRICAL_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.seg} ${tab === id ? styles.segOn : ''} ${touch.target}`}
            data-testid={`electrical-tab-${id}`}
            onClick={() => setTab(id)}
          >
            {t(`office.electrical.tab.${id}`)}
          </button>
        ))}
      </div>
      {header}
      <div className={styles.body} role="tabpanel" data-testid={`electrical-body-${tab}`}>
        {panel === null && tab !== 'devices' ? (
          <p className={styles.none} data-testid="electrical-no-panel">
            {tab === 'circuits' ? t('office.electrical.empty') : t('office.electrical.no_panel')}
          </p>
        ) : (
          body
        )}
        {tab === 'panel' && edit !== undefined && reader !== null ? (
          <button
            type="button"
            className={`${styles.newCircuit} ${touch.target}`}
            data-testid="electrical-existing-panel"
            disabled={!writable}
            onClick={() => setExistingOpen(true)}
          >
            <span>{t('office.electrical.existing.open')}</span>
          </button>
        ) : null}
        {existingOpen && writable && base !== null && reader !== null ? (
          <ExistingPanelDialog
            getObjects={() => base.store.getState().objects}
            panelId={panel?.id ?? null}
            reader={reader}
            ctx={{
              newId: base.newId,
              level: openFloorId(base.store.getState().objects, base.chosenFloor()),
              panelName: t('office.electrical.default_panel'),
              circuitName: (n) => t('office.electrical.device.circuit', { number: n }),
            }}
            onApply={(changes) => base.store.applyEdit(changes)}
            onClose={() => setExistingOpen(false)}
          />
        ) : null}
        {tab === 'circuits' && edit !== undefined ? (
          <button
            type="button"
            className={`${styles.newCircuit} ${touch.target}`}
            data-testid="electrical-new-circuit"
            disabled={!writable || !spaceLeft}
            onClick={addCircuit}
          >
            <Icon name="add" size={16} />
            <span>{t('office.electrical.new_circuit')}</span>
          </button>
        ) : null}
        <div className={styles.show} data-testid="electrical-show">
          <span className={styles.lbl}>{t('office.electrical.show')}</span>
          <div className={styles.chips}>
            {SHOW_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.chip} ${chips[c] ? styles.chipOn : ''} ${touch.target}`}
                aria-pressed={chips[c]}
                data-testid={`electrical-chip-${c}`}
                onClick={() =>
                  c === 'home_runs'
                    ? circuitView.set({ homeRuns: !view.homeRuns })
                    : c === 'switch_legs'
                      ? circuitView.set({ switchLegs: !view.switchLegs })
                      : setChips((prev) => ({ ...prev, [c]: !prev[c] }))
                }
              >
                {t(`office.electrical.chip.${c}`)}
              </button>
            ))}
          </div>
          <div className={styles.notes} data-testid="electrical-height-notes">
            <span>{t('office.electrical.height_notes')}</span>
            <span
              className={styles.toggle}
              role="group"
              aria-label={t('office.electrical.height_notes')}
            >
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  className={`${styles.toggleSeg} ${notesShown === v ? styles.toggleOn : ''} ${touch.target}`}
                  aria-pressed={notesShown === v}
                  data-testid={`electrical-height-notes-${v ? 'on' : 'off'}`}
                  onClick={() => heightNotesShown.set(v)}
                >
                  {t(
                    v ? 'office.electrical.height_notes_on' : 'office.electrical.height_notes_off',
                  )}
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.footer} data-testid="electrical-footer">
        <span data-testid="electrical-footer-counts">
          {`${t('office.electrical.footer.circuits', { count: totals.circuits })} · ${t(
            'office.electrical.footer.spaces',
            { count: totals.spaces },
          )}`}
        </span>
        <span className={styles.total} data-testid="electrical-footer-va">
          {t('office.electrical.va', { va: number.format(totals.va) })}
        </span>
      </div>
    </div>
  );
}
