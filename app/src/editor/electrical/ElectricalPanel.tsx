'use client';
// EZD-601 (S06 Layout "Left panel: Circuits / Devices / Panel tabs; panel header ("Panel A · 200A main", units
// AMPS · VA); circuit list; New circuit; Show chips; footer totals"; S06 Controls Circuits tab "Default tab", Devices
// tab, Panel tab, Panel selector, Circuit row "Selected state (accent). Allowed in view only", Show chips "Multiple
// on. Display only; allowed in view only", Circuit/space footer; S06 States Empty "circuit list empty with "Place
// devices or add a circuit""; S06 Decisions 9; board S06Electrical left panel; AC-EZD-601-1; vault/build/
// assumptions.md EZD-601): the left panel in electrical mode. Every control here is allowed in view only. New
// circuit, rename and the circuit's canvas highlight arrive with EZD-604; the Panel tab's compact schedule with
// EZD-609; what the chips show on the plan with the tickets that draw those layers (EZD-602, EZD-604, EZD-605).
import { DEVICE_KINDS, type CircuitProtection } from '@ezdraft/geometry';
import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { LayerSetting } from '../layers/layer-setting';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import {
  circuitRows,
  deviceGroups,
  panelRows,
  panelTotals,
  type CircuitRow,
  type DeviceRow,
} from './electrical';
import styles from './ElectricalPanel.module.css';

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
};

const DEVICE_LABEL: Readonly<Record<(typeof DEVICE_KINDS)[number], MessageKey>> = {
  smoke_detector: 'office.fixtures.detail.smoke_detector',
  co_detector: 'office.fixtures.detail.co_detector',
  smoke_co_detector: 'office.fixtures.detail.smoke_co_detector',
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
  const [circuitId, setCircuitId] = useState<string | null>(null);
  const [chips, setChips] = useState<Record<ShowChip, boolean>>({ ...SHOW_CHIPS_DEFAULT });

  const panels = useMemo(() => panelRows(objects), [objects]);
  const panel = panels.find((p) => p.id === panelId) ?? panels[0] ?? null;
  const circuits = useMemo(() => circuitRows(objects, panel?.id ?? null), [objects, panel]);
  const totals = panelTotals(circuits);
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
                {t('office.electrical.panel_header', { name: p.name, amps: p.mainBreaker })}
              </option>
            ))}
          </select>
        ) : (
          <span className={styles.panelName} data-testid="electrical-panel-name">
            {t('office.electrical.panel_header', { name: panel.name, amps: panel.mainBreaker })}
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
            return (
              <button
                key={c.id}
                type="button"
                className={`${styles.circuit} ${on ? styles.circuitOn : ''} ${touch.target}`}
                data-testid="circuit-row"
                data-circuit-id={c.id}
                aria-pressed={on}
                onClick={() => setCircuitId(c.id)}
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
                onClick={() => setChips((prev) => ({ ...prev, [c]: !prev[c] }))}
              >
                {t(`office.electrical.chip.${c}`)}
              </button>
            ))}
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
