// EZD-222 (phase-02.md EZD-222 "rail and tooltips read bindings"; 04 Tool rail "hovering shows a dark tooltip with
// name and shortcut"): the rail tools with the company's keys. A tool with no command keeps its own key; a cleared
// row shows no key.
import type { RailTool } from '../../components/shell/rail-types';
import { keyLabel, type ShortcutBindings } from '../../lib/defaults/shortcut-keys';

// A command's key as the rail tooltip shows it; undefined for a cleared row.
export function shortcutText(bindings: ShortcutBindings, id: string): string | undefined {
  const key = bindings[id];
  return key ? keyLabel(key) : undefined;
}

export function railToolsWithKeys(tools: readonly RailTool[], bindings: ShortcutBindings): RailTool[] {
  return tools.map((tool) => (tool.id in bindings ? { ...tool, shortcut: shortcutText(bindings, tool.id) } : tool));
}
