// EZD-1913a (editor plan 2.4, 2.5, 5.3): what fills each editor slot, and in what order. ProjectEditor builds its own
// parts and asks these functions which one shows; the registry features (features/index.generated.ts) fill their
// slots here. The order is the one ProjectEditor had before the features moved out (features/slots.test.tsx pins it):
// - left panel: 3D none > Sheets panel > the first active feature's panel > Layers / Rooms / Versions;
// - inspector place: an open Assistant > (3D or Sheets: none) > the version inspector > the first active feature's
//   inspector > the Fixtures panel (EZD-1985) > the selection inspector with More;
// - status bar: Sheets' own items, or the plan's items with the active features' items placed by `order` between
//   the fixed ones (STATUS_START_ORDER, STATUS_END_ORDER).
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import type { MessageKey } from '../../server/messages/catalog';
import type { EditorFeature, EditorFeatureContext } from '../features/types';

/** Which screen the editor shows: the 3D view, the Sheets screen, or the plan canvas (up and not failed). */
export type EditorScreen = {
  readonly show3d: boolean;
  readonly showSheets: boolean;
  readonly showPlan: boolean;
};

/** A part ProjectEditor can show now, or null when it cannot (its inputs are not there). */
export type Part = (() => ReactNode) | null;

type FeatureSlot = 'leftPanel' | 'inspector' | 'overlay' | 'statusStart' | 'statusEnd' | 'header';

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
  return filled(part) ? { part, label: 'office.shell.inspector' } : { part: null, label: undefined };
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

/** Where the plan's own status start items sit; a feature's item sits by its `order` among them. */
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
    if (fill !== undefined) items.push({ order: f.order, key: `feature:${f.id}`, part: () => fill(ctx) });
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

export type StatusStartParts = { [K in keyof typeof STATUS_START_ORDER]: Part };

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
