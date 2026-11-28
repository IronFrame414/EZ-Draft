// EZD-1913b (editor plan 5.3 "features plug in"; S06 Layout): electrical mode as a registry feature, moved unchanged
// out of ProjectEditor. On while the Electrical tool is, on the floor plan (a switch to Ceiling or Both ends the tool):
// - EZD-601 (S06 Entry points "Left panel tabs Circuits / Devices / Panel once in electrical mode"): the electrical
//   panel takes the left panel's floor tabs' place; EZD-604 New circuit, rename and the circuit fields with Edit
//   model, paused while view only; EZD-606 the project the Existing panel dialog reads panel photos for;
// - EZD-601: the electrical status items, at the electrical place of the status bar;
// - EZD-602: the device toolbar with Edit model, paused (not hidden) in view only or while a version is open; over
//   the plan on a desktop, and (EZD-1979, audit F4) the last row of the state column under a coarse pointer, below
//   the edit bar and every banner, so it covers none of them.
import type { ReactNode } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { lazyPart } from '../shared/lazy-part';
import { useStoreValue } from '../shared/use-store-value';
import type { EditorFeature, EditorFeatureContext } from './types';

// EZD-601 (11 Budgets editor download size): electrical mode's panel and status items load when it is first on.
// EZD-1910: through the lazy facade, so the entry contents check (EZD-120c B11) covers them.
const electricalModule = lazyModule(() => import('../../lazy/electrical'));

const LazyElectricalPanel = lazyPart(electricalModule, 'ElectricalPanel');
const LazyDeviceTools = lazyPart(electricalModule, 'DeviceTools');
const LazyElectricalStatus = lazyPart(electricalModule, 'ElectricalStatus');

/** What the Electrical feature's page hook keeps: the plan's surface is Floor. */
type ElectricalOwn = { readonly floor: boolean };

function useElectricalPage(ctx: EditorFeatureContext): ElectricalOwn {
  const floor = useStoreValue(ctx.page?.surface, (s) => s.get().surface === 'floor', true);
  return { floor };
}

const on = (ctx: EditorFeatureContext): boolean =>
  ctx.tool === 'electrical' &&
  ctx.ready !== undefined &&
  (ctx.own?.get('electrical') as ElectricalOwn | undefined)?.floor === true;

// EZD-602: the device toolbar, with Edit model only.
function deviceTools(ctx: EditorFeatureContext): ReactNode {
  const ready = ctx.ready;
  const slot = ctx.page?.deviceSlot;
  if (ready === undefined || slot === undefined || !ready.canEditModel) return null;
  return (
    <LazyDeviceTools
      slot={slot}
      paused={!ctx.mayEdit}
      handle={ready.controllers.plan.handle}
      selection={ready.controllers.selection}
    />
  );
}

export const feature: EditorFeature = {
  id: 'electrical',
  order: 400,
  active: on,
  usePage: useElectricalPage,
  leftPanelProps: (ctx) => {
    const ready = ctx.ready;
    const slot = ctx.page?.deviceSlot;
    if (ready === undefined || slot === undefined) return {};
    const { selection, plan, layers } = ready.controllers;
    return {
      electrical: (
        <LazyElectricalPanel
          store={ready.session.store}
          selection={selection}
          showObject={plan.handle.showObject}
          layers={layers}
          floors={ctx.floors}
          // EZD-604: New circuit, rename and the circuit fields with Edit model, paused while view only.
          // EZD-606: the project the Existing panel dialog reads panel photos for.
          edit={
            ready.canEditModel
              ? { slot, paused: !ctx.mayEdit, projectId: ctx.projectId }
              : undefined
          }
        />
      ),
    };
  },
  statusStart: (ctx) =>
    ctx.ready === undefined ? null : <LazyElectricalStatus store={ctx.ready.session.store} />,
  planLayer: (ctx) => (ctx.ready?.coarse === false ? deviceTools(ctx) : null),
  stateRow: (ctx) => (ctx.ready?.coarse === true ? deviceTools(ctx) : null),
};
