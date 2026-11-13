// EZD-227 (AC-EZD-227-1, -2, -3; S03:152; Q-0630; Q-0704; 09q Blocking rows 1-4; vault/build/assumptions.md EZD-227).
// Real model store; the canvas handle is a local fake (as tile-shower-tool.test.ts). Expected values worked by hand:
// wall uid(1) runs (0,0) to (120,0), 4.5" thick centred on its line, a lone wall whose corners are its ends. The
// blocking is the 09q test size, 24" long at 34" to centre. At 8/3 px per inch the 10 px capture is 3.75", so a click
// at (60,2) is on the wall's left (start to end, +y north) and centres it at (60,0), spanning 48" to 72". Dragged 30"
// east it sits at (90,0); its wall moved 24" north without it leaves it at (60,0), flagged with axis (1,0).
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SNAP_SETTINGS,
  moveSelection,
  NO_NUMBERS,
  parseStoredObject,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import { deleteChanges } from '../edit/edit-changes';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { createPickIndex } from '../selection/pick-index';
import { createDrawingController, type DrawingHandle } from './drawing-controller';
import { blockingChoice, placeFixture, type FixtureChoice } from './fixture-tool';
import { fixturesModule } from './fixtures-module';
import { blockingsOn, moveEditChanges, wallEditChanges } from './model-changes';
import { dragOutcome, dragTo, startMoveDrag } from './move-tool';
import {
  applyChanges,
  baseObjects,
  F1,
  idSeq,
  objs as wallsAndOpenings,
  uid,
  WHO,
  withWalls,
} from './test-utils/fixtures';

const PPI = 8 / 3;
const pt = (x: number, y: number): Point => ({ x, y });
const toScreen = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
const W = uid(1);
const B = uid(100);
const BLOCK: FixtureChoice = { type: 'blocking', length: 24, heightToCenter: 34 };

const objs = (o: ReturnType<typeof WALL>): ModelObject[] => [
  ...wallsAndOpenings(o),
  ...blockingsOn(o, F1),
];

const WALL = () => withWalls(baseObjects(), 1, [pt(0, 0), pt(120, 0)], false, 'center');

function ev(kind: PlanPointerEvent['kind'], x: number, y: number) {
  return {
    kind,
    model: pt(x, y),
    screen: toScreen(pt(x, y)),
    pointerType: 'mouse',
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  } as PlanPointerEvent;
}

function setup() {
  const store = createModelStore({ objects: WALL() });
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
  const msgs: string[] = [];
  const controller = createDrawingController({
    handle,
    store,
    viewer: { appUserId: WHO, canEdit: true },
    onMessage: (k) => void msgs.push(k),
    newId: idSeq(100),
    snapSettings: () => ({ ...DEFAULT_SNAP_SETTINGS, enabled: false }),
  });
  const send = (e: PlanPointerEvent) => {
    if (receiver === null) throw new Error('no pointer receiver set');
    receiver(e);
  };
  const parsed = (id: string): ModelObject | null => {
    const v = store.getState().objects.get(id);
    if (v === undefined) return null;
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    return r.ok ? r.object : null;
  };
  return { store, controller, send, msgs, parsed };
}

const loaded = async () => {
  await fixturesModule.load();
  await new Promise((r) => setTimeout(r, 0));
};

// The wall with the blocking placed at (60,0) on its left.
function withBlocking() {
  const o = WALL();
  const change = placeFixture(BLOCK, pt(60, 2), {
    level: F1,
    objects: objs(o),
    newId: () => B,
    captureIn: 3.75,
  });
  if (change === null) throw new Error('not placed');
  return applyChanges(o, [change]);
}

const geometryOf = (o: ReturnType<typeof WALL>, id: string) =>
  (o.get(id)?.data as { geometry: unknown } | undefined)?.geometry;

describe('EZD-227 grab-bar blocking', () => {
  it('AC-3 starts with length and height to centre empty; empty or 0 is refused', () => {
    expect(blockingChoice()).toEqual({ type: 'blocking', length: null, heightToCenter: null });
    const ctx = { level: F1, objects: objs(WALL()), newId: idSeq(1), captureIn: 3.75 };
    expect(placeFixture(blockingChoice(), pt(60, 2), ctx)).toBeNull();
    expect(placeFixture({ ...BLOCK, heightToCenter: null }, pt(60, 2), ctx)).toBeNull();
    expect(placeFixture({ ...BLOCK, length: null }, pt(60, 2), ctx)).toBeNull();
    expect(placeFixture({ ...BLOCK, length: 0 }, pt(60, 2), ctx)).toBeNull();
    expect(placeFixture({ ...BLOCK, heightToCenter: 0 }, pt(60, 2), ctx)).toBeNull();
    expect(placeFixture({ ...BLOCK, length: -24 }, pt(60, 2), ctx)).toBeNull();
    expect(placeFixture({ ...BLOCK, heightToCenter: Number.NaN }, pt(60, 2), ctx)).toBeNull();
  });

  it('AC-1 is refused with no wall in reach, or longer than the wall between its corners', () => {
    const ctx = { level: F1, objects: objs(WALL()), newId: idSeq(1), captureIn: 3.75 };
    expect(placeFixture(BLOCK, pt(60, 10), ctx)).toBeNull();
    expect(placeFixture({ ...BLOCK, length: 130 }, pt(60, 2), ctx)).toBeNull();
  });

  it('AC-1 takes the nearest wall and ignores blocking already there', () => {
    const two = withWalls(WALL(), 2, [pt(0, 6), pt(120, 6)], false, 'center');
    const ctx = { level: F1, objects: objs(two), newId: () => B, captureIn: 3.75 };
    const first = placeFixture(BLOCK, pt(60, 2), ctx);
    expect(first?.value?.data).toMatchObject({ geometry: { center: pt(60, 0), hostWallId: W } });
    const withOne = applyChanges(two, [first!]);
    const second = placeFixture(BLOCK, pt(60, 2), { ...ctx, objects: objs(withOne), newId: () => uid(101) });
    expect(second?.value?.data).toMatchObject({ geometry: { center: pt(60, 0), hostWallId: W } });
  });

  it('AC-1, AC-2 a click near a wall stores one blocking object on that wall, on the side clicked', async () => {
    const { controller, send, parsed, store } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(BLOCK);
    send(ev('down', 60, 2));
    expect(parsed(B)).toEqual({
      id: B,
      type: 'blocking',
      data: {
        geometry: { center: pt(60, 0), hostWallId: W, axis: null },
        status: 'existing',
        level: F1,
        attributes: { length: 24, heightToCenter: 34, side: 'left' },
      },
    });
    expect(store.getState().objects.get(B)?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    controller.setFixtureChoice({ ...BLOCK });
    send(ev('down', 30, -3));
    expect(parsed(uid(101))?.data).toMatchObject({
      geometry: { center: pt(30, 0), hostWallId: W },
      attributes: { side: 'right' },
    });
  });

  it('AC-1, AC-3 a click away from every wall, or with no height, places nothing and says why', async () => {
    const { controller, send, msgs, store } = setup();
    controller.selectTool('fixtures');
    await loaded();
    controller.setFixtureChoice(BLOCK);
    send(ev('down', 60, 40));
    controller.setFixtureChoice({ ...BLOCK, heightToCenter: null });
    send(ev('down', 60, 2));
    expect(store.getState().objects.size).toBe(2);
    expect(msgs).toEqual(['office.fixtures.blocking_invalid', 'office.fixtures.blocking_invalid']);
  });

  it('AC-1 a drag slides it along its wall and cannot take it off', () => {
    const o = withBlocking();
    const models = objs(o);
    const drag = startMoveDrag(models, [B], pt(60, 0));
    const along = dragOutcome(dragTo(drag, { objects: models, level: F1, at: pt(90, 3), captureIn: 3.75 }), {
      objects: models,
      at: pt(90, 3),
    });
    expect(along.ok && along.changed.map((x) => x.data)).toEqual([
      expect.objectContaining({ geometry: { center: pt(90, 0), hostWallId: W, axis: null } }),
    ]);
    const off = dragOutcome(dragTo(drag, { objects: models, level: F1, at: pt(60, 100), captureIn: 3.75 }), {
      objects: models,
      at: pt(60, 100),
    });
    expect(off).toEqual({ ok: true, changed: [] });
  });

  it('AC-1 its wall moved without it leaves it where it stands, flagged Not on a wall (09q Blocking row 4)', () => {
    const o = withBlocking();
    const r = moveSelection(objs(o), [W], pt(0, 24));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = applyChanges(o, moveEditChanges(o, F1, r.changed, idSeq(200), NO_NUMBERS));
    expect(geometryOf(next, B)).toEqual({ center: pt(60, 0), hostWallId: null, axis: pt(1, 0) });
    // Moved back onto it, the wall takes it again.
    const back = objs(o).find((x) => x.id === W);
    if (back?.type !== 'wall') throw new Error('no wall');
    const again = applyChanges(next, wallEditChanges(next, F1, [back], idSeq(300), NO_NUMBERS));
    expect(geometryOf(again, B)).toEqual({ center: pt(60, 0), hostWallId: W, axis: null });
  });

  it('AC-1 it moves with its wall when both are selected', () => {
    const o = withBlocking();
    const r = moveSelection(objs(o), [W, B], pt(0, 24));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const next = applyChanges(o, moveEditChanges(o, F1, r.changed, idSeq(200), NO_NUMBERS));
    expect(geometryOf(next, B)).toEqual({ center: pt(60, 24), hostWallId: W, axis: null });
  });

  it('AC-1 deleting its wall flags it; Delete removes a selected blocking', () => {
    const o = withBlocking();
    const gone = applyChanges(o, deleteChanges(o, F1, [W], idSeq(200)));
    expect(geometryOf(gone, B)).toEqual({ center: pt(60, 0), hostWallId: null, axis: pt(1, 0) });
    expect(applyChanges(o, deleteChanges(o, F1, [B], idSeq(200))).has(B)).toBe(false);
  });

  it('AC-1 it picks by its outline behind the wall face', () => {
    const o = withBlocking();
    const index = createPickIndex();
    index.sync(o, F1, []);
    expect(index.pick(pt(60, 1.5), 0.1)).toEqual([B, W]);
    expect(index.pick(pt(80, 1.5), 0.1)).toEqual([W]);
  });
});
