'use client';
// EZD-507 (S05 Controls "Smoke or CO detector: Places a detector", "Speaker or low voltage: Places in-ceiling
// speaker, camera or Wi-Fi access point", "Access panel: Places an access panel or attic hatch"; vault/build/
// assumptions.md EZD-507): while a ceiling tool with more than one kind is on, a small card over the canvas's left
// edge (the Fixtures panel's card) picks the kind the next click places. The tool's name heads it.
import type { ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import {
  DEVICE_TOOL_KINDS,
  type CeilingDeviceKind,
  type CeilingDeviceToolId,
} from '../../editor/tools/ceiling-device-tool';
import styles from './DeviceChooser.module.css';

export type DeviceChooserProps = {
  tool: CeilingDeviceToolId;
  kind: CeilingDeviceKind;
  onChoose: (kind: CeilingDeviceKind) => void;
};

const toolKey = (tool: CeilingDeviceToolId) =>
  `office.ceiling.tool.${tool.replace(/-/g, '_')}` as MessageKey;
const kindKey = (kind: CeilingDeviceKind) => `office.fixtures.detail.${kind}` as MessageKey;

export function DeviceChooser({ tool, kind, onChoose }: DeviceChooserProps): ReactElement | null {
  const t = useT();
  const kinds = DEVICE_TOOL_KINDS[tool];
  if (kinds.length < 2) return null;
  return (
    <div
      className={styles.panel}
      data-testid="ceiling-device-chooser"
      role="group"
      aria-label={t('office.ceiling.device.chooser')}
    >
      <h2 className={styles.heading}>{t(toolKey(tool))}</h2>
      <div className={styles.kinds}>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            className={`${styles.kind} ${touch.hitArea}`}
            aria-pressed={k === kind}
            data-testid={`ceiling-device-${k}`}
            onClick={() => onChoose(k)}
          >
            {t(kindKey(k))}
          </button>
        ))}
      </div>
    </div>
  );
}
