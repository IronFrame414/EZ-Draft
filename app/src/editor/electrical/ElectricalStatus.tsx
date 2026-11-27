'use client';
// EZD-601 (S06 Layout "Status bar adds: Layer, Service, Code, and a "View only" lock indicator"; S06 Data shown
// "Status bar: layer, scale (1/2" = 1'-0"), service and calculated amps, code edition"; board S06Electrical footer
// "Layer Power + lighting", "Service 200A · 149.5A calc", "Code NEC 2023 · FBC 9th ed."; vault/build/assumptions.md
// EZD-601): the status items electrical mode adds. Service is the main panel's service size; the calculated amps
// join it with the load calc (EZD-607). Code is the v1 edition, the only one the app has (EZD-613, Q-0220); the
// "View only" indicator is the edit lock's own status item (EZD-126).
// EZD-607: the calculated amps follow the service ("200A · 149.5A calc") once the main panel has a load calc that
// computes; with no load calc, or one that stops on a calc error, the service shows alone.
// EZD-614 (AC-EZD-614-1): the calc takes the company's appliance rating defaults, so an item with no rating is worked
// out at its type's default.
import { DEFAULT_CODE_EDITION } from '../../lib/code-edition/editions';
import { useMemo, useSyncExternalStore, type ReactElement } from 'react';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import type { ModelStore } from '../model/model-store';
import { panelRows } from './electrical';
import { panelLoadCalc } from './existing-panel';
import {
  useApplianceDefaults,
  type ApplianceDefaultsSource,
} from '../../lib/appliance-ratings/defaults-source';

export function ElectricalStatus({
  store,
  defaultsSource,
}: {
  store: Pick<ModelStore, 'getState' | 'subscribe'>;
  /** Tests pass their own; the page shares one (defaults-source.ts). */
  defaultsSource?: ApplianceDefaultsSource;
}): ReactElement {
  const t = useT();
  const defaults = useApplianceDefaults(defaultsSource);
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const { service, calc } = useMemo(() => {
    const main = panelRows(objects)[0];
    if (main === undefined) return { service: null, calc: null };
    const r = panelLoadCalc(objects, main.id, defaults);
    return { service: main.serviceSize, calc: r !== null && r.ok ? r.amps : null };
  }, [objects, defaults]);
  // EZD-1981 (audit F5): the two long cells may be cut with an ellipsis; the full text is their tooltip.
  const layer = t('office.electrical.status.layer_power');
  const code = t(`office.electrical.status.code.${DEFAULT_CODE_EDITION}`);
  return (
    <>
      <StatusItem label="office.electrical.status.layer" title={layer}>
        <span data-testid="status-electrical-layer">{layer}</span>
      </StatusItem>
      {service === null ? null : (
        <StatusItem label="office.electrical.status.service">
          <span data-testid="status-electrical-service">
            {calc === null
              ? t('office.electrical.status.service_amps', { amps: service })
              : t('office.electrical.status.service_calc', {
                  amps: service,
                  calc: calc.toFixed(1),
                })}
          </span>
        </StatusItem>
      )}
      <StatusItem label="office.electrical.status.code" title={code}>
        <span data-testid="status-electrical-code">{code}</span>
      </StatusItem>
    </>
  );
}
