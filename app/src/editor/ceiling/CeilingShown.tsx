'use client';
// EZD-502 (S05 Layout "legend chip bottom left"; S05 Controls "Legend chip: shows switch zone line style"; S05 Layout
// "Status bar adds View, Scale and Joists status"; S05 States "Joists unknown"; board S05Ceiling footer "View Reflected
// ceiling plan", "Joists unknown · beam clash checks off"): the parts the editor shows on Ceiling or Both. The ACT
// border sizes join the legend with the ACT grid (EZD-511); the joist text changes with Framing known (EZD-514).
// EZD-508 (11 Budgets editor download size; 11 rule 7): moved from CeilingParts.tsx so they load with the RCP drawing
// (rcp.ts re-exports them); they show on Ceiling or Both only, as the drawing does.
import { useMemo, type ReactElement, type ReactNode } from 'react';
import type { FramingKnown } from '@ezdraft/geometry';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { FloorChoice } from '../floors/floors';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { ModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import { openFloorId } from '../plan/batches';
import type { SelectionController } from '../selection/selection-controller';
import { framingOf } from '../tools/framing-edits';
import { useStoreValue } from '../shared/use-store-value';
import { activeRoomId } from './room-ceiling';
import styles from './CeilingParts.module.css';

// EZD-511 (S05 Controls "Legend chip ... ACT border sizes for the selected grid"): `children` is the selected grid's
// border sizes (tools/ActGridPanel.tsx ActLegend), after the switch zone sample.
export function CeilingLegend({ children }: { children?: ReactNode } = {}): ReactElement {
  const t = useT();
  return (
    <div className={styles.legend} data-testid="ceiling-legend">
      <span className={styles.zone} data-legend="switch-zone" aria-hidden="true" />
      <span>{t('office.ceiling.legend.switch_zone')}</span>
      {children}
    </div>
  );
}

export function CeilingViewStatus(): ReactElement {
  const t = useT();
  const text = t('office.ceiling.status.rcp');
  // EZD-1981 (audit F5): may be cut with an ellipsis; the full text is the tooltip.
  return (
    <StatusItem label="office.ceiling.status.view" title={text}>
      <span data-testid="status-ceiling-view">{text}</span>
    </StatusItem>
  );
}

// EZD-514 (S05 Controls "Framing known ... Status bar text changes from "unknown · beam clash checks off""; S05 States
// "Joists unknown", "Joists known"): the text follows the active room's Framing known choice (room-ceiling.ts
// activeRoomId, as the left panel's summary does); without a model it reads Unknown.
const JOISTS_TEXT: Record<FramingKnown, MessageKey> = {
  unknown: 'office.ceiling.status.joists_unknown',
  new_construction: 'office.ceiling.status.joists_new_construction',
  full_demo: 'office.ceiling.status.joists_full_demo',
  entered: 'office.ceiling.status.joists_entered',
};

const NO_OBJECTS: Objects = new Map();
const NO_IDS: readonly string[] = [];

export type JoistsStatusProps = {
  store?: Pick<ModelStore, 'getState' | 'subscribe'> | undefined;
  selection?: Pick<SelectionController, 'getUi' | 'subscribe'> | undefined;
  floors?: FloorChoice | undefined;
};

export function JoistsStatus({ store, selection, floors }: JoistsStatusProps = {}): ReactElement {
  const t = useT();
  const chosen = useChosenFloor(floors);
  const objects = useStoreValue(store, (s) => s.getState().objects, NO_OBJECTS);
  const ids = useStoreValue(selection, (s) => s.getUi().ids, NO_IDS);
  const known = useMemo<FramingKnown>(() => {
    const roomId = activeRoomId(objects, openFloorId(objects, chosen), ids);
    return (roomId === null ? null : framingOf(objects, roomId))?.known ?? 'unknown';
  }, [objects, chosen, ids]);
  const text = t(JOISTS_TEXT[known]);
  // EZD-1981 (audit F5): the longest ceiling cell; cut with an ellipsis when the bar runs out, full text as tooltip.
  return (
    <StatusItem label="office.ceiling.status.joists" title={text}>
      <span data-testid="status-joists" data-framing={known}>
        {text}
      </span>
    </StatusItem>
  );
}
