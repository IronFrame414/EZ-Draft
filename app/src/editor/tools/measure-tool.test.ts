// EZD-231 (04 Tool rail "Measure | Shift+L | Distance between two points; no model change | Every editor tab"; S06
// Measure "Allowed in view only"; Q-0697; AC-EZD-231-1 to -3). Real model store and drawing controller; the canvas
// handle is a local fake (as sketch-tool.test.ts). The 12' 6" wall is 150" long (12 x 12 + 6), from the AC.
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SNAP_SETTINGS, type Point, type SnapSettings } from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { editorRail } from '../selection/selection-controller';
import {
  createDrawingController,
  type DrawingHandle,
  type ToolKeyEvent,
} from './drawing-controller';
import { createToolOverlay, type ChipElements, type OverlayElement } from './overlay';
import { initialMeasureState, measureText, reduceMeasure } from './measure-tool';
import { baseObjects, withWalls, WHO } from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const SNAP_OFF: SnapSettings = {
  endpoints: false,
  midpoints: false,
  faces: false,
  angles: false,
  increment: false,
  incrementIn: 1,
};

function ev(kind: PlanPointerEvent['kind'], p: Point, pointerType = 'mouse'): PlanPointerEvent {
  return {
    kind,
    model: p,
    screen: toScreen(p),
    pointerType,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

const key = (k: string, shiftKey = false): ToolKeyEvent => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey,
  defaultPrevented: false,
  target: null,
});

// A 150" (12' 6") wall from (0,0) to (150,0) on floor F1.
function setup(o: { canEdit: boolean; snap?: SnapSettings }) {
  const store = createModelStore({
    objects: withWalls(baseObjects(), 10, [pt(0, 0), pt(150, 0)], false),
  });
  const applyEdit = vi.spyOn(store, 'applyEdit');
  let receiver: PlanPointerReceiver | null = null;
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void (receiver = r),
    setHoverMode: () => {},
    getHoveredWallId: () => null,
    wallAt: () => null,
  };
  const settings = o.snap ?? DEFAULT_SNAP_SETTINGS;
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit: o.canEdit },
    onMessage: () => {},
    snapSettings: () => settings,
  });
  const send = (e: PlanPointerEvent) => {
    if (receiver === null) throw new Error('no pointer receiver set');
    receiver(e);
  };
  const click = (p: Point, pointerType = 'mouse') => {
    send(ev('move', p, pointerType));
    send(ev('down', p, pointerType));
    send(ev('up', p, pointerType));
  };
  return { store, applyEdit, controller, click, receiver: () => receiver };
}

// Points a pixel or two off each wall end, as a hand on a mouse lands.
const NEAR_START = pt(0.6, 0.5);
const NEAR_END = pt(149.3, -0.4);

describe('EZD-231 Measure tool', () => {
  it('AC-EZD-231-1 reads a distance in feet and inches: 150" reads 12\' 6"', () => {
    expect(measureText(pt(0, 0), pt(150, 0))).toBe('12\' 6"');
    // 3-4-5: 36" by 48" apart is 60" = 5' 0".
    expect(measureText(pt(0, 0), pt(36, 48))).toBe('5\' 0"');
  });

  it('press, move, press fixes a measure; the next press starts a new one; Esc drops it, then ends', () => {
    let s = initialMeasureState();
    s = reduceMeasure(s, { type: 'press', at: pt(0, 0) }).state;
    expect(s).toEqual({ from: pt(0, 0), to: pt(0, 0), fixed: false });
    s = reduceMeasure(s, { type: 'move', at: pt(10, 0) }).state;
    expect(s.to).toEqual(pt(10, 0));
    s = reduceMeasure(s, { type: 'press', at: pt(20, 0) }).state;
    expect(s).toEqual({ from: pt(0, 0), to: pt(20, 0), fixed: true });
    // A fixed measure stays put while the pointer moves.
    expect(reduceMeasure(s, { type: 'move', at: pt(99, 9) }).state).toBe(s);
    const again = reduceMeasure(s, { type: 'press', at: pt(5, 5) }).state;
    expect(again).toEqual({ from: pt(5, 5), to: pt(5, 5), fixed: false });
    const dropped = reduceMeasure(again, { type: 'escape' });
    expect(dropped).toEqual({ state: initialMeasureState(), exit: false });
    expect(reduceMeasure(dropped.state, { type: 'escape' }).exit).toBe(true);
  });

  it('AC-EZD-231-1 measuring a 12\' 6" wall end to end reads 12\' 6"', () => {
    const { controller, click } = setup({ canEdit: true });
    controller.selectTool('measure');
    expect(controller.getUi().tool).toBe('measure');
    click(NEAR_START);
    click(NEAR_END);
    const frame = controller.getFrame();
    expect(frame?.from).toEqual(pt(0, 0));
    expect(frame?.to).toEqual(pt(150, 0));
    expect(frame?.measure).toBe('12\' 6"');
  });

  it('follows the status bar snap settings: with snapping off the points are where the pointer is', () => {
    const { controller, click } = setup({ canEdit: true, snap: SNAP_OFF });
    controller.selectTool('measure');
    click(NEAR_START);
    click(NEAR_END);
    expect(controller.getFrame()?.from).toEqual(NEAR_START);
    expect(controller.getFrame()?.to).toEqual(NEAR_END);
  });

  it('a touch measures on the tap', () => {
    const { controller, click } = setup({ canEdit: true });
    controller.selectTool('measure');
    click(NEAR_START, 'touch');
    click(NEAR_END, 'touch');
    expect(controller.getFrame()?.measure).toBe('12\' 6"');
  });

  it('AC-EZD-231-2 the model is unchanged: no edit, same objects, nothing to undo', () => {
    const { store, applyEdit, controller, click } = setup({ canEdit: true });
    const before = store.getState();
    controller.selectTool('measure');
    click(NEAR_START);
    click(NEAR_END);
    click(pt(20, 20));
    click(pt(80, 40));
    expect(controller.keyDown(key('Enter'))).toBe(false);
    controller.keyDown(key('Escape'));
    controller.keyDown(key('Escape'));
    expect(controller.getUi().tool).toBeNull();
    expect(applyEdit).not.toHaveBeenCalled();
    expect(store.getState().objects).toBe(before.objects);
    expect(store.getState().past).toEqual(before.past);
  });

  it('AC-EZD-231-3 a view-only user can measure, and nothing else turns on', () => {
    const { store, applyEdit, controller, click, receiver } = setup({ canEdit: false });
    expect(controller.getUi().enabled).toBe(false);
    expect(receiver()).toBeNull();
    const before = store.getState().objects;
    expect(controller.keyDown(key('L', true))).toBe(true);
    expect(controller.getUi().tool).toBe('measure');
    click(NEAR_START);
    click(NEAR_END);
    expect(controller.getFrame()?.measure).toBe('12\' 6"');
    // Drawing stays off for a viewer while measuring.
    expect(controller.keyDown(key('w'))).toBe(false);
    controller.selectTool('wall');
    expect(controller.getUi().tool).toBe('measure');
    expect(applyEdit).not.toHaveBeenCalled();
    expect(store.getState().objects).toBe(before);
    // Select (V and the rail) ends it.
    controller.selectTool(null);
    expect(controller.getUi().tool).toBeNull();
    expect(receiver()).toBeNull();
    expect(controller.getFrame()?.measure).toBeUndefined();
  });

  it('AC-EZD-231-3 Measure is on the rail, key Shift+L, for an editor and a view-only user', () => {
    const base = { canvasFailed: false, controllerEnabled: true } as const;
    const want = {
      kind: 'tool',
      id: 'measure',
      icon: 'straighten',
      label: 'office.tool.measure',
      shortcut: 'Shift+L',
    };
    const editor = editorRail({ ...base, editor: 'ready', canEdit: true });
    const viewer = editorRail({ ...base, editor: 'ready', canEdit: false });
    expect(editor?.tools.at(-1)).toEqual(want);
    expect(viewer?.tools.map((t) => (t.kind === 'tool' ? t.id : '-'))).toEqual([
      'select',
      'measure',
    ]);
    expect(viewer?.disabled).toBe(false);
  });

  it('Shift+L turns it on; l without Shift does not; Esc drops the measure, then ends the tool', () => {
    const { controller, click } = setup({ canEdit: false });
    expect(controller.keyDown(key('l'))).toBe(false);
    expect(controller.getUi().tool).toBeNull();
    expect(controller.keyDown(key('L', true))).toBe(true);
    click(NEAR_START);
    expect(controller.getFrame()?.from).not.toBeNull();
    expect(controller.keyDown(key('Escape'))).toBe(true);
    expect(controller.getFrame()?.from ?? null).toBeNull();
    expect(controller.getUi().tool).toBe('measure');
    expect(controller.keyDown(key('Escape'))).toBe(true);
    expect(controller.getUi().tool).toBeNull();
    // Off, a viewer's Esc is left to the selection.
    expect(controller.keyDown(key('Escape'))).toBe(false);
  });

  it('an editor switches between Measure and a drawing tool', () => {
    const { controller } = setup({ canEdit: true });
    controller.selectTool('wall');
    expect(controller.keyDown(key('L', true))).toBe(true);
    expect(controller.getUi().tool).toBe('measure');
    expect(controller.keyDown(key('w'))).toBe(true);
    expect(controller.getUi().tool).toBe('wall');
  });

  it('draws the measure as the band with its distance chip 16 px above the middle', () => {
    const el = (): OverlayElement & { attrs: Map<string, string> } => {
      const attrs = new Map<string, string>();
      return {
        attrs,
        setAttribute: (n, v) => void attrs.set(n, v),
        removeAttribute: (n) => void attrs.delete(n),
      };
    };
    const band = el();
    const chip: ChipElements = {
      slot: { style: { transform: '', display: 'none' } },
      button: { textContent: null },
    };
    const overlay = createToolOverlay({ band, marker: el(), measure: chip }, (p) => ({
      x: p.x,
      y: -p.y,
    }));
    overlay.draw({
      rect: false,
      from: pt(0, 0),
      to: pt(150, 0),
      marker: null,
      anchor: null,
      referenceDirection: null,
      wallDirection: null,
      opening: null,
      measure: '12\' 6"',
    });
    expect(band.attrs.get('d')).toBe('M 0 0 L 150 0');
    expect(band.attrs.has('display')).toBe(false);
    expect(chip.button.textContent).toBe('12\' 6"');
    expect(chip.slot.style.display).toBe('');
    expect(chip.slot.style.transform).toBe('translate(75px, -16px) translate(-50%, -50%)');
    overlay.draw(null);
    expect(chip.slot.style.display).toBe('none');
  });
});
