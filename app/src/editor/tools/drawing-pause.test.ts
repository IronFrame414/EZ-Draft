// EZD-225 U3 (AC-EZD-225-3; S03:143 "all edit tools disabled"; S06:82 drawing shortcuts inactive in view only; S06
// States: measuring allowed in view only). The lock leaves the viewer mid-drawing: `pause` ends the half-drawn wall
// as Escape does, commits nothing, returns to Select and keeps every drawing tool and key off. Real model store over
// the P210a fixtures; the canvas handle is a local fake (copied from drawing-controller.test.ts). No browser.
import { describe, expect, it } from 'vitest';
import type { Point } from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { HoverMode } from '../plan/hover';
import {
  createDrawingController,
  type DrawingHandle,
  type ToolKeyEvent,
} from './drawing-controller';
import { baseObjects, idSeq, wallsOf, WHEN, WHO } from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });

function setup() {
  const receiverCalls: Array<PlanPointerReceiver | null> = [];
  const modes: HoverMode[] = [];
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void receiverCalls.push(r),
    setHoverMode: (m) => void modes.push(m),
    getHoveredWallId: () => null,
    wallAt: () => null,
  };
  const store = createModelStore({ objects: baseObjects() });
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit: true },
    onMessage: () => {},
    newId: idSeq(100),
    now: () => WHEN,
  });
  const ev = (kind: PlanPointerEvent['kind'], x: number, y: number): PlanPointerEvent => ({
    kind,
    model: pt(x, y),
    screen: toScreen(pt(x, y)),
    pointerType: 'mouse',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
  const click = (x: number, y: number) => {
    const r = receiverCalls.at(-1);
    if (!r) throw new Error('no pointer receiver set');
    r(ev('down', x, y));
    r(ev('up', x, y));
  };
  return { store, controller, receiverCalls, modes, click };
}

const key = (k: string, over: Partial<ToolKeyEvent> = {}): ToolKeyEvent => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
  ...over,
});

describe('EZD-225 drawing controller pause', () => {
  it('EZD-225 U3 a lost lock ends the half-drawn wall, returns to Select and keeps drawing off', () => {
    const { store, controller, receiverCalls, modes, click } = setup();
    controller.selectTool('wall');
    click(0, 0);
    expect(controller.getUi().tool).toBe('wall');
    let calls = 0;
    controller.subscribe(() => void calls++);

    controller.pause();
    const ui = controller.getUi();
    expect(ui.enabled).toBe(false);
    expect(ui.tool).toBeNull();
    expect(ui.entry).toBeNull();
    expect(ui.pick).toBeNull();
    expect(calls).toBeGreaterThan(0);
    expect(receiverCalls.at(-1)).toBeNull();
    expect(modes.at(-1)).toBe('select');
    // Nothing committed: the chain had one point only, and no wall was written.
    expect(wallsOf(store.getState().objects)).toHaveLength(0);
    expect(store.getState().past).toHaveLength(0);

    // Drawing tools and their keys (S06:82: E, V, M, W, D, C, K, L, T family) do nothing.
    controller.selectTool('wall');
    controller.selectTool('room-rect');
    controller.selectTool('door');
    expect(controller.getUi().tool).toBeNull();
    // EZD-601: E is no longer here; it turns on electrical mode, which view only allows (S06 Permissions).
    for (const k of ['w', 'r', 'd', 'm', 'k', 'f']) expect(controller.keyDown(key(k))).toBe(false);
    expect(controller.getUi().tool).toBeNull();

    // Measure stays usable in view only (S06 States).
    controller.selectTool('measure');
    expect(controller.getUi().tool).toBe('measure');

    // A second pause is a no-op.
    const before = calls;
    controller.pause();
    expect(calls).toBe(before);
  });

  it('EZD-225 U4 Measure on when the lock goes stays on', () => {
    const { controller } = setup();
    controller.selectTool('measure');
    controller.pause();
    expect(controller.getUi().tool).toBe('measure');
    expect(controller.getUi().enabled).toBe(false);
  });
});
