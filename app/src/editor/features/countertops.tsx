// EZD-1913a (editor plan 5.3 "features plug in"): Countertops mode as a registry feature. While the Countertops tool
// is on (EZD-412, S04b Entry points "Countertops (K) tool on the rail"):
// - EZD-412: the countertop screen covers the plan (overlay), so the plan's edit keys and zoom are off (coversPlan);
//   tops are traced and drawn there with Edit model and the lock;
// - EZD-416 (S04b Layout "Left panel: tabs Pieces / Edges / Material"): the countertop panel takes the left panel;
// - EZD-418 (S04b Layout "Inspector: ... Top schedule"): the inspector place holds the countertop inspector, the
//   selected top's piece inspector (EZD-414) above its footer's Top schedule;
// - EZD-416: the countertop status readouts sit in the status bar's start.
// The parts share one countertop selection per model session; leaving the tool drops it.
import type { ReactNode } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { withScreenMessages } from '../../lib/messages/screen-messages';
import {
  createCountertopSelectionStore,
  type CountertopSelectionStore,
} from '../countertops/selection-store';
import type { EditorSession } from '../editor-session';
import { lazyPart } from '../shared/lazy-part';
import { editorDefaults, useDefault } from '../shared/use-default';
import { newObjectId } from '../tools/model-changes';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-412 (11 Budgets; 11 rule 7): the countertop screen loads when the Countertops tool is first turned on.
const countertopsModule = lazyModule(() =>
  withScreenMessages(import('../../lib/messages/screens/countertops.messages'), import('../../lazy/countertops')),
);

const LazyCountertops = lazyPart(countertopsModule, 'CountertopsView');
// EZD-416: the countertop left panel and status readouts, from the same module.
const LazyCountertopsPanel = lazyPart(countertopsModule, 'CountertopsPanel');
const LazyCountertopsStatus = lazyPart(countertopsModule, 'CountertopsStatus');
// EZD-418: the countertop inspector place (footer Top schedule), from the same module.
const LazyCountertopsInspector = lazyPart(countertopsModule, 'CountertopsInspector');

type Store = EditorSession['store'];

// A new model session starts with no top selected: one selection per model store.
const selections = new WeakMap<Store, CountertopSelectionStore>();
function selectionOf(store: Store): CountertopSelectionStore {
  let s = selections.get(store);
  if (s === undefined) {
    s = createCountertopSelectionStore();
    selections.set(store, s);
  }
  return s;
}

type PartProps = { ctx: EditorFeatureContext; store: Store };

// EZD-412, EZD-416, EZD-414: the Defaults the countertop screen, panel and inspector read (per project): Trace's and
// the presets' overhangs, the countertop increment and the support check (EZD-415), in one read.
const useCountertopDefaults = (ctx: EditorFeatureContext) =>
  useDefault(ctx.defaults, editorDefaults.countertopDefaults);

function CountertopsOverlay({ ctx, store }: PartProps): ReactNode {
  const defaults = useCountertopDefaults(ctx);
  return (
    <LazyCountertops
      store={store}
      floors={ctx.floors}
      canEdit={ctx.mayEdit}
      newId={newObjectId}
      defaults={defaults}
      selection={selectionOf(store)}
    />
  );
}

function CountertopsPanelPart({ ctx, store }: PartProps): ReactNode {
  const defaults = useCountertopDefaults(ctx);
  return (
    <LazyCountertopsPanel
      store={store}
      floors={ctx.floors}
      canEdit={ctx.mayEdit}
      selection={selectionOf(store)}
      defaults={defaults}
      canManageDefaults={ctx.canManageDefaults}
    />
  );
}

function CountertopsInspectorPart({ ctx, store }: PartProps): ReactNode {
  const defaults = useCountertopDefaults(ctx);
  return (
    <LazyCountertopsInspector
      store={store}
      floors={ctx.floors}
      selection={selectionOf(store)}
      canEdit={ctx.mayEdit}
      defaults={defaults}
      canManageDefaults={ctx.canManageDefaults}
    />
  );
}

function CountertopsStatusPart({ ctx, store }: PartProps): ReactNode {
  const defaults = useCountertopDefaults(ctx);
  return <LazyCountertopsStatus store={store} floors={ctx.floors} defaults={defaults} />;
}

export const feature: EditorFeature = {
  id: 'countertops',
  order: 200,
  active: (ctx) => ctx.tool === 'countertops',
  coversPlan: true,
  overlay: (ctx) => (ctx.store === null ? null : <CountertopsOverlay ctx={ctx} store={ctx.store} />),
  leftPanel: (ctx) => (ctx.store === null ? null : <CountertopsPanelPart ctx={ctx} store={ctx.store} />),
  inspector: (ctx) =>
    ctx.store === null ? null : <CountertopsInspectorPart ctx={ctx} store={ctx.store} />,
  statusStart: (ctx) =>
    ctx.store === null ? null : <CountertopsStatusPart ctx={ctx} store={ctx.store} />,
  // Leaving the Countertops tool drops its selection.
  leave: (ctx) => {
    if (ctx.store !== null) selections.get(ctx.store)?.getState().select(null);
  },
};
