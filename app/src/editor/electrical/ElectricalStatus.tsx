'use client';
// EZD-601 (S06 Layout "Status bar adds: Layer, Service, Code, and a "View only" lock indicator"; S06 Data shown
// "Status bar: layer, scale (1/2" = 1'-0"), service and calculated amps, code edition"; board S06Electrical footer
// "Layer Power + lighting", "Service 200A · 149.5A calc", "Code NEC 2023 · FBC 9th ed."; vault/build/assumptions.md
// EZD-601): the status items electrical mode adds. Service is the main panel's service size; the calculated amps
// join it with the load calc (EZD-607). Code is the v1 edition, the only one the app has (EZD-613, Q-0220); the
// "View only" indicator is the edit lock's own status item (EZD-126).
import { DEFAULT_CODE_EDITION } from '../../lib/code-edition/editions';
import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import type { ModelStore } from '../model/model-store';
import { panelRows } from './electrical';

export function ElectricalStatus({
  store,
}: {
  store: Pick<ModelStore, 'getState' | 'subscribe'>;
}): ReactElement {
  const t = useT();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const service = useMemo(() => panelRows(objects)[0]?.serviceSize ?? null, [objects]);
  return (
    <>
      <StatusItem label="office.electrical.status.layer">
        <span data-testid="status-electrical-layer">
          {t('office.electrical.status.layer_power')}
        </span>
      </StatusItem>
      {service === null ? null : (
        <StatusItem label="office.electrical.status.service">
          <span data-testid="status-electrical-service">
            {t('office.electrical.status.service_amps', { amps: service })}
          </span>
        </StatusItem>
      )}
      <StatusItem label="office.electrical.status.code">
        <span data-testid="status-electrical-code">
          {t(`office.electrical.status.code.${DEFAULT_CODE_EDITION}`)}
        </span>
      </StatusItem>
    </>
  );
}
