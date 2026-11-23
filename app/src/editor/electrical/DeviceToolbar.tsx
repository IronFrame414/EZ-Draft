'use client';
// EZD-602 (S06 Controls "Device toolbar: Receptacle | Canvas, floating toolbar | Places receptacles. Attributes:
// circuit, GFCI/AFCI, type (duplex, 240V). | Edit model. Paused (55% opacity, disabled) in view only with note
// "Editing tools paused while view only".", Switch, Light, Low voltage, Smoke/CO, Fan "Same"; S06 Permissions
// "Controls a user lacks permission for are hidden, not disabled"; board S06Electrical; Q-0630 every action without a
// keyboard; Q-0769 items not on the board in the board's style; vault/build/assumptions.md EZD-602): the floating
// device toolbar over the electrical plan. A press arms an item (a second press disarms it, so plan clicks select
// again); the armed item's kinds, and for a receptacle its GFCI/AFCI, show under it. Without Edit model the parent
// does not draw it; `paused` (view only, or a version open) draws every item disabled with the note.
// EZD-604: the Circuit item after the device items (board order), disabled until a circuit is chosen in the left
// panel; while it is armed a plan click on a device puts it on that circuit.
import { useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import type { IconName } from '../../components/icon/icon-names.generated';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { circuitView } from './circuit-view';
import {
  chosenKind,
  CIRCUIT_TOOL,
  DEVICE_TOOLBAR_ITEMS,
  TOOLBAR_KINDS,
  type DeviceToolbarItem,
} from './toolbar-items';
import type { ElectricalToolbar, ToolbarProtection } from './toolbar-state';
import styles from './DeviceToolbar.module.css';

export type DeviceToolbarProps = {
  toolbar: ElectricalToolbar;
  paused: boolean;
};

const ICON: Readonly<Record<DeviceToolbarItem, IconName>> = {
  receptacle: 'bolt',
  switch: 'tune',
  light: 'light',
  'low-voltage': 'speaker',
  detector: 'notifications',
  fan: 'hvac',
};

const itemKey = (item: DeviceToolbarItem) =>
  `office.electrical.tool.${item.replace(/-/g, '_')}` as MessageKey;
const kindKey = (kind: string) => `office.fixtures.detail.${kind}` as MessageKey;

export const PROTECTION_CHOICES: readonly { value: ToolbarProtection; key: MessageKey }[] = [
  { value: null, key: 'office.electrical.protection.none' },
  { value: 'gfci', key: 'office.electrical.protection.gfci' },
  { value: 'afci', key: 'office.electrical.protection.afci' },
  { value: 'dual', key: 'office.electrical.protection.dual' },
];

export function DeviceToolbar({ toolbar, paused }: DeviceToolbarProps): ReactElement {
  const t = useT();
  const s = useSyncExternalStore(toolbar.subscribe, toolbar.get, toolbar.get);
  // EZD-604: the Circuit tool needs a circuit chosen in the left panel; without one it is disabled.
  const view = useSyncExternalStore(circuitView.subscribe, circuitView.get, circuitView.get);
  const circuitArmed = !paused && s.armed === CIRCUIT_TOOL && view.circuit !== null;
  const armed =
    paused || s.armed === CIRCUIT_TOOL ? null : (s.armed as DeviceToolbarItem | null);
  const kinds = armed === null ? [] : TOOLBAR_KINDS[armed];
  return (
    <div className={styles.bar} data-testid="device-toolbar">
      <div className={styles.row}>
        <div className={styles.tools} role="toolbar" aria-label={t('office.electrical.toolbar')}>
          {DEVICE_TOOLBAR_ITEMS.map((item) => (
            <button
              key={item}
              type="button"
              className={`${styles.item} ${touch.hitArea}`}
              data-testid={`device-tool-${item}`}
              aria-pressed={armed === item}
              disabled={paused}
              onClick={() => toolbar.press(item)}
            >
              <Icon name={ICON[item]} size={16} />
              <span>{t(itemKey(item))}</span>
            </button>
          ))}
          <button
            type="button"
            className={`${styles.item} ${touch.hitArea}`}
            data-testid="device-tool-circuit"
            aria-pressed={circuitArmed}
            disabled={paused || view.circuit === null}
            title={view.circuit === null ? t('office.electrical.tool.circuit_pick') : undefined}
            onClick={() => toolbar.press(CIRCUIT_TOOL)}
          >
            <Icon name="bolt" size={16} />
            <span>{t('office.electrical.tool.circuit')}</span>
          </button>
        </div>
        {paused ? (
          <span className={styles.note} data-testid="device-toolbar-paused">
            {t('office.lock.tools_paused')}
          </span>
        ) : null}
      </div>
      {armed !== null && (kinds.length > 1 || armed === 'receptacle') ? (
        <div
          className={styles.choices}
          role="group"
          aria-label={t('office.ceiling.device.chooser')}
          data-testid="device-toolbar-choices"
        >
          {kinds.length > 1
            ? kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.choice} ${touch.hitArea}`}
                  aria-pressed={chosenKind(s.kinds, armed) === k}
                  data-testid={`device-kind-${k}`}
                  onClick={() => toolbar.set({ kinds: { ...s.kinds, [armed]: k } })}
                >
                  {t(kindKey(k))}
                </button>
              ))
            : null}
          {armed === 'receptacle' ? (
            <>
              <span className={styles.divider} aria-hidden="true" />
              <span className={styles.label}>{t('office.electrical.protection.label')}</span>
              {PROTECTION_CHOICES.map((p) => (
                <button
                  key={p.value ?? 'none'}
                  type="button"
                  className={`${styles.choice} ${touch.hitArea}`}
                  aria-pressed={s.protection === p.value}
                  data-testid={`device-protection-${p.value ?? 'none'}`}
                  onClick={() => toolbar.set({ protection: p.value })}
                >
                  {t(p.key)}
                </button>
              ))}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
