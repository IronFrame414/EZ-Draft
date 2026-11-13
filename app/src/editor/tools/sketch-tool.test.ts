// EZD-223 (S03 Sketch; S15d iPad input mode; Q-0392; AC-EZD-223-1 to -4). Real model store; the canvas handle is a
// local fake (as fixtures-tool.test.ts) and the clock is a number the test moves. Strokes are hand-drawn shapes:
// a 48" x 36" rectangle, a 12" circle and a 96" line, each with a fixed wobble of up to 1".
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SNAP_SETTINGS, type Point } from '@ezdraft/geometry';
import type { IpadDrawing } from '../../lib/profile/profile';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { editorRail } from '../selection/selection-controller';
import {
  createDrawingController,
  type DrawingHandle,
  type ToolKeyEvent,
} from './drawing-controller';
import { createToolOverlay, type OverlayElement } from './overlay';
import {
  SKETCH_HOLD_MS,
  initialSketchState,
  reduceSketch,
  sketchDraws,
  type SketchEvent,
} from './sketch-tool';
import { sketchModule } from './sketch-module';
import { baseObjects, WHO } from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const NO_SNAP = () => ({ ...DEFAULT_SNAP_SETTINGS, enabled: false });

const WOBBLE = [0.6, -0.4, 0.9, -0.8, 0.2, -0.5, 1, -0.3, 0.1, -0.9, 0.7, -0.6, 0.4, -1, 0.8, -0.2];

function roughPath(path: readonly Point[], step = 2, amp = 1): Point[] {
  const out: Point[] = [];
  let k = 0;
  for (let s = 1; s < path.length; s++) {
    const a = path[s - 1]!;
    const b = path[s]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const w = WOBBLE[k++ % WOBBLE.length]! * amp;
      out.push(pt(a.x + (b.x - a.x) * t - ((b.y - a.y) / len) * w, a.y + (b.y - a.y) * t + ((b.x - a.x) / len) * w));
    }
  }
  out.push(path[path.length - 1]!);
  return out;
}

const RECT = roughPath([pt(0, 0), pt(48, 0), pt(48, 36), pt(0, 36), pt(0, 1)]);
const LINE = roughPath([pt(0, 0), pt(96, 24)], 3);
const CIRCLE: Point[] = Array.from({ length: 65 }, (_, i) => {
  const a = (2 * Math.PI * i) / 64;
  const r = 12 + WOBBLE[i % WOBBLE.length]! * 0.6;
  return pt(100 + r * Math.cos(a), 50 + r * Math.sin(a));
});

function ev(kind: PlanPointerEvent['kind'], p: Point, pointerType = 'pen'): PlanPointerEvent {
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

const key = (k: string): ToolKeyEvent => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
});

function setup(mode: IpadDrawing = 'finger') {
  const store = createModelStore({ objects: baseObjects() });
  let receiver: PlanPointerReceiver | null = null;
  let now = 1000;
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
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit: true },
    onMessage: () => {},
    snapSettings: NO_SNAP,
    ipadDrawing: () => mode,
    clock: () => now,
  });
  const send = (e: PlanPointerEvent) => {
    if (receiver === null) throw new Error('no pointer receiver set');
    receiver(e);
  };
  // One stroke: 10 ms between points; `holdMs` still at the last point before the lift.
  const stroke = (points: readonly Point[], pointerType = 'pen', holdMs = 0) => {
    send(ev('down', points[0]!, pointerType));
    for (const p of points.slice(1)) {
      now += 10;
      send(ev('move', p, pointerType));
    }
    now += holdMs;
    send(ev('up', points[points.length - 1]!, pointerType));
  };
  const shapes = () => controller.getFrame()?.sketch?.shapes ?? [];
  return { store, controller, send, stroke, shapes };
}

describe('EZD-223 Sketch tool', () => {
  // The clean-up code loads lazily when the tool is turned on; load it first so each lift cleans at once.
  beforeAll(async () => {
    await sketchModule.load();
  });

  it('S Sketch is on the rail with key S and the draw icon, and S turns it on', () => {
    const rail = editorRail({ editor: 'ready', canEdit: true, canvasFailed: false, controllerEnabled: true });
    expect(rail?.tools.find((t) => t.kind === 'tool' && t.id === 'sketch')).toEqual({
      kind: 'tool',
      id: 'sketch',
      icon: 'draw',
      label: 'office.tool.sketch',
      shortcut: 'S',
    });
    const { controller } = setup();
    expect(controller.keyDown(key('s'))).toBe(true);
    expect(controller.getUi().tool).toBe('sketch');
  });

  it('AC-EZD-223-1 a rough rectangle stroke becomes a rectangle, and the model is unchanged', () => {
    const { controller, stroke, shapes, store } = setup();
    const before = store.getState().objects;
    controller.selectTool('sketch');
    stroke(RECT);
    expect(shapes()).toHaveLength(1);
    const shape = shapes()[0]!;
    expect(shape.kind).toBe('rectangle');
    if (shape.kind !== 'rectangle') return;
    const xs = shape.corners.map((p) => p.x).sort((a, b) => a - b);
    const ys = shape.corners.map((p) => p.y).sort((a, b) => a - b);
    expect(Math.abs(xs[0]! - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs(xs[3]! - 48)).toBeLessThanOrEqual(1);
    expect(Math.abs(ys[0]! - 0)).toBeLessThanOrEqual(1);
    expect(Math.abs(ys[3]! - 36)).toBeLessThanOrEqual(1);
    expect(store.getState().objects).toBe(before);
  });

  it('AC-EZD-223-2 a rough circle and a rough line also clean up', () => {
    const { controller, stroke, shapes } = setup();
    controller.selectTool('sketch');
    stroke(CIRCLE);
    stroke(LINE);
    const [circle, line] = shapes();
    expect(circle?.kind).toBe('circle');
    if (circle?.kind === 'circle') {
      expect(Math.abs(circle.center.x - 100)).toBeLessThanOrEqual(1);
      expect(Math.abs(circle.center.y - 50)).toBeLessThanOrEqual(1);
      expect(Math.abs(circle.radius - 12)).toBeLessThanOrEqual(1);
    }
    expect(line?.kind).toBe('line');
    if (line?.kind === 'line') {
      expect(line.from).toEqual(LINE[0]);
      expect(line.to).toEqual(LINE[LINE.length - 1]);
    }
  });

  it('AC-EZD-223-3 holding still before the lift keeps the raw stroke', () => {
    const { controller, stroke, shapes } = setup();
    controller.selectTool('sketch');
    stroke(RECT, 'pen', SKETCH_HOLD_MS);
    const shape = shapes()[0]!;
    expect(shape.kind).toBe('raw');
    if (shape.kind === 'raw') expect(shape.points).toEqual(RECT);
    // Just short of the hold, the same stroke still cleans up.
    stroke(RECT, 'pen', SKETCH_HOLD_MS - 20);
    expect(shapes()[1]?.kind).toBe('rectangle');
  });

  it('AC-EZD-223-4 in Pencil-only mode a touch pointer does not draw; the Pencil does', () => {
    const pencil = setup('pencil');
    pencil.controller.selectTool('sketch');
    pencil.stroke(RECT, 'touch');
    expect(pencil.shapes()).toHaveLength(0);
    expect(pencil.controller.getFrame()?.sketch ?? null).toBeNull();
    pencil.stroke(RECT, 'pen');
    expect(pencil.shapes().map((s) => s.kind)).toEqual(['rectangle']);
    // With Pencil or finger, the same touch draws.
    const finger = setup('finger');
    finger.controller.selectTool('sketch');
    finger.stroke(RECT, 'touch');
    expect(finger.shapes().map((s) => s.kind)).toEqual(['rectangle']);
  });

  it('AC-EZD-223-4 a palm touch in Pencil-only mode does not end or spoil the Pencil stroke', () => {
    const { controller, send, shapes } = setup('pencil');
    controller.selectTool('sketch');
    send(ev('down', RECT[0]!, 'pen'));
    send(ev('down', pt(200, 200), 'touch'));
    for (const p of RECT.slice(1)) send(ev('move', p, 'pen'));
    send(ev('up', pt(200, 200), 'touch'));
    send(ev('up', RECT[RECT.length - 1]!, 'pen'));
    expect(shapes().map((s) => s.kind)).toEqual(['rectangle']);
  });

  it('the stroke being drawn is in the frame, Esc drops it, and kept strokes stay after the tool is off', () => {
    const { controller, send, stroke, shapes } = setup();
    controller.selectTool('sketch');
    stroke(LINE);
    send(ev('down', pt(0, 0)));
    send(ev('move', pt(5, 5)));
    expect(controller.getFrame()?.sketch?.live).toEqual([pt(0, 0), pt(5, 5)]);
    controller.keyDown(key('Escape'));
    expect(controller.getFrame()?.sketch?.live).toBeNull();
    expect(controller.getUi().tool).toBe('sketch');
    controller.keyDown(key('Escape'));
    expect(controller.getUi().tool).toBeNull();
    expect(shapes().map((s) => s.kind)).toEqual(['line']);
  });

  it('the overlay draws the kept strokes as one path in screen px', () => {
    const attrs = new Map<string, string>();
    const el = (): OverlayElement => ({ setAttribute: () => {}, removeAttribute: () => {} });
    const sketch: OverlayElement = {
      setAttribute: (n, v) => void attrs.set(n, v),
      removeAttribute: (n) => void attrs.delete(n),
    };
    const overlay = createToolOverlay({ band: el(), marker: el(), sketch }, toScreen);
    overlay.draw({
      rect: false,
      from: null,
      to: null,
      marker: null,
      anchor: null,
      referenceDirection: null,
      wallDirection: null,
      opening: null,
      sketch: { shapes: [{ kind: 'line', from: pt(0, 0), to: pt(3, 3) }], live: null },
    });
    expect(attrs.get('d')).toBe('M 0 0 L 8 -8');
    expect(attrs.has('display')).toBe(false);
    overlay.draw(null);
    expect(attrs.get('display')).toBe('none');
  });
});

describe('EZD-223 reduceSketch', () => {
  const e = (kind: SketchEvent['kind'], x: number, time: number, pointerType = 'pen'): SketchEvent => ({
    kind,
    model: pt(x, 0),
    screen: pt(x * PPI, 0),
    pointerType,
    time,
  });

  it('a lift with one point draws nothing', () => {
    let s = reduceSketch(initialSketchState(), e('down', 0, 0), 'finger').state;
    const step = reduceSketch(s, e('up', 0, 5), 'finger');
    s = step.state;
    expect(step.done).toBeNull();
    expect(s.stroke).toBeNull();
  });

  it('Pencil only refuses touch and nothing else', () => {
    expect(sketchDraws('touch', 'pencil')).toBe(false);
    expect(sketchDraws('pen', 'pencil')).toBe(true);
    expect(sketchDraws('mouse', 'pencil')).toBe(true);
    expect(sketchDraws('touch', 'finger')).toBe(true);
  });
});
