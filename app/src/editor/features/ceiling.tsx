// EZD-1913b (editor plan 5.3 "features plug in"; S05 Layout): the Ceiling surface as a registry feature, moved
// unchanged out of ProjectEditor. On for every viewer of a ready plan (the segment shows on Floor too):
// - EZD-502 (S05 Entry points "left panel segment Ceiling or Both"; AC-EZD-502-1): the Floor / Ceiling / Both segment
//   in the left panel; Ceiling and Both draw through the lazy RCP module, and a switch away from Floor ends any
//   standard tool (a feature's screen too); the Ceiling view swallows the company's floor tool keys (EZD-222);
// - EZD-503, EZD-508, EZD-509, EZD-510 (S05 Controls): on Ceiling or Both the left panel's Room ceiling, Lighting
//   (with Auto-layout cans and Switching zones) and Fixture schedule sections;
// - EZD-508, EZD-511, EZD-514 (S05 Layout "legend chip bottom left", "Status bar adds View, Scale and Joists status"):
//   the legend with the selected ACT grid's border sizes, and the View and Joists status items;
// - EZD-505, EZD-507, EZD-513: the beam spacing pill, the device kind chooser and the Soffit, tray, coffer card;
// - EZD-505 to EZD-514, EZD-602: every ceiling tool's click receiver, and the electrical device toolbar's on the floor
//   plan, on one tool route (EZD-1914 moves the receivers into ceiling/tools);
// - EZD-514, EZD-515, EZD-511: the selection inspector's Framing known section, fan clearance and ACT border.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_BINDINGS } from '../../lib/defaults/shortcut-keys';
import { lazyModule } from '../../lib/lazy/lazy-module';
import type { MessageKey } from '../../server/messages/catalog';
import { useCeilingKeys } from '../ceiling/CeilingParts';
import { rcpModule } from '../ceiling/rcp-module';
import type { PlanSurface, SurfaceSetting } from '../ceiling/surface';
import { chosenFloor } from '../floors/floors';
import type { PlanPointerReceiver } from '../plan/input';
import type { FeaturePage } from '../shared/feature-page';
import { lazyPart } from '../shared/lazy-part';
import { editorDefaults, useDefault } from '../shared/use-default';
import { useStoreValue } from '../shared/use-store-value';
import {
  CEILING_DEVICE_TOOL_IDS,
  isDeviceTool,
  wireCeilingTools,
  type DeviceChoice,
} from '../tools/ceiling-device-tool';
import { newObjectId } from '../tools/model-changes';
import type { EditorFeature, EditorFeatureContext, FeatureReady } from './types';

type Rcp = NonNullable<ReturnType<typeof rcpModule.peek>>;

/** What the Ceiling feature's page hook keeps for its slots. */
type CeilingOwn = {
  readonly shown: PlanSurface;
  readonly rcp: Rcp | undefined;
  readonly fanClearance: number | null;
  readonly actMinShare: number;
  readonly autoLayout: ReturnType<typeof editorDefaults.autoLayout>;
  readonly readScan:
    (() => ReturnType<typeof import('../ceiling/scan').readScanCeiling>) | undefined;
};

// EZD-1401 (11 Budgets; EZD-120c B11): the beam spacing pill loads when the Ceiling or Both view first shows.
const beamSpacingModule = lazyModule(() => import('../../lazy/beam-spacing'));

// EZD-507 (11 Budgets; EZD-1401 precedent): the ceiling device tools' placement and kind chooser load when a device
// tool is first turned on.
const ceilingDeviceModule = lazyModule(() => import('../../lazy/rcp'));

const LazyDeviceChooser = lazyPart(ceilingDeviceModule, 'DeviceChooser');
const LazyBeamSpacingPill = lazyPart(beamSpacingModule, 'BeamSpacingPill');

// EZD-507: the kind chooser of the ceiling device tool that is on.
function CeilingDeviceChooser({
  surface,
  choice,
}: {
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>;
  choice: DeviceChoice;
}) {
  const tool = useStoreValue(surface, (s) => s.get().tool, null);
  const kind = useStoreValue(choice, (c) => (isDeviceTool(tool) ? c.get(tool) : null), null);
  if (!isDeviceTool(tool) || kind === null) return null;
  return <LazyDeviceChooser tool={tool} kind={kind} onChoose={(k) => choice.set(tool, k)} />;
}

function useCeilingPage(ctx: EditorFeatureContext): CeilingOwn {
  const page = ctx.page ?? null;
  const surface = page?.surface ?? null;
  const ready = ctx.ready ?? null;
  const plan = ready?.controllers.plan ?? null;
  const selection = ready?.controllers.selection ?? null;
  const toolRoute = ready?.controllers.toolRoute ?? null;
  const routedStore = ready?.controllers.routed ?? null;
  const phase = ready?.controllers.phase ?? null;
  const bindings = ready?.bindings;
  const meshUrl = ready?.meshUrl ?? null;
  const onMessage = ready?.onMessage;
  const { floors, mayEdit } = ctx;
  const shown = useStoreValue(surface, (s) => s.get().surface, 'floor');

  // EZD-515 (S05 Validation; S05 Decision 4): the Defaults "Fan blade clearance" for the RCP and the inspector, re-read
  // on every defaults resync; null while Not set (no fan check).
  const fanClearance = useDefault(ctx.defaults, editorDefaults.fanClearance);
  // EZD-511 (S05 Validation "Minimum border is a company setting under Defaults"): the Defaults "ACT minimum border"
  // as a share of the tile, for the RCP, the inspector, the legend and the tools; half a tile while not read.
  const actMinShare = useDefault(ctx.defaults, editorDefaults.actMinShare);
  const actMinShareRef = useRef(actMinShare);
  // EZD-509: the light target per room type, CU and LLF for Auto-layout cans.
  const autoLayout = useDefault(ctx.defaults, editorDefaults.autoLayout);
  useEffect(() => {
    actMinShareRef.current = actMinShare;
  }, [actMinShare]);
  const messageRef = useRef(onMessage);
  useEffect(() => {
    messageRef.current = onMessage;
  });

  // EZD-508: the RCP module also holds the ceiling legend, status items and fixture schedule (11 Budgets).
  const [rcp, setRcp] = useState(rcpModule.peek);
  useEffect(() => {
    if (plan === null) return;
    if (shown === 'floor') {
      plan.setSurface('floor', null);
      return;
    }
    selection?.selectTool();
    let live = true;
    rcpModule.load().then(
      (m) => {
        if (!live) return;
        setRcp(m);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [plan, selection, shown]);
  // EZD-515: the RCP draws through a builder holding the Defaults fan clearance; a new clearance makes a new builder,
  // so the canvas redraws its flags without ending the tool.
  useEffect(() => {
    if (plan === null || surface === null || shown === 'floor' || !rcp) return;
    // EZD-510 (11 Budgets): the RCP module shows the view and redraws it as a zone is drawn.
    // EZD-511: and the ACT minimum border the grids balance to.
    return rcp.showRcp(plan, shown, surface, { fanClearance, actMinShare });
  }, [plan, shown, rcp, fanClearance, actMinShare, surface]);
  // EZD-503: Read heights from scan reads the page's GLB link through EZD-303's reader, loaded on the first press.
  const readScan = useMemo(
    () =>
      meshUrl === null
        ? undefined
        : () => import('../ceiling/scan').then((m) => m.readScanCeiling(meshUrl)),
    [meshUrl],
  );
  const ceilingSelect = useCallback(() => selection?.selectTool(), [selection]);
  // EZD-222: the Ceiling view swallows the company's floor tool keys.
  const ceilingKeys = useCallback(() => bindings ?? DEFAULT_BINDINGS, [bindings]);
  useCeilingKeys(surface, ceilingSelect, ceilingKeys);

  const deviceChoice = page?.deviceChoice ?? null;
  const deviceSlot = page?.deviceSlot ?? null;
  useEffect(() => {
    if (
      surface === null ||
      deviceChoice === null ||
      deviceSlot === null ||
      toolRoute === null ||
      routedStore === null ||
      selection === null ||
      phase === null
    )
      return;
    // EZD-222 (11 Budgets; EZD-1401 precedent): the placement code comes with the Ceiling view's lazy module, which
    // loads when that view first shows; a click before it arrives is placed once it has.
    let live = true;
    // What every ceiling tool is given (EZD-510: held once, 11 Budgets).
    const base = {
      store: routedStore,
      chosenFloor: () => chosenFloor(floors),
      newStatus: () => phase.newObjectStatus(),
      newId: newObjectId,
      select: (ids: readonly string[]) => selection.select(ids),
      onMessage: (key: MessageKey) => messageRef.current?.(key),
    };
    // One receiver shape for every lazily placed ceiling tool: placed at once when the module is in; before that a
    // click loads it and is placed once it has.
    const lazily =
      <M,>(
        module: { peek(): M | undefined; load(): Promise<M> },
        make: (mod: M) => PlanPointerReceiver,
      ): PlanPointerReceiver =>
      (e) => {
        const mod = module.peek();
        if (mod) return make(mod)(e);
        if (e.kind !== 'click') return;
        module.load().then(
          (m) => {
            if (live) make(m)(e);
          },
          () => {},
        );
      };
    const receivers: Partial<Record<string, PlanPointerReceiver>> = {
      beam: lazily(beamSpacingModule, (m) => m.beamReceiver(base)),
    };
    // EZD-507: each ceiling device tool places through the lazy RCP module the same way.
    for (const tool of CEILING_DEVICE_TOOL_IDS)
      receivers[tool] = lazily(ceilingDeviceModule, (m) =>
        // EZD-511: a light clicked in an ACT room snaps into a tile.
        m.deviceReceiver({
          ...base,
          tool,
          choice: deviceChoice,
          actMinShare: () => actMinShareRef.current,
        }),
      );
    // EZD-510: the Switching zones tool, turned on from the left panel's Lighting section (shown once the RCP
    // module is in); the tool and its placement come with that module.
    if (rcp) receivers['switch-zone'] = rcp.zoneReceiver(surface, base);
    // EZD-514: the framing line tool, turned on from the inspector's Framing known section.
    if (rcp) receivers['framing-line'] = rcp.framingReceiver(surface, base);
    // EZD-513: the Soffit, tray, coffer and Height and material tag tools, from the same module.
    if (rcp) {
      receivers.soffit = rcp.shapeReceiver(surface, base);
      receivers.tag = rcp.tagReceiver(base);
      // EZD-511: the Acoustical grid tool, from the same module.
      receivers['act-grid'] = rcp.actReceiver({ ...base, minShare: () => actMinShareRef.current });
    }
    // One wire for every ceiling tool, so one tool turning off never clears another's receiver. EZD-602: and, on
    // the floor plan, the electrical device toolbar's armed item.
    deviceSlot.setState({ base });
    const off = wireCeilingTools(surface, toolRoute, receivers, mayEdit, deviceSlot);
    return () => {
      live = false;
      off();
    };
  }, [
    toolRoute,
    routedStore,
    selection,
    phase,
    floors,
    surface,
    mayEdit,
    deviceChoice,
    rcp,
    deviceSlot,
  ]);

  return { shown, rcp, fanClearance, actMinShare, autoLayout, readScan };
}

type Parts = { ctx: EditorFeatureContext; ready: FeatureReady; page: FeaturePage; own: CeilingOwn };

/** The page, the open session and the page hook's state, or null while the editor is not ready. */
function partsOf(ctx: EditorFeatureContext): Parts | null {
  const own = ctx.own?.get('ceiling') as CeilingOwn | undefined;
  if (ctx.ready === undefined || ctx.page === undefined || own === undefined) return null;
  return { ctx, ready: ctx.ready, page: ctx.page, own };
}

// EZD-503, EZD-508 to EZD-510: the left panel's sections on Ceiling or Both.
function ceilingSections({ ctx, ready, page, own }: Parts, rcp: Rcp): ReactNode {
  const { session } = ready;
  const { selection, routed, phase } = ready.controllers;
  const { readScan } = own;
  return (
    <>
      <rcp.RoomCeiling
        store={session.store}
        selection={selection}
        floors={ctx.floors}
        canEdit={ctx.mayEdit}
        {...(readScan === undefined ? {} : { readScan })}
      />
      <rcp.Lighting
        surface={page.surface}
        canEdit={ctx.mayEdit}
        // EZD-509: Auto-layout cans, above Switching zones; it places through the routed store like the tools.
        autoLayout={
          <rcp.AutoLayout
            store={routed}
            selection={selection}
            floors={ctx.floors}
            surface={page.surface}
            canEdit={ctx.mayEdit}
            defaults={own.autoLayout}
            newId={newObjectId}
            newStatus={() => phase.newObjectStatus()}
            actMinShare={own.actMinShare}
          />
        }
      />
      <rcp.FixtureSchedule
        store={session.store}
        floors={ctx.floors}
        onPick={(ids) => selection.select(ids)}
      />
    </>
  );
}

// The legend, the device kind chooser, the Soffit, tray, coffer card and the beam spacing pill, on Ceiling or Both.
function planLayer({ ctx, ready, page, own }: Parts): ReactNode {
  if (own.shown === 'floor') return null;
  const { rcp } = own;
  const { session } = ready;
  const { selection, routed, plan } = ready.controllers;
  return (
    <>
      {rcp === undefined ? null : (
        // EZD-511: with the selected ACT grid's border sizes.
        <rcp.CeilingLegend>
          <rcp.ActLegend store={session.store} selection={selection} minShare={own.actMinShare} />
        </rcp.CeilingLegend>
      )}
      {ctx.mayEdit ? (
        <CeilingDeviceChooser surface={page.surface} choice={page.deviceChoice} />
      ) : null}
      {ctx.mayEdit && rcp !== undefined ? (
        // EZD-513: the Soffit, tray, coffer card, shown while that tool is on.
        <rcp.ShapeChooser surface={page.surface} />
      ) : null}
      <LazyBeamSpacingPill
        store={routed}
        selection={selection}
        handle={plan.handle}
        canEdit={ctx.mayEdit}
      />
    </>
  );
}

export const feature: EditorFeature = {
  id: 'ceiling',
  order: 300,
  active: (ctx) => partsOf(ctx) !== null,
  usePage: useCeilingPage,
  leftPanelProps: (ctx) => {
    const p = partsOf(ctx);
    if (p === null) return {};
    const { rcp } = p.own;
    return {
      surface: p.page.surface,
      ceiling: rcp === undefined ? undefined : ceilingSections(p, rcp),
    };
  },
  planLayer: (ctx) => {
    const p = partsOf(ctx);
    return p === null ? null : planLayer(p);
  },
  statusStartItems: [
    {
      order: 300,
      part: (ctx) => {
        const rcp = partsOf(ctx)?.own;
        return rcp === undefined || rcp.shown === 'floor' || rcp.rcp === undefined ? null : (
          <rcp.rcp.CeilingViewStatus />
        );
      },
    },
    {
      order: 600,
      part: (ctx) => {
        const p = partsOf(ctx);
        const rcp = p?.own.rcp;
        if (p === null || p.own.shown === 'floor' || rcp === undefined) return null;
        // EZD-514: the text follows the active room's Framing known choice.
        return (
          <rcp.JoistsStatus
            store={p.ready.session.store}
            selection={p.ready.controllers.selection}
            floors={ctx.floors}
          />
        );
      },
    },
  ],
  inspectorProps: (ctx) => {
    const p = partsOf(ctx);
    if (p === null) return {};
    const { shown, rcp, fanClearance, actMinShare } = p.own;
    return {
      fanClearance,
      actMinShare,
      surface: p.page.surface,
      framingDrawing: shown === 'floor' || !rcp ? undefined : rcp.framingDrawingFor(p.page.surface),
    };
  },
};
