// EZD-502 (S05 Entry points; S05 Layout "Tool rail is the ceiling rail"; S05 Controls "Floor / Ceiling / Both segment";
// S05 States "Locked / view-only"; board S05Ceiling rail; AC-EZD-502-1): which surface the plan shows, the
// Ceiling tool on the standard rail, and the ceiling rail. Pure: no React, no DOM. The surface is this page's
// view state (like the zoom), never model data. The ceiling tools only turn on here; what each one does arrives
// with its own ticket (EZD-503 to EZD-515; vault/build/assumptions.md EZD-502).
import type { RailEntry, RailTool } from '../../components/shell/rail-types';
import type { ToolKeyEvent } from '../tools/drawing-controller';
import { isTypingTarget } from '../typed-entry/typed-entry';
import { DEFAULT_BINDINGS, commandForKey, type ShortcutBindings } from '../../lib/defaults/shortcut-keys';

export const PLAN_SURFACES = ['floor', 'ceiling', 'both'] as const;
export type PlanSurface = (typeof PLAN_SURFACES)[number];

export type CeilingToolId =
  | 'ceiling-type'
  | 'beam'
  | 'recessed-light'
  | 'ceiling-fan'
  | 'act-grid'
  | 'hvac'
  | 'detector'
  | 'low-voltage'
  | 'access-panel'
  | 'soffit'
  | 'tag';

export type SurfaceState = { surface: PlanSurface; tool: CeilingToolId | null };

export type SurfaceSetting = {
  get(): SurfaceState;
  setSurface(surface: PlanSurface): void;
  setTool(tool: CeilingToolId | null): void;
  subscribe(listener: () => void): () => void;
};

export function createSurfaceSetting(surface: PlanSurface = 'floor'): SurfaceSetting {
  let state: SurfaceState = { surface, tool: null };
  const listeners = new Set<() => void>();
  const set = (next: SurfaceState) => {
    if (next.surface === state.surface && next.tool === state.tool) return;
    state = next;
    for (const l of [...listeners]) l();
  };
  return {
    get: () => state,
    // A surface change ends any ceiling tool; Floor has none.
    setSurface: (s) => set({ surface: s, tool: null }),
    setTool: (tool) => set({ ...state, tool: state.surface === 'floor' ? null : tool }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// S05 Entry points "the Ceiling tool (roofing icon) in the standard tool rail".
export const CEILING_RAIL_TOOL: RailTool = {
  kind: 'tool',
  id: 'ceiling',
  icon: 'roofing',
  label: 'office.tool.ceiling',
};

// S05 Layout, in its order; the separator after Select as on board S05Ceiling.
// Message keys use underscores where the tool ids use hyphens.
const tool = (id: CeilingToolId, icon: RailTool['icon']): RailTool => ({
  kind: 'tool',
  id,
  icon,
  label: `office.ceiling.tool.${id.replace(/-/g, '_') as CeilingKeyPart}`,
});
type CeilingKeyPart =
  | 'ceiling_type'
  | 'beam'
  | 'recessed_light'
  | 'ceiling_fan'
  | 'act_grid'
  | 'hvac'
  | 'detector'
  | 'low_voltage'
  | 'access_panel'
  | 'soffit'
  | 'tag';
export const CEILING_TOOLS: readonly RailTool[] = [
  tool('ceiling-type', 'roofing'),
  tool('beam', 'view_week'),
  tool('recessed-light', 'light'),
  tool('ceiling-fan', 'mode_fan'),
  tool('act-grid', 'grid_on'),
  tool('hvac', 'hvac'),
  tool('detector', 'detector_smoke'),
  tool('low-voltage', 'speaker'),
  tool('access-panel', 'crop_square'),
  tool('soffit', 'layers'),
  tool('tag', 'sell'),
];
export const CEILING_TOOL_IDS: readonly string[] = CEILING_TOOLS.map((t) => t.id);

export type CeilingRail = {
  top: RailEntry[];
  disabled: boolean;
  only?: string;
  paused?: readonly string[];
};

// The standard rail's spec decides the state: with Edit model and the lock every tool is on; with Edit model but not
// the lock the ceiling tools are paused (S06); without Edit model only Select is on (S05 States "Rail tools other
// than Select disabled"). `only` (Adjust) still holds.
export function ceilingRail(
  select: RailTool,
  standard: {
    tools: readonly RailTool[];
    disabled: boolean;
    only?: string;
    paused?: readonly string[];
  },
): CeilingRail {
  const top: RailEntry[] = [select, { kind: 'separator' }, ...CEILING_TOOLS];
  const mayDraw = standard.tools.some((t) => t.id === 'wall');
  if (!mayDraw) return { top, disabled: standard.disabled, only: 'select' };
  if (standard.paused !== undefined)
    return { top, disabled: standard.disabled, paused: CEILING_TOOL_IDS, only: standard.only };
  return { top, disabled: standard.disabled, only: standard.only };
}

// The standard tools' keys do nothing on the ceiling surfaces (their tools are not on the ceiling rail); Select, Help
// and the edit keys stay. Measure is not on the ceiling rail either.
// EZD-222 (S15d Keyboard shortcuts): the keys are the company's, so a rebound tool key is swallowed and its old
// letter is not.
const KEPT_COMMANDS: ReadonlySet<string> = new Set(['select', 'help', 'undo', 'redo', 'copy', 'paste']);
export function isFloorToolKey(e: ToolKeyEvent, bindings: ShortcutBindings = DEFAULT_BINDINGS): boolean {
  if (e.defaultPrevented || isTypingTarget(e.target)) return false;
  const command = commandForKey(bindings, e);
  return command !== null && !KEPT_COMMANDS.has(command);
}

/** EZD-222: whether the key is the company's Select key, which ends the ceiling tool as Esc does. */
export function isSelectKey(e: ToolKeyEvent, bindings: ShortcutBindings = DEFAULT_BINDINGS): boolean {
  return !e.defaultPrevented && !isTypingTarget(e.target) && commandForKey(bindings, e) === 'select';
}
