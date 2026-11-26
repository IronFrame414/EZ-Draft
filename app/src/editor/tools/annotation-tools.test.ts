// EZD-216 (AC-EZD-216-1, -2, -3, -5, -8; S03 rail Dimension (L), Text (T); Q-0682 angular "click two walls, then where
// the arc goes"; Q-0683 (a) a click opens the box in place, Enter commits, Esc cancels, a press-drag-release draws a
// leader; Q-0687 (b) several lines, at most 500 characters; 09-calculations Q-0664 "two points equal within 1/64"
// place nothing", 09m row 1 (150" reads 12' 6"), rows 5-7 (whole degrees); S03 Status bar View "Proposed: new objects
// default to New"). Expected values come from those rows, not from running the code.
import { describe, expect, it, vi } from 'vitest';
import {
  createWallData,
  type DimensionData,
  type Point,
  type SnapSettings,
  type TextData,
  type WallObject,
} from '@ezdraft/geometry';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { PhaseSource } from '../../lib/plan/phase-view';
import {
  createDrawingController,
  type DrawingHandle,
  type SelectionLink,
  type ToolKeyEvent,
} from './drawing-controller';
import { initialDimensionState, reduceDimension, type DimensionContext } from './dimension-tool';
import {
  initialTextState,
  noteText,
  overrideText,
  plainText,
  reduceText,
  TEXT_DRAG_PX,
} from './text-tool';
import { baseObjects, F1, uid, withWalls, WHO } from './test-utils/fixtures';

const pt = (x: number, y: number): Point => ({ x, y });
const PPI = 8 / 3;
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const SNAP_OFF: SnapSettings = {
  endpoints: false,
  midpoints: false,
  faces: false,
  angles: false,
  increment: false,
  incrementIn: 1,
};

function wall(id: string, start: Point, end: Point): WallObject {
  const r = createWallData({ start, end, level: F1, thicknessSide: 'right' });
  if (!r.ok) throw new Error(r.reason);
  return { id, type: 'wall', data: r.data };
}

// Wall A along the south side (0,0)-(150,0), its body below the line; wall B up the east side (150,0)-(150,120).
const A = wall(uid(10), pt(0, 0), pt(150, 0));
const B = wall(uid(11), pt(150, 0), pt(150, 120));
const CTX: DimensionContext = { level: F1, walls: [A, B], status: 'existing' };
const press = (at: Point, wallId: string | null = null, snapKind: 'endpoint' | null = null) =>
  ({ type: 'press', at, raw: at, snapKind, wallId }) as const;

describe('EZD-216 Dimension tool steps', () => {
  it('AC-1: two points, then the line: a linear dimension at the offset through the third press', () => {
    let s = initialDimensionState();
    s = reduceDimension(s, press(pt(0, 60)), CTX).state;
    expect(s.from).toEqual(pt(0, 60));
    s = reduceDimension(s, { type: 'move', at: pt(100, 60) }, CTX).state;
    expect(s.to).toEqual(pt(100, 60));
    s = reduceDimension(s, press(pt(150, 60)), CTX).state;
    expect(s.placing?.measure.length).toBe(150);
    s = reduceDimension(s, { type: 'move', at: pt(75, 70) }, CTX).state;
    expect(s.placing?.offset).toBe(10);
    const step = reduceDimension(s, press(pt(75, 84)), CTX);
    expect(step.place).toEqual({
      geometry: { kind: 'points', from: pt(0, 60), to: pt(150, 60) },
      status: 'existing',
      level: F1,
      attributes: { kind: 'linear', offset: 24, override: null, auto: null, room: null },
    } satisfies DimensionData);
    expect(step.state).toEqual(initialDimensionState('linear'));
  });

  it('AC-1: two points within 1/64" place nothing and the tool starts again; 3000" apart is placed', () => {
    let s = reduceDimension(initialDimensionState(), press(pt(0, 60)), CTX).state;
    const none = reduceDimension(s, press(pt(0.01, 60)), CTX);
    expect(none.place).toBeNull();
    expect(none.state).toEqual(initialDimensionState());
    s = reduceDimension(initialDimensionState(), press(pt(0, 60)), CTX).state;
    s = reduceDimension(s, press(pt(3000, 60)), CTX).state;
    expect(s.placing?.measure.length).toBe(3000);
  });

  it('AC-1: a press on a wall body away from a point snap takes that wall face; on a snapped end, the point', () => {
    const below = reduceDimension(initialDimensionState(), press(pt(75, -2), A.id), CTX).state;
    expect(below.placing?.geometry).toEqual({ kind: 'wall_face', wallId: A.id, face: 'right' });
    expect(below.placing?.measure.length).toBeCloseTo(150, 9);
    const above = reduceDimension(initialDimensionState(), press(pt(75, 0.5), A.id), CTX).state;
    expect(above.placing?.geometry).toEqual({ kind: 'wall_face', wallId: A.id, face: 'left' });
    const end = reduceDimension(
      initialDimensionState(),
      press(pt(0, 0), A.id, 'endpoint'),
      CTX,
    ).state;
    expect(end.placing).toBeNull();
    expect(end.from).toEqual(pt(0, 0));
  });

  it('AC-2 / Q-0682: Angular takes two walls, then the arc point; the same wall twice and no wall are not taken', () => {
    let s = reduceDimension(initialDimensionState(), { type: 'mode', mode: 'angular' }, CTX).state;
    expect(s.mode).toBe('angular');
    expect(reduceDimension(s, press(pt(10, 10)), CTX).state).toBe(s);
    s = reduceDimension(s, press(pt(75, 0), A.id), CTX).state;
    expect(reduceDimension(s, press(pt(80, 0), A.id), CTX).state).toBe(s);
    s = reduceDimension(s, press(pt(150, 60), B.id), CTX).state;
    expect(s.walls).toEqual([A.id, B.id]);
    const step = reduceDimension(s, press(pt(120, 30)), CTX);
    expect(step.place?.geometry).toEqual({ kind: 'walls', wallIds: [A.id, B.id], at: pt(120, 30) });
    expect(step.place?.attributes.kind).toBe('angular');
    expect(step.state).toEqual(initialDimensionState('angular'));
  });

  it('Esc drops what is half placed, then ends the tool', () => {
    const s = reduceDimension(initialDimensionState(), press(pt(0, 60)), CTX).state;
    const dropped = reduceDimension(s, { type: 'escape' }, CTX);
    expect(dropped).toEqual({ state: initialDimensionState(), place: null, exit: false });
    expect(reduceDimension(dropped.state, { type: 'escape' }, CTX).exit).toBe(true);
  });
});

describe('EZD-216 Text tool steps and text checks', () => {
  const at = pt(30, 40);
  const screen = toScreen(at);

  it('Q-0683 (a): a click opens the box at the point; a press-drag-release draws a leader from the press', () => {
    const down = reduceText(initialTextState(), { type: 'down', at, screen });
    const click = reduceText(down.state, {
      type: 'up',
      at: pt(30.5, 40),
      screen: { x: screen.x + TEXT_DRAG_PX - 1, y: screen.y },
    });
    expect(click.open).toEqual({ at, leader: null });
    const drag = reduceText(down.state, {
      type: 'up',
      at: pt(60, 80),
      screen: toScreen(pt(60, 80)),
    });
    expect(drag.open).toEqual({ at: pt(60, 80), leader: at });
    expect(reduceText(down.state, { type: 'escape' })).toEqual({
      state: initialTextState(),
      open: null,
      exit: false,
    });
    expect(reduceText(initialTextState(), { type: 'escape' }).exit).toBe(true);
  });

  it('Q-0687 (b): a note keeps its lines and the Latin letters, maps typed quotes and dashes, refuses the rest', () => {
    expect(noteText('VERIFY\r\nIN FIELD  \n')).toEqual({ ok: true, value: 'VERIFY\nIN FIELD' });
    expect(noteText('Baño ½" 90°')).toEqual({ ok: true, value: 'Baño ½" 90°' });
    expect(plainText('“2×4” – it’s')).toBe('"2×4" - it\'s');
    expect(noteText('“quoted” – ok')).toEqual({ ok: true, value: '"quoted" - ok' });
    expect(noteText('price €5')).toEqual({ ok: false, reason: 'unsupported' });
    expect(noteText(' \n ')).toEqual({ ok: true, value: null });
    expect(noteText('x'.repeat(500))).toEqual({ ok: true, value: 'x'.repeat(500) });
    expect(noteText('x'.repeat(501))).toEqual({ ok: false, reason: 'too_long' });
  });

  it("AC-3: a dimension's override is one line; cleared, the measured value shows again", () => {
    expect(overrideText('  EQ ')).toEqual({ ok: true, value: 'EQ' });
    expect(overrideText('two\nlines')).toEqual({ ok: true, value: 'two lines' });
    expect(overrideText('')).toEqual({ ok: true, value: null });
    expect(overrideText('x'.repeat(101))).toEqual({ ok: false, reason: 'too_long' });
  });
});

// The controller: the plan's presses to placed objects in the store.
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

const key = (k: string): ToolKeyEvent => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target: null,
});

function setup(o: { status?: 'existing' | 'new' } = {}) {
  const store = createModelStore({
    objects: withWalls(baseObjects(), 10, [pt(0, 0), pt(150, 0), pt(150, 120)], false),
  });
  const messages: string[] = [];
  let receiver: PlanPointerReceiver | null = null;
  const fromScreen = (s: Point) => pt(s.x / PPI, -s.y / PPI);
  const handle: DrawingHandle = {
    getCursor: () => null,
    getPixelsPerInch: () => PPI,
    modelToScreen: toScreen,
    onCameraChange: () => () => {},
    setPointerReceiver: (r) => void (receiver = r),
    setHoverMode: () => {},
    getHoveredWallId: () => null,
    wallAt: (s) => {
      const m = fromScreen(s);
      if (Math.abs(m.y) < 3 && m.x > 0 && m.x < 150) return uid(10);
      if (Math.abs(m.x - 150) < 3 && m.y > 0 && m.y < 120) return uid(11);
      return null;
    },
  };
  const phase: PhaseSource = {
    version: () => 0,
    shown: () => true,
    subscribe: () => () => {},
    newObjectStatus: () => o.status ?? 'existing',
  };
  let ids: string[] = [];
  let onDouble: ((id: string) => void) | null = null;
  const link: SelectionLink = {
    getUi: () => ({ ids }) as unknown as ReturnType<SelectionLink['getUi']>,
    select: vi.fn((next: readonly string[]) => void (ids = [...next])),
    subscribe: () => () => {},
    onDoubleClick: (fn) => {
      onDouble = fn;
      return () => void (onDouble = null);
    },
  };
  let n = 0;
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit: true },
    onMessage: (k) => void messages.push(k),
    snapSettings: () => SNAP_OFF,
    newId: () => uid(500 + n++),
    phase,
  });
  controller.attachSelection(link);
  const send = (e: PlanPointerEvent) => receiver?.(e);
  const click = (p: Point) => {
    send(ev('move', p));
    send(ev('down', p));
    send(ev('up', p));
  };
  const of = <T>(type: string) =>
    [...store.getState().objects]
      .filter(([, v]) => v.type === type)
      .map(([id, v]) => ({ id, data: v.data as T }));
  return {
    store,
    controller,
    click,
    send,
    of,
    messages,
    link,
    doubleClick: (id: string) => onDouble?.(id),
  };
}

describe('EZD-216 Dimension and Text through the drawing controller', () => {
  it('AC-1, AC-8: the L key turns Dimension on; three clicks place a 12\' 6" dimension, New in Proposed, selected', () => {
    const t = setup({ status: 'new' });
    expect(t.controller.keyDown(key('L'))).toBe(true);
    expect(t.controller.getUi().tool).toBe('dimension');
    expect(t.controller.getUi().dimensionMode).toBe('linear');
    t.click(pt(0, 60));
    t.click(pt(150, 60));
    t.send(ev('move', pt(75, 84)));
    expect(t.controller.getFrame()?.measure).toBe(`12' 6"`);
    t.send(ev('down', pt(75, 84)));
    const dims = t.of<DimensionData>('dimension');
    expect(dims).toHaveLength(1);
    expect(dims[0]!.data.geometry).toEqual({ kind: 'points', from: pt(0, 60), to: pt(150, 60) });
    expect(dims[0]!.data.attributes.offset).toBe(24);
    expect(dims[0]!.data.status).toBe('new');
    expect(dims[0]!.data.level).toBe(F1);
    expect(t.link.select).toHaveBeenLastCalledWith([dims[0]!.id]);
  });

  it('AC-3: a character typed while the line is placed opens the box with it; Enter places with the override', () => {
    const t = setup();
    t.controller.selectTool('dimension');
    t.click(pt(0, 60));
    t.click(pt(150, 60));
    expect(t.controller.keyDown(key('E'))).toBe(true);
    const box = t.controller.getUi().textBox;
    expect(box?.initial).toBe('E');
    expect(box?.multiline).toBe(false);
    expect(box?.at).toEqual(pt(75, 60));
    expect(t.controller.commitText('EQ')).toBe(true);
    expect(t.controller.getUi().textBox).toBeNull();
    expect(t.of<DimensionData>('dimension')[0]!.data.attributes.override).toBe('EQ');
  });

  it('AC-2: Tab switches to Angular; two walls then the arc place an angular dimension of the walls', () => {
    const t = setup();
    t.controller.selectTool('dimension');
    expect(t.controller.keyDown(key('Tab'))).toBe(true);
    expect(t.controller.getUi().dimensionMode).toBe('angular');
    t.click(pt(75, 0.5));
    t.click(pt(150.5, 60));
    t.send(ev('move', pt(120, 30)));
    expect(t.controller.getFrame()?.measure).toBe('90°');
    t.send(ev('down', pt(120, 30)));
    const d = t.of<DimensionData>('dimension')[0]!.data;
    expect(d.geometry).toEqual({ kind: 'walls', wallIds: [uid(10), uid(11)], at: pt(120, 30) });
    expect(d.attributes.kind).toBe('angular');
    t.controller.setDimensionMode('linear');
    expect(t.controller.getUi().dimensionMode).toBe('linear');
  });

  it('AC-5 / Q-0683 (a): T, a click opens the note box; Enter commits the lines; a drag draws a leader', () => {
    const t = setup({ status: 'new' });
    expect(t.controller.keyDown(key('T'))).toBe(true);
    t.click(pt(30, 40));
    expect(t.controller.getUi().textBox).toMatchObject({
      at: pt(30, 40),
      initial: '',
      multiline: true,
    });
    expect(t.controller.commitText('VERIFY\nIN FIELD')).toBe(true);
    const notes = t.of<TextData>('text');
    expect(notes.map((x) => x.data)).toEqual([
      {
        geometry: { position: pt(30, 40), leader: null },
        status: 'new',
        level: F1,
        attributes: { text: 'VERIFY\nIN FIELD', paperSize: '3/32' },
      },
    ]);
    t.send(ev('down', pt(10, 10)));
    t.send(ev('move', pt(40, 30)));
    t.send(ev('up', pt(40, 30)));
    expect(t.controller.getUi().textBox?.at).toEqual(pt(40, 30));
    t.controller.commitText('GFCI');
    const led = t.of<TextData>('text').find((x) => x.data.attributes.text === 'GFCI');
    expect(led?.data.geometry).toEqual({ position: pt(40, 30), leader: pt(10, 10) });
  });

  it('a refused note keeps the box open with a message; Esc in the box (cancelText) places nothing', () => {
    const t = setup();
    t.controller.selectTool('text');
    t.click(pt(30, 40));
    expect(t.controller.commitText('price €5')).toBe(false);
    expect(t.messages).toEqual(['office.tools.text.unsupported']);
    expect(t.controller.getUi().textBox).not.toBeNull();
    t.controller.cancelText();
    expect(t.controller.getUi().textBox).toBeNull();
    expect(t.of('text')).toEqual([]);
    t.click(pt(30, 40));
    expect(t.controller.commitText('   ')).toBe(true);
    expect(t.of('text')).toEqual([]);
    expect(t.controller.keyDown(key('Escape'))).toBe(true);
    expect(t.controller.getUi().tool).toBeNull();
  });

  it('AC-3: a double-click opens the box on a note or a dimension; clearing an override shows the measured value', () => {
    const t = setup();
    t.controller.selectTool('text');
    t.click(pt(30, 40));
    t.controller.commitText('OLD');
    t.controller.selectTool('dimension');
    t.click(pt(0, 60));
    t.click(pt(150, 60));
    t.click(pt(75, 84));
    t.controller.selectTool(null);
    const note = t.of<TextData>('text')[0]!;
    const dim = t.of<DimensionData>('dimension')[0]!;

    t.doubleClick(note.id);
    expect(t.controller.getUi().textBox).toMatchObject({
      initial: 'OLD',
      multiline: true,
      at: pt(30, 40),
    });
    t.controller.commitText('NEW');
    expect(t.of<TextData>('text')[0]!.data.attributes.text).toBe('NEW');

    t.doubleClick(dim.id);
    expect(t.controller.getUi().textBox).toMatchObject({
      initial: '',
      multiline: false,
      at: pt(75, 84),
    });
    t.controller.commitText('VIF');
    expect(t.of<DimensionData>('dimension')[0]!.data.attributes.override).toBe('VIF');
    t.doubleClick(dim.id);
    expect(t.controller.getUi().textBox?.initial).toBe('VIF');
    t.controller.commitText('');
    expect(t.of<DimensionData>('dimension')[0]!.data.attributes.override).toBeNull();
    expect(t.controller.openTextEdit(uid(10))).toBe(false);
  });

  it('a stored dimension and note move with a Select drag', () => {
    const t = setup();
    t.controller.selectTool('text');
    t.click(pt(30, 40));
    t.controller.commitText('NOTE');
    t.controller.selectTool(null);
    const note = t.of<TextData>('text')[0]!;
    t.controller.startDrag([note.id], pt(30, 40));
    t.controller.dragPointer(ev('move', pt(40, 50)));
    t.controller.dragPointer(ev('up', pt(40, 50)));
    expect(t.of<TextData>('text')[0]!.data.geometry.position).toEqual(pt(40, 50));
  });
});
