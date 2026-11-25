'use client';
// EZD-416 (S04b Layout "Status bar adds Exposed edge (lf) and Increment"; board S04bCountertops status bar "Exposed
// edge 36 lf", "Increment 1/2""; AC-EZD-416-1): the countertop readouts in the status bar while the Countertops tool
// is on: the exposed edge of the tops on the floor to the whole foot, and the Defaults countertop increment.
import type { ReactElement } from 'react';
import { countertopFooter } from '@ezdraft/geometry';
import { StatusItem } from '../../components/shell/StatusBar';
import { inchText } from '../../editor/shared/inch-text';
import { useT } from '../../lib/messages';
import type { ModelStore } from '../../editor/model/model-store';
import type { FloorChoice } from '../../editor/floors/floors';
import { countertopIncrement, useCountertopFloor } from './use-countertop-floor';

export type CountertopsStatusProps = {
  store: ModelStore;
  floors?: FloorChoice;
  defaults?: Readonly<Record<string, unknown>> | null;
};

export function CountertopsStatus({ store, floors, defaults = null }: CountertopsStatusProps): ReactElement {
  const t = useT();
  const { pieces } = useCountertopFloor(store, floors);
  const footer = countertopFooter(pieces.map((p) => p.data));
  return (
    <>
      <StatusItem label="office.countertops.status_exposed">
        <span data-testid="status-countertop-exposed">
          {t('office.countertops.status_exposed_value', { lf: String(footer.exposedEdgeLf) })}
        </span>
      </StatusItem>
      <StatusItem label="office.countertops.status_increment">
        <span data-testid="status-countertop-increment">
          {inchText(countertopIncrement(defaults))}
        </span>
      </StatusItem>
    </>
  );
}
