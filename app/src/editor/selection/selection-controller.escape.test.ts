// EZD-613 (found by the EZD-208b B7 browser test): Esc with a drawing tool on, pressed before the drawing engine
// loads, is held and answered when the engine loads. When that answer turns the tool off, the selection clears,
// as it does for an Esc the engine answers at once (S03 Canvas interactions Esc chain; EZD-208b B7).
import type { Point } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import type { DrawingUi, ToolKeyEvent } from '../tools/drawing-controller';
import type { DrawingToolId } from '../tools/index';
import { baseObjects, uid, withWalls } from '../tools/test-utils/fixtures';
import { createSelectionController, type SelectionDeps } from './selection-controller';

const ESC: ToolKeyEvent = {
  key: 'Escape',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
};

const handle: SelectionDeps['handle'] = {
  getPixelsPerInch: () => 8 / 3,
  screenToModel: (s: Point) => s,
  setHoverMode: () => {},
  setHoverPicker: () => {},
  setBodyLookup: () => {},
  setSelectedIds: () => {},
};

// A drawing whose Esc is held until `load()` (the shell before the engine loads), then cancels the chain on the
// first Esc and turns the tool off on the second.
function heldDrawing(start: DrawingToolId) {
  let tool: DrawingToolId | null = start;
  let escapes = 0;
  const held: ToolKeyEvent[] = [];
  const listeners = new Set<() => void>();
  const ui = (): DrawingUi => ({
    enabled: true,
    tool,
    pick: null,
    boxes: [],
    gapMessage: null,
    lastLength: null,
    doorTarget: null,
    openingWidth: null,
    entry: null,
    fixtureChoice: null,
    utilities: null,
  });
  const drawing: NonNullable<SelectionDeps['drawing']> = {
    getUi: ui,
    keyDown: (e) => {
      held.push(e);
      return true;
    },
    selectTool: (id) => {
      tool = id;
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  const load = () => {
    for (const e of held.splice(0)) {
      if (e.key !== 'Escape') continue;
      escapes += 1;
      if (escapes >= 2) tool = null;
    }
    for (const l of [...listeners]) l();
  };
  return { drawing, load };
}

describe('EZD-613 Esc held until the drawing engine loads', () => {
  it('clears the selection when the held Esc turns the tool off', () => {
    const d = heldDrawing('wall');
    const c = createSelectionController({
      handle,
      store: createModelStore({ objects: withWalls(baseObjects(), 1, [{ x: 0, y: 0 }, { x: 144, y: 0 }], false, 'center') }),
      drawing: d.drawing,
      setReceiver: () => {},
    });
    c.select([uid(1)]);
    expect(c.keyDown(ESC)).toBe(true);
    expect(c.keyDown(ESC)).toBe(true);
    // Nothing answered yet: the tool is still on and the selection kept.
    expect(c.getUi().ids).toEqual([uid(1)]);
    d.load();
    expect(d.drawing.getUi().tool).toBeNull();
    expect(c.getUi().ids).toEqual([]);
  });

  it('keeps the selection when the held Esc only cancels the chain', () => {
    const d = heldDrawing('wall');
    const c = createSelectionController({
      handle,
      store: createModelStore({ objects: withWalls(baseObjects(), 1, [{ x: 0, y: 0 }, { x: 144, y: 0 }], false, 'center') }),
      drawing: d.drawing,
      setReceiver: () => {},
    });
    c.select([uid(1)]);
    expect(c.keyDown(ESC)).toBe(true);
    d.load();
    expect(d.drawing.getUi().tool).toBe('wall');
    expect(c.getUi().ids).toEqual([uid(1)]);
  });
});
