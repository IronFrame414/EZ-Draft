// EZD-1913a (editor plan 2.4, 2.5, 5.3): what fills each editor slot, and in what order. ProjectEditor builds its own
// parts and asks these functions which one shows; the registry features (features/index.generated.ts) fill their
// slots here. The order is the one ProjectEditor had before the features moved out (features/slots.test.tsx pins it):
// - left panel: 3D none > Sheets panel > the first active feature's panel > Layers / Rooms / Versions;
// - inspector place: an open Assistant > (3D or Sheets: none) > the version inspector > the first active feature's
//   inspector > the Fixtures panel (EZD-1985) > the selection inspector with More;
// - status bar: Sheets' own items, or the plan's items with the active features' items placed by `order` between
//   the fixed ones (STATUS_START_ORDER, STATUS_END_ORDER).
// EZD-1913b: Ceiling and Electrical moved into features/ too. Their places: the plan layer (under the plan's own
// layers), the state column's last row, the left panel's props (segment, ceiling and electrical sections), the
// selection inspector's props, and status items at the ceiling view (300), electrical (400) and joists (600) places.
// Each listed feature's `usePage` runs on every render (useFeaturePages).
// EZD-1913c: Versions, Sheets, 3D, the Assistant, conflicts, the edit lock, Send, Upload and Help moved into features/
// too. ProjectEditor now asks these functions for the screen (a feature's screen that shows covers the plan), the
// header tabs, and the places their parts take: the slot functions above with the feature parts in the places
// ProjectEditor gave them (editorInspector, editorLeftPanel, editorStatusStart, editorStatusEnd), the header, the
// state column (STATE_ORDER) and the canvas's end (CANVAS_END_ORDER). Each listed feature's `useOwn` runs first
// (useFeatureOwn), then `mayEdit` is worked out (editsAllowed), then the page hooks.
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import type { EditorView } from '../../components/shell/editor-views';
import type { MessageKey } from '../../server/messages/catalog';
import type { DevHookParts } from '../dev-hooks';
import type {
  EditorFeature,
  EditorFeatureContext,
  FeatureDevParts,
  FeatureHeaderProps,
  FeatureInspectorProps,
  FeatureItem,
  FeatureLeftPanelProps,
  FeatureRailProps,
} from '../features/types';

/** Which screen the editor shows: the 3D view, the Sheets screen, or the plan canvas (up and not failed). */
export type EditorScreen = {
  readonly show3d: boolean;
  readonly showSheets: boolean;
  readonly showPlan: boolean;
};

/** A part ProjectEditor can show now, or null when it cannot (its inputs are not there). */
export type Part = (() => ReactNode) | null;

type FeatureSlot =
  | 'leftPanel'
  | 'inspector'
  | 'overlay'
  | 'statusStart'
  | 'statusEnd'
  | 'header'
  | 'planLayer'
  | 'stateRow'
  | 'inspectorTop'
  | 'inspectorOver'
  | 'headerSubtitle'
  | 'headerEnd'
  | 'saveBanner';

/** The features on now, lower `order` first. */
export function activeFeatures(
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): readonly EditorFeature[] {
  return list.filter((f) => f.active(ctx)).sort((a, b) => a.order - b.order);
}

const filled = (n: ReactNode): boolean => n !== null && n !== undefined && n !== false;

/** The first active feature's fill of a slot, or null when none fills it. */
export function featureSlot(
  active: readonly EditorFeature[],
  slot: FeatureSlot,
  ctx: EditorFeatureContext,
): ReactNode {
  for (const f of active) {
    const n = f[slot]?.(ctx);
    if (filled(n)) return n;
  }
  return null;
}

/** Every active feature's fill of a slot, in order (the overlay slot: each feature draws its own). */
export function featureParts(
  active: readonly EditorFeature[],
  slot: FeatureSlot,
  ctx: EditorFeatureContext,
): ReactNode[] {
  const out: ReactNode[] = [];
  for (const f of active) {
    const n = f[slot]?.(ctx);
    if (filled(n)) out.push(<Fragment key={f.id}>{n}</Fragment>);
  }
  return out;
}

/**
 * EZD-1913b: runs each listed feature's `usePage`, in list order, and returns what each gave, by feature id. `list` is
 * the generated feature list, which never changes while the page lives, so the hooks keep their order.
 */
export function useFeaturePages(
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): ReadonlyMap<string, unknown> {
  const own = new Map<string, unknown>();
  for (const f of list) if (f.usePage !== undefined) own.set(f.id, f.usePage(ctx));
  return own;
}

/** EZD-1913b: the props the active features give a panel; where two give the same prop, the lower order's stands. */
export function featureProps<K extends 'leftPanelProps' | 'inspectorProps'>(
  active: readonly EditorFeature[],
  slot: K,
  ctx: EditorFeatureContext,
): K extends 'leftPanelProps' ? FeatureLeftPanelProps : FeatureInspectorProps {
  const out: Record<string, unknown> = {};
  for (const f of active) {
    const props = (f[slot] as ((c: EditorFeatureContext) => object) | undefined)?.(ctx) ?? {};
    for (const [k, v] of Object.entries(props))
      if (out[k] === undefined && v !== undefined) out[k] = v;
  }
  return out as K extends 'leftPanelProps' ? FeatureLeftPanelProps : FeatureInspectorProps;
}

/** True while an active feature's screen covers the plan (the plan's edit keys and zoom are off, EZD-404). */
export const coversPlan = (active: readonly EditorFeature[]): boolean =>
  active.some((f) => f.coversPlan === true);

/** The rail wrapper's extra classes from the active features. */
export const railClasses = (active: readonly EditorFeature[]): string[] =>
  active.flatMap((f) => (f.railClass === undefined ? [] : [f.railClass]));

/** Calls `leave` on each feature that was on after the last render and is not now. */
export function useFeatureLeave(active: readonly EditorFeature[], ctx: EditorFeatureContext): void {
  const was = useRef<readonly EditorFeature[]>([]);
  useEffect(() => {
    for (const f of was.current) if (!active.includes(f)) f.leave?.(ctx);
    was.current = active;
  });
}

export function leftPanelSlot(
  screen: EditorScreen,
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  parts: { sheets: Part; layers: Part },
): ReactNode {
  if (screen.show3d) return null;
  if (screen.showSheets) return parts.sheets?.() ?? null;
  if (!screen.showPlan) return null;
  const fill = featureSlot(active, 'leftPanel', ctx);
  if (filled(fill)) return fill;
  return parts.layers?.() ?? null;
}

export type InspectorPlace = { part: ReactNode; label: MessageKey | undefined };

export function inspectorSlot(
  screen: EditorScreen,
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  parts: { assistant: Part; version: Part; fixtures: Part; selection: Part },
): InspectorPlace {
  // EZD-5603a: an open Assistant takes the inspector place on every screen.
  if (parts.assistant !== null) return { part: parts.assistant(), label: 'office.assistant.title' };
  const part = inspectorPart(screen, active, ctx, parts);
  return filled(part)
    ? { part, label: 'office.shell.inspector' }
    : { part: null, label: undefined };
}

function inspectorPart(
  screen: EditorScreen,
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  parts: { version: Part; fixtures: Part; selection: Part },
): ReactNode {
  if (screen.show3d || screen.showSheets || !screen.showPlan) return null;
  if (parts.version !== null) return parts.version();
  const fill = featureSlot(active, 'inspector', ctx);
  if (filled(fill)) return fill;
  if (parts.fixtures !== null) return parts.fixtures();
  return parts.selection?.() ?? null;
}

/**
 * Where the plan's own status start items sit; a feature's item sits by its `order` among them. EZD-1913b: the
 * Ceiling and Electrical features fill the ceilingView, electrical and joists places (features/ceiling.tsx,
 * features/electrical.tsx); ProjectEditor passes none of those three.
 */
export const STATUS_START_ORDER = {
  floorSwitcher: 0,
  ceilingView: 300,
  electrical: 400,
  planStart: 500,
  joists: 600,
  lock: 700,
  versions: 800,
} as const;

/** Where the plan's own status end item sits. */
export const STATUS_END_ORDER = { planEnd: 500 } as const;

type Placed = { order: number; key: string; part: Part };

function placed(
  fixed: Readonly<Record<string, number>>,
  parts: Readonly<Record<string, Part>>,
  active: readonly EditorFeature[],
  slot: 'statusStart' | 'statusEnd',
  ctx: EditorFeatureContext,
): ReactNode {
  const items: Placed[] = Object.entries(fixed).map(([key, order]) => ({
    order,
    key,
    part: parts[key] ?? null,
  }));
  for (const f of active) {
    const fill = f[slot];
    if (fill !== undefined)
      items.push({ order: f.order, key: `feature:${f.id}`, part: () => fill(ctx) });
    if (slot === 'statusStart')
      (f.statusStartItems ?? []).forEach((item, i) =>
        items.push({ order: item.order, key: `feature:${f.id}:${i}`, part: () => item.part(ctx) }),
      );
  }
  // Stable: a fixed item comes before a feature of the same order.
  items.sort((a, b) => a.order - b.order);
  return (
    <>
      {items.map((i) => {
        const n = i.part?.();
        return filled(n) ? <Fragment key={i.key}>{n}</Fragment> : null;
      })}
    </>
  );
}

// EZD-1913c: the lock (700) and versions (800) places are filled by features/lock.tsx and features/versions.tsx.
type FeatureFilled = 'ceilingView' | 'electrical' | 'joists' | 'lock' | 'versions';

export type StatusStartParts = {
  [K in Exclude<keyof typeof STATUS_START_ORDER, FeatureFilled>]: Part;
} & { [K in FeatureFilled]?: Part };

/** The status bar's start: Sheets' items, or the plan's items once its scale and phase are read; else nothing. */
export function statusStartSlot(
  screen: EditorScreen,
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  parts: { sheets: Part; planReady: boolean } & StatusStartParts,
): ReactNode {
  const { sheets, planReady, ...plan } = parts;
  if (screen.showSheets) return sheets?.() ?? null;
  if (screen.show3d || !screen.showPlan || !planReady) return undefined;
  return placed(STATUS_START_ORDER, plan, active, 'statusStart', ctx);
}

/** The status bar's end: Sheets' items, or the plan's end items (zoom readout) off 3D; else nothing. */
export function statusEndSlot(
  screen: EditorScreen,
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  parts: { sheets: Part; planEnd: Part },
): ReactNode {
  if (screen.showSheets) return parts.sheets?.() ?? null;
  if (screen.show3d || !screen.showPlan) return undefined;
  return placed(STATUS_END_ORDER, { planEnd: parts.planEnd }, active, 'statusEnd', ctx);
}

// ---- EZD-1913c ----

/** The view on screen: the first listed feature's screen that shows, else Plan. */
export function shownView(list: readonly EditorFeature[], ctx: EditorFeatureContext): EditorView {
  return list.find((f) => f.screen?.shows(ctx) === true)?.screen?.view ?? 'plan';
}

/** The feature whose screen shows now, if one does. */
const screenFeature = (
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): EditorFeature | undefined =>
  list.find((f) => f.screen !== undefined && f.screen.view === ctx.shownView);

/** Which screen shows (`ctx.shownView`), as the slot functions above read it. */
export function editorScreen(ctx: EditorFeatureContext): EditorScreen {
  return {
    show3d: ctx.shownView === '3d',
    showSheets: ctx.shownView === 'sheets',
    showPlan: ctx.planUp === true,
  };
}

/** True while the plan's own parts show: the plan is up and no feature's screen covers it. */
export const planOnly = (ctx: EditorFeatureContext): boolean =>
  ctx.planUp === true && (ctx.shownView ?? 'plan') === 'plan';

/** The header tabs: Plan, then each listed feature's tab that is available, in feature order. */
export function editorViews(
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): EditorView[] {
  return [
    'plan',
    ...list.flatMap((f) =>
      f.screen !== undefined && (f.screen.available?.(ctx) ?? true) ? [f.screen.view] : [],
    ),
  ];
}

/** A tab a press may choose: Plan or a listed feature's. */
export const knownView = (list: readonly EditorFeature[], v: EditorView): boolean =>
  v === 'plan' || list.some((f) => f.screen?.view === v);

/** True while the feature whose screen shows hides the plan canvas (it stays mounted). */
export const planHidden = (list: readonly EditorFeature[], ctx: EditorFeatureContext): boolean =>
  screenFeature(list, ctx)?.screen?.hidesPlan === true;

/** The showing screen's fill of one of its slots, or null. */
export function screenPart(
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  slot: 'screenCanvas' | 'screenLeftPanel' | 'screenStatusStart' | 'screenStatusEnd',
): ReactNode {
  return screenFeature(list, ctx)?.[slot]?.(ctx) ?? null;
}

/** Runs each listed feature's `useOwn`, in list order, and returns what each gave, by feature id. */
export function useFeatureOwn(
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): ReadonlyMap<string, unknown> {
  const own = new Map<string, unknown>();
  for (const f of list) if (f.useOwn !== undefined) own.set(f.id, f.useOwn(ctx));
  return own;
}

/** `ctx.own` with more entries added (a feature's `usePage` after its `useOwn`). */
export function withOwn(
  ctx: EditorFeatureContext,
  more: ReadonlyMap<string, unknown>,
): EditorFeatureContext {
  return { ...ctx, own: new Map([...(ctx.own ?? []), ...more]) };
}

/** True when any listed feature's flag says so (on or not: each flag reads its own state). */
export function featureFlag(
  list: readonly EditorFeature[],
  flag: 'pausesEdits' | 'limitsTools' | 'quietsSaveBanners',
  ctx: EditorFeatureContext,
): boolean {
  return list.some((f) => f[flag]?.(ctx) === true);
}

/** May edit now: `holds` (Edit model with the edit hold at open) and no listed feature pauses edits. */
export const editsAllowed = (
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  holds: boolean,
): boolean => holds && !featureFlag(list, 'pausesEdits', ctx);

function merge<T extends object>(
  active: readonly EditorFeature[],
  pick: (f: EditorFeature) => ((c: EditorFeatureContext) => T) | undefined,
  ctx: EditorFeatureContext,
): T {
  const out: Record<string, unknown> = {};
  for (const f of active) {
    const props = pick(f)?.(ctx) ?? {};
    for (const [k, v] of Object.entries(props))
      if (out[k] === undefined && v !== undefined) out[k] = v;
  }
  return out as T;
}

/** The header props the active features give; the lower order's stands. */
export const headerProps = (
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): FeatureHeaderProps => merge(active, (f) => f.headerProps, ctx);

/** The rail props the active features give; the lower order's stands. */
export const railProps = (
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): FeatureRailProps => merge(active, (f) => f.railProps, ctx);

// EZD-2009: the dev hook's scene loaded check while no feature gives one (the same function on every render).
const NOT_LOADED = () => false;

/** What the listed features give the dev hooks, with the values dev-hooks.ts had without them. */
export function featureDevParts(
  list: readonly EditorFeature[],
  ctx: EditorFeatureContext,
): Pick<DevHookParts, 'scene3d' | 'show3d' | 'scene3dLoaded'> {
  const given = merge<FeatureDevParts>(list, (f) => f.devParts, ctx);
  return {
    scene3d: given.scene3d ?? null,
    show3d: given.show3d ?? false,
    scene3dLoaded: given.scene3dLoaded ?? NOT_LOADED,
  };
}

/** The first active feature's fill of a slot, as a part, or null. */
function partOf(
  active: readonly EditorFeature[],
  slot: FeatureSlot,
  ctx: EditorFeatureContext,
): Part {
  const n = featureSlot(active, slot, ctx);
  return filled(n) ? () => n : null;
}

/** The inspector place, with the features' parts where ProjectEditor gave them (inspectorSlot). */
export function editorInspector(
  screen: EditorScreen,
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  parts: { fixtures: Part; selection: Part },
): InspectorPlace {
  return inspectorSlot(screen, active, ctx, {
    assistant: partOf(active, 'inspectorTop', ctx),
    version: partOf(active, 'inspectorOver', ctx),
    ...parts,
  });
}

/** The left panel, with the showing screen's panel where ProjectEditor gave it (leftPanelSlot). */
export function editorLeftPanel(
  screen: EditorScreen,
  list: readonly EditorFeature[],
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  layers: Part,
): ReactNode {
  return leftPanelSlot(screen, active, ctx, {
    sheets: () => screenPart(list, ctx, 'screenLeftPanel'),
    layers,
  });
}

/** The status bar's start, with the showing screen's items where ProjectEditor gave them (statusStartSlot). */
export function editorStatusStart(
  screen: EditorScreen,
  list: readonly EditorFeature[],
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  parts: { planReady: boolean; floorSwitcher: Part; planStart: Part },
): ReactNode {
  return statusStartSlot(screen, active, ctx, {
    sheets: () => screenPart(list, ctx, 'screenStatusStart'),
    ...parts,
  });
}

/** The status bar's end, with the showing screen's items where ProjectEditor gave them (statusEndSlot). */
export function editorStatusEnd(
  screen: EditorScreen,
  list: readonly EditorFeature[],
  active: readonly EditorFeature[],
  ctx: EditorFeatureContext,
  planEnd: Part,
): ReactNode {
  return statusEndSlot(screen, active, ctx, {
    sheets: () => screenPart(list, ctx, 'screenStatusEnd'),
    planEnd,
  });
}

/**
 * The canvas state column's places (EZD-1913c, as ProjectEditor drew them): the tablet edit bar, the edit lock's banner
 * (200) and paused note (210), the offline and save banners, the canvas-failed error, then the plan's rows.
 */
export const STATE_ORDER = {
  editBar: 100,
  banners: 300,
  canvasFailed: 400,
  planRows: 500,
} as const;

/**
 * After the state column, on every screen (as ProjectEditor drew them): the conflict list (400), the code check
 * (plan only), the Help panel (600), the edit lock's toasts and prompts (700).
 */
export const CANVAS_END_ORDER = { check: 500 } as const;

/** Fixed parts and the active features' items of one list, by order (a fixed part first at the same order). */
export function featureItems(
  fixed: Readonly<Record<string, number>>,
  parts: Readonly<Record<string, Part>>,
  active: readonly EditorFeature[],
  slot: 'stateItems' | 'canvasItems',
  ctx: EditorFeatureContext,
): ReactNode {
  const items: Placed[] = Object.entries(fixed).map(([key, order]) => ({
    order,
    key,
    part: parts[key] ?? null,
  }));
  for (const f of active)
    (f[slot] ?? []).forEach((item: FeatureItem, i) =>
      items.push({ order: item.order, key: `feature:${f.id}:${i}`, part: () => item.part(ctx) }),
    );
  items.sort((a, b) => a.order - b.order);
  return (
    <>
      {items.map((i) => {
        const n = i.part?.();
        return filled(n) ? <Fragment key={i.key}>{n}</Fragment> : null;
      })}
    </>
  );
}
