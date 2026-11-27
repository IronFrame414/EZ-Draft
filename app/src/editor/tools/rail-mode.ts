// EZD-423 (11 Budgets editor download size; 11 rule 7): the parts of the drawing controller the editor entry needs
// before the drawing engine loads: the rail mode, and the tool a key turns on from Select (the same keys as the
// engine's `keyDown` when no tool, pick or entry is on).
import { isTypingTarget } from '../typed-entry/typed-entry';
import type { DrawingToolId } from './tool-defs';
import type { ToolKeyEvent } from './drawing-controller';
import {
  DEFAULT_BINDINGS,
  commandForKey,
  type ShortcutBindings,
} from '../../lib/defaults/shortcut-keys';

export function railMode(o: {
  editor: 'loading' | 'ready' | 'failed' | 'no-access' | 'not-found';
  canEdit: boolean;
  canvasFailed: boolean;
  controllerEnabled: boolean;
}): 'hidden' | 'disabled' | 'enabled' {
  if (o.editor === 'loading') return 'disabled';
  if (o.editor !== 'ready' || !o.canEdit) return 'hidden';
  if (o.canvasFailed || !o.controllerEnabled) return 'disabled';
  return 'enabled';
}

// EZD-222 (S15d Keyboard shortcuts): the keys come from the company key map, as in the engine's `keyDown`.
// EZD-216: Dimension (L) and Text (T). EZD-232: Revision cloud (Q).
const EDIT_TOOLS: ReadonlySet<string> = new Set([
  'wall',
  'room-rect',
  'door',
  'window',
  'move',
  'fixtures',
  'dimension',
  'text',
  'sketch',
  'revision-cloud',
]);
// EZD-231 Measure, EZD-404 Cabinets, EZD-412 Countertops and EZD-601 Electrical work without Edit model.
const VIEW_TOOLS: ReadonlySet<string> = new Set([
  'measure',
  'cabinets',
  'countertops',
  'electrical',
]);

/** The tool a key turns on with no tool, pick or entry on, or null when the key is not a tool key there. */
export function toolForKey(
  e: ToolKeyEvent,
  enabled: boolean,
  bindings: ShortcutBindings = DEFAULT_BINDINGS,
): DrawingToolId | null {
  if (e.defaultPrevented || isTypingTarget(e.target)) return null;
  const command = commandForKey(bindings, e);
  if (command === null) return null;
  if (VIEW_TOOLS.has(command)) return command as DrawingToolId;
  return enabled && EDIT_TOOLS.has(command) ? (command as DrawingToolId) : null;
}
