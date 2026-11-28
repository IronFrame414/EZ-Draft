'use client';
// The drawing rail (EZD-1918, split from DrawingTools.tsx; editor plan 5.1; S03 Controls rail). The code is moved
// unchanged: the tool order, the user's order, the Ceiling tool and its key, and the disabled, paused and
// select-only states are as before.
// EZD-210b (vault/plans/EZD-210b.md Decided "DrawingRail"): the rail reads the controller's ui.
// EZD-208b Build step 6 (vault/plans/EZD-208b.md section 3 C4; DB1, DB2): the rail takes `editorRail`'s tools with
// Select first and on by default.
// EZD-5603a Build step 11 (vault/plans/EZD-5603a.md Decided "Rail button"): the Assistant toggle in the bottom group.
// EZD-225 (S06:48; Q-0697 decisions 05): the rail's paused tools for a viewer with Edit model but not the lock.
// EZD-502 (S05 Entry points; S05 Layout; AC-EZD-502-1): the Ceiling tool ends the standard rail's top group for every
// viewer and switches to Ceiling; on Ceiling or Both the rail is the ceiling rail, whose tool is the surface's own.
import { useEffect } from 'react';
import { orderRailTools, type RailTool } from '../../components/shell/rail-types';
import { commandForKey, type ShortcutBindings } from '../../lib/defaults/shortcut-keys';
import { railToolsWithKeys } from '../help/rail-keys';
import { isTypingTarget } from '../typed-entry/typed-entry';
import { ToolRail } from '../../components/shell/ToolRail';
import { ASSISTANT_RAIL_TOOL } from '../assistant/assistant-ui';
import {
  CEILING_RAIL_TOOL,
  ceilingRail,
  type CeilingToolId,
  type SurfaceSetting,
} from '../ceiling/surface';
import type { SelectionController } from '../selection/selection-controller';
import type { DrawingController, DrawingUi } from './drawing-controller';
import type { DrawingToolId } from './tool-defs';
import { useStoreValue } from '../shared/use-store-value';

export type DrawingRailProps = {
  drawing: DrawingController | null;
  selection: SelectionController | null;
  rail: {
    tools: readonly RailTool[];
    disabled: boolean;
    only?: string;
    paused?: readonly string[];
  };
  assistant?: { open: boolean; onToggle: () => void } | null;
  // EZD-502: the plan's surface; without it there is no Ceiling tool.
  surface?: SurfaceSetting | null;
  // EZD-222: the Help button and its key; without it there is no Help button.
  help?: { shortcut: string | undefined; onOpen: () => void } | null;
  // EZD-612: the code Check button (Run code check) and its key; without it there is no Check button.
  check?: { shortcut: string | undefined; onRun: () => void } | null;
  // EZD-230: the company key map (the Ceiling tool's key and tooltip), and the user's tool order with its change.
  bindings?: ShortcutBindings;
  order?: readonly string[];
  onReorder?: (ids: string[]) => void;
};

// EZD-222 (04 Tool rail "Help | ? | Shortcuts and help | Every editor tab"; S03 Help "Rail, bottom"; board S03Plan):
// the last button at the bottom of the rail; its key is the company's.
export function helpRailTool(shortcut: string | undefined): RailTool {
  return { kind: 'tool', id: 'help', icon: 'help', label: 'office.tool.help', shortcut };
}

// EZD-612 (04 Tool rail "Check | Shift+C | Every editor tab", "on the rail of every editor tab, above Help"; board
// S03Plan "Check code (run)", icon `rule`): runs the code check and opens the list.
export function checkRailTool(shortcut: string | undefined): RailTool {
  return { kind: 'tool', id: 'check', icon: 'rule', label: 'office.tool.check', shortcut };
}

export function DrawingRail({
  drawing,
  selection,
  rail,
  assistant,
  surface,
  help,
  check,
  bindings,
  order,
  onReorder,
}: DrawingRailProps) {
  const ui = useStoreValue<DrawingController, DrawingUi | null>(drawing, (d) => d.getUi(), null);
  const shown = useStoreValue(surface, (s) => s.get(), null);
  const bottom = [
    ...(assistant ? [ASSISTANT_RAIL_TOOL] : []),
    ...(check ? [checkRailTool(check.shortcut)] : []),
    ...(help ? [helpRailTool(help.shortcut)] : []),
  ];
  const pressedIds = assistant ? (assistant.open ? ['assistant'] : []) : undefined;
  const select = rail.tools.find((t) => t.id === 'select');
  // EZD-230 (04 Tool rail "Ceiling | G"; Q-0038): the standard rail with every tool's company key, in the user's order.
  const floorTools = surface ? [...rail.tools, CEILING_RAIL_TOOL] : [...rail.tools];
  const floorTop = orderRailTools(
    bindings ? railToolsWithKeys(floorTools, bindings) : floorTools,
    order ?? [],
  );
  // EZD-230: the Ceiling key does what its button does, while the button is on (not during Adjust or loading).
  const ceilingOn =
    surface !== undefined &&
    surface !== null &&
    !rail.disabled &&
    (rail.only ?? 'ceiling') === 'ceiling';
  useEffect(() => {
    if (!ceilingOn || !surface || !bindings) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target)) return;
      if (commandForKey(bindings, e) !== 'ceiling' || surface.get().surface !== 'floor') return;
      e.preventDefault();
      selection?.selectTool();
      surface.setSurface('ceiling');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ceilingOn, surface, bindings, selection]);
  if (surface && shown !== null && shown.surface !== 'floor' && select !== undefined) {
    const ceiling = ceilingRail(select, rail);
    return (
      <ToolRail
        top={ceiling.top}
        bottom={bottom}
        activeId={shown.tool ?? 'select'}
        pressedIds={pressedIds}
        onSelect={(id) => {
          if (assistant && id === 'assistant') assistant.onToggle();
          else if (help && id === 'help') help.onOpen();
          else if (check && id === 'check') check.onRun();
          else if (id === 'select') {
            surface.setTool(null);
            selection?.selectTool();
          } else surface.setTool(id as CeilingToolId);
        }}
        disabled={ceiling.disabled}
        only={ceiling.only}
        paused={ceiling.paused}
      />
    );
  }
  return (
    <ToolRail
      top={floorTop}
      onReorder={rail.disabled || rail.only !== undefined ? undefined : onReorder}
      bottom={bottom}
      activeId={ui?.tool ?? 'select'}
      pressedIds={pressedIds}
      onSelect={(id) => {
        if (assistant && id === 'assistant') assistant.onToggle();
        else if (help && id === 'help') help.onOpen();
        else if (check && id === 'check') check.onRun();
        else if (surface && id === CEILING_RAIL_TOOL.id) {
          selection?.selectTool();
          surface.setSurface('ceiling');
        } else if (id === 'select') selection?.selectTool();
        else drawing?.selectTool(id as DrawingToolId);
      }}
      disabled={rail.disabled}
      only={rail.only}
      paused={rail.paused}
    />
  );
}
