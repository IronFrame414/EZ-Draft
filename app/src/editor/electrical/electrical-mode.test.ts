// EZD-601 electrical mode (S06 Controls "Electrical tool (E) | Standard rail | Enters electrical mode. | Pressed
// state. Shortcut E"; S06 Permissions "View plan, circuits ...: View projects"; S06 States locked / view-only
// "Selecting, panning, zooming, measuring ... allowed"; S06 Controls "Canvas click on device: Selects device ...
// Allowed in view only"; board S06Electrical rail). Expected values from the spec, never the code.
import { DEFAULT_SNAP_SETTINGS } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import type { PlanPointerReceiver } from '../plan/input';
import { isFloorToolKey } from '../ceiling/surface';
import { editorRail } from '../selection/selection-controller';
import {
  createDrawingController,
  type DrawingHandle,
  type ToolKeyEvent,
} from '../tools/drawing-controller';
import { toolForKey } from '../tools/rail-mode';
import { baseObjects, WHO } from '../tools/test-utils/fixtures';

const key = (k: string, mods: Partial<ToolKeyEvent> = {}): ToolKeyEvent => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
  ...mods,
});

function setup(canEdit: boolean) {
  const store = createModelStore({ objects: baseObjects() });
  let receiver: PlanPointerReceiver | null = null;
  const hover: string[] = [];
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => 1,
    modelToScreen: (p) => p,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void (receiver = r),
    setHoverMode: (m) => void hover.push(m),
    getHoveredWallId: () => null,
    wallAt: () => null,
  };
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit },
    onMessage: () => {},
    snapSettings: () => DEFAULT_SNAP_SETTINGS,
  });
  return { controller, receiver: () => receiver, hover };
}

describe('EZD-601 electrical mode', () => {
  it('E turns it on for an editor and a view-only user; Esc leaves it', () => {
    for (const canEdit of [true, false]) {
      const { controller } = setup(canEdit);
      expect(controller.keyDown(key('e'))).toBe(true);
      expect(controller.getUi().tool).toBe('electrical');
      expect(controller.keyDown(key('Escape'))).toBe(true);
      expect(controller.getUi().tool).toBeNull();
      controller.selectTool('electrical');
      expect(controller.getUi().tool).toBe('electrical');
    }
  });

  it('leaves the plan clicks to selection, with select hover', () => {
    const { controller, receiver, hover } = setup(true);
    controller.selectTool('electrical');
    expect(receiver()).toBeNull();
    expect(hover).not.toContain('off');
  });

  it('stays on when the lock is lost (view only allows it)', () => {
    const { controller } = setup(true);
    controller.selectTool('electrical');
    controller.pause();
    expect(controller.getUi().tool).toBe('electrical');
  });

  it('the rail offers Electrical after Cabinets to every viewer, never paused', () => {
    const base = { canvasFailed: false, controllerEnabled: true };
    const editor = editorRail({ ...base, editor: 'ready', canEdit: true });
    const ids = editor?.tools.map((t) => t.id) ?? [];
    // EZD-412: Countertops now stands between them (board S04bCountertops rail).
    expect(ids[ids.indexOf('cabinets') + 2]).toBe('electrical');
    const locked = editorRail({ ...base, editor: 'ready', canEdit: false, canEditModel: true });
    expect(locked?.tools.map((t) => t.id)).toContain('electrical');
    expect(locked?.paused).not.toContain('electrical');
    const viewer = editorRail({ ...base, editor: 'ready', canEdit: false });
    expect(viewer?.tools.map((t) => t.id)).toContain('electrical');
  });

  it('the editor entry maps E to Electrical without Edit model; on the ceiling E is a floor key', () => {
    expect(toolForKey(key('e'), false)).toBe('electrical');
    expect(toolForKey(key('E'), true)).toBe('electrical');
    expect(toolForKey(key('e', { metaKey: true }), true)).toBeNull();
    expect(isFloorToolKey(key('e'))).toBe(true);
  });
});
