// EZD-404 (S04 Entry points "Cabinets (C) tool on the rail"; S04 Permissions "View projects: view runs, plan strip,
// elevation"; S04 Controls "Esc"; board S04 rail, Cabinets after Window): the Cabinets tool on the rail and its keys.
import { describe, expect, it } from 'vitest';
import type { Point } from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import { editorRail, PAUSED_TOOL_IDS } from '../selection/selection-controller';
import { createDrawingController, type DrawingHandle, type ToolKeyEvent } from '../tools/drawing-controller';
import { CABINETS_RAIL_TOOL } from '../tools/tool-defs';
import { baseObjects, withWalls, WHO } from '../tools/test-utils/fixtures';
import { catalogFor } from '../../server/messages/catalog';

const pt = (x: number, y: number): Point => ({ x, y });
const key = (k: string, o: Partial<ToolKeyEvent> = {}): ToolKeyEvent => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
  ...o,
});

function setup(canEdit: boolean) {
  const store = createModelStore({ objects: withWalls(baseObjects(), 10, [pt(0, 0), pt(150, 0)], false) });
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => 8 / 3,
    modelToScreen: (p) => p,
    onCameraChange: () => () => {},
    setPointerReceiver: () => {},
    setHoverMode: () => {},
    getHoveredWallId: () => null,
    wallAt: () => null,
  };
  return createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit },
    onMessage: () => {},
  });
}

describe('EZD-404 Cabinets tool', () => {
  it('is the C tool with the kitchen icon, labelled Cabinets', () => {
    expect(CABINETS_RAIL_TOOL).toEqual({
      kind: 'tool',
      id: 'cabinets',
      icon: 'kitchen',
      label: 'office.tool.cabinets',
      shortcut: 'C',
    });
    expect((catalogFor('office', 'en') as Record<string, unknown>)['office.tool.cabinets']).toBe('Cabinets');
  });

  it('follows Window on every rail, a viewer without Edit model included, and is never paused', () => {
    const base = { editor: 'ready' as const, canvasFailed: false, controllerEnabled: true };
    const ids = (r: ReturnType<typeof editorRail>) => r?.tools.map((t) => t.id);
    const edit = ids(editorRail({ ...base, canEdit: true }));
    expect(edit?.slice(edit.indexOf('window'), edit.indexOf('window') + 2)).toEqual(['window', 'cabinets']);
    expect(ids(editorRail({ ...base, canEdit: false }))).toEqual(['select', 'cabinets', 'measure']);
    const locked = editorRail({ ...base, canEdit: false, canEditModel: true });
    expect(ids(locked)).toContain('cabinets');
    expect(locked?.paused).not.toContain('cabinets');
    expect(PAUSED_TOOL_IDS).not.toContain('cabinets');
  });

  for (const canEdit of [true, false]) {
    it(`C turns it on and Esc turns it off (${canEdit ? 'Edit model' : 'View projects only'})`, () => {
      const c = setup(canEdit);
      expect(c.keyDown(key('c'))).toBe(true);
      expect(c.getUi().tool).toBe('cabinets');
      expect(c.keyDown(key('Escape'))).toBe(true);
      expect(c.getUi().tool).toBeNull();
      c.selectTool('cabinets');
      expect(c.getUi().tool).toBe('cabinets');
      // Ctrl/Cmd+C stays the copy key.
      c.selectTool(null);
      expect(c.keyDown(key('c', { metaKey: true }))).toBe(false);
      expect(c.keyDown(key('c', { ctrlKey: true }))).toBe(false);
      expect(c.getUi().tool).toBeNull();
    });
  }

  it('turning it on empties the plan selection, which the screen hides', () => {
    const c = setup(true);
    const picked: (readonly string[])[] = [];
    c.attachSelection({
      getUi: () => ({ ids: ['wall-1'], selectMore: false }),
      select: (ids) => void picked.push(ids),
      subscribe: () => () => {},
    });
    c.selectTool('cabinets');
    expect(picked).toEqual([[]]);
  });

  it('stays on through a pause (lock lost), as viewing needs no lock', () => {
    const c = setup(true);
    c.selectTool('cabinets');
    c.pause();
    expect(c.getUi().tool).toBe('cabinets');
  });
});
