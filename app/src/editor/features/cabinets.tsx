// EZD-1913a (editor plan 5.3 "features plug in"): Cabinets mode as a registry feature. While the Cabinets tool is on:
// - EZD-404 (S04 Layout; AC-EZD-404-1): the cabinet run screen covers the plan (overlay), so the plan's edit keys and
//   zoom are off (coversPlan);
// - EZD-403 (S04 Layout "Left panel 248px 'Cabinet library'"): the cabinet library takes the left panel;
// - EZD-406 (S04 Layout "Inspector 336px: selected box"): the box inspector takes the inspector place;
// - the cabinet run status readouts sit in the status bar's start;
// - EZD-1986 (audit F9): the pressed Cabinets tool shows no tooltip over the library (railClass).
// The four parts share one cabinet selection per model session; leaving the tool drops it (as before EZD-406).
import type { ReactNode } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import {
  createCabinetSelectionStore,
  type CabinetSelectionStore,
} from '../cabinets/cabinet-selection-store';
import type { EditorSession } from '../editor-session';
import { lazyPart } from '../shared/lazy-part';
import { editorDefaults, useDefault } from '../shared/use-default';
import styles from './cabinets.module.css';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-404 (11 Budgets; 11 rule 7): the cabinet run screen loads when the Cabinets tool is first turned on.
const cabinetRunModule = lazyModule(() =>
  withScreenMessages(import('../../lib/messages/screens/cabinet-run.messages'), import('../../lazy/cabinet-run')),
);

const LazyCabinetRun = lazyPart(cabinetRunModule, 'CabinetRunView');
const LazyCabinetInspector = lazyPart(cabinetRunModule, 'CabinetInspector');
const LazyCabinetLibrary = lazyPart(cabinetRunModule, 'CabinetLibrary');
const LazyCabinetStatus = lazyPart(cabinetRunModule, 'CabinetRunStatus');

type Store = EditorSession['store'];

// A new model session starts with no cabinet selected: one selection per model store.
const selections = new WeakMap<Store, CabinetSelectionStore>();
function selectionOf(store: Store): CabinetSelectionStore {
  let s = selections.get(store);
  if (s === undefined) {
    s = createCabinetSelectionStore();
    selections.set(store, s);
  }
  return s;
}

type PartProps = { ctx: EditorFeatureContext; store: Store };

function CabinetRunOverlay({ ctx, store }: PartProps): ReactNode {
  // EZD-407: the Defaults "Cabinet fit" tolerance for the fit chip; EZD-408: the "Cabinet auto-fill increment".
  const fitTolerance = useDefault(ctx.defaults, editorDefaults.fitTolerance);
  const autoFillIncrement = useDefault(ctx.defaults, editorDefaults.autoFillIncrement);
  // EZD-405: boxes are edited here with Edit model and the lock.
  return (
    <LazyCabinetRun
      store={store}
      floors={ctx.floors}
      canEdit={ctx.mayEdit}
      selectionStore={selectionOf(store)}
      fitTolerance={fitTolerance}
      autoFillIncrement={autoFillIncrement}
    />
  );
}

function CabinetLibraryPart({ ctx, store }: PartProps): ReactNode {
  const fitTolerance = useDefault(ctx.defaults, editorDefaults.fitTolerance);
  return (
    <LazyCabinetLibrary
      store={store}
      floors={ctx.floors}
      canEdit={ctx.mayEdit}
      selectionStore={selectionOf(store)}
      fitTolerance={fitTolerance}
    />
  );
}

export const feature: EditorFeature = {
  id: 'cabinets',
  order: 100,
  active: (ctx) => ctx.tool === 'cabinets',
  coversPlan: true,
  railClass: styles.quietRail,
  overlay: (ctx) => (ctx.store === null ? null : <CabinetRunOverlay ctx={ctx} store={ctx.store} />),
  leftPanel: (ctx) => (ctx.store === null ? null : <CabinetLibraryPart ctx={ctx} store={ctx.store} />),
  inspector: (ctx) =>
    ctx.store === null ? null : (
      <LazyCabinetInspector
        store={ctx.store}
        selectionStore={selectionOf(ctx.store)}
        floors={ctx.floors}
        canEdit={ctx.mayEdit}
      />
    ),
  statusStart: (ctx) =>
    ctx.store === null ? null : (
      <LazyCabinetStatus store={ctx.store} floors={ctx.floors} selectionStore={selectionOf(ctx.store)} />
    ),
  // Leaving the Cabinets tool drops its selection.
  leave: (ctx) => {
    if (ctx.store !== null) selections.get(ctx.store)?.getState().send({ type: 'set', ids: [] });
  },
};
