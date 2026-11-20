// EZD-423 (11 Budgets editor download size; 11 rule 7): the parts of the drawing controller the editor entry needs
// before the drawing engine loads: the rail mode, and the tool a key turns on from Select (the same keys as the
// engine's `keyDown` when no tool, pick or entry is on).
import { isTypingTarget } from '../typed-entry/typed-entry';
import type { DrawingToolId } from './tool-defs';
import type { ToolKeyEvent } from './drawing-controller';

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

const EDIT_KEYS: Readonly<Record<string, DrawingToolId>> = {
  w: 'wall',
  r: 'room-rect',
  d: 'door',
  n: 'window',
  m: 'move',
  f: 'fixtures',
  s: 'sketch',
};

/** The tool a key turns on with no tool, pick or entry on, or null when the key is not a tool key there. */
export function toolForKey(e: ToolKeyEvent, enabled: boolean): DrawingToolId | null {
  if (e.defaultPrevented || isTypingTarget(e.target)) return null;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  const key = e.key.toLowerCase();
  // EZD-231: Shift+L (Measure), EZD-404: C (Cabinets) and EZD-601: E (Electrical) work without Edit model.
  if (plain && e.shiftKey && key === 'l') return 'measure';
  if (plain && !e.shiftKey && key === 'c') return 'cabinets';
  if (plain && !e.shiftKey && key === 'e') return 'electrical';
  if (!enabled || !plain) return null;
  return EDIT_KEYS[key] ?? null;
}
